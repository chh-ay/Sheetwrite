//! One sheet's column-major scalar grid and its structural edits.

use std::collections::{HashMap, HashSet};

use crate::types::{CellKey, FormulaEntry, FormulaError, KIND_EMPTY, NO_STRING};

/// One conditional-format predicate, mirroring the host's rule kinds. String
/// needles for case-insensitive `Contains` are pre-lowercased at rule-set time
/// so the per-cell match never allocates.
pub(crate) enum CondPred {
    GtNum(f64),
    LtNum(f64),
    EqNum(f64),
    EqStr(String),
    EqEmpty,
    Contains { needle: String, match_case: bool },
}

/// One conditional-format rule: a normalized cell rectangle plus a predicate.
/// The window read reports per-cell matches as a bitmask (rule index = bit),
/// so the host merges styles only for matched cells; predicates evaluate here,
/// where the cell data lives.
pub(crate) struct CondRule {
    pub(crate) r0: u32,
    pub(crate) c0: u32,
    pub(crate) r1: u32,
    pub(crate) c1: u32,
    pub(crate) pred: CondPred,
}

// ── NaN-boxed cell payload ───────────────────────────────────────────────────
//
// One u64 per cell replaces the old pair of vectors (`num: Vec<f64>` +
// `str_id: Vec<u32>`): 8 bytes instead of 12 per cell, and one cache stream
// fewer on every scan. `kind` stays the discriminator; the payload holds
// canonical f64 bits for numbers and `STR_TAG | id` for string-pool ids.
// Numeric writes canonicalize NaN, so the tag surface (a negative signaling
// NaN pattern) can never be produced by a number.

const STR_TAG_HI: u64 = 0xFFFC_0000;
const STR_TAG: u64 = STR_TAG_HI << 32;
const CANON_NAN: u64 = 0x7FF8_0000_0000_0000;

#[inline]
pub(crate) fn encode_num(value: f64) -> u64 {
    if value.is_nan() {
        CANON_NAN
    } else {
        value.to_bits()
    }
}

#[inline]
pub(crate) fn encode_str_id(id: u32) -> u64 {
    debug_assert!(
        id != NO_STRING,
        "NO_STRING is expressed by a non-tagged payload"
    );
    STR_TAG | u64::from(id)
}

#[inline]
pub(crate) fn payload_is_str(bits: u64) -> bool {
    (bits >> 32) == STR_TAG_HI
}

/// Numeric view of a payload; string-tagged payloads read as `0.0`, matching
/// the old always-present `num` vector (writers zeroed `num` on string sets).
#[inline]
pub(crate) fn payload_num(bits: u64) -> f64 {
    if payload_is_str(bits) {
        0.0
    } else {
        f64::from_bits(bits)
    }
}

/// String-pool view of a payload; non-tagged payloads read as `NO_STRING`.
#[inline]
pub(crate) fn payload_str_id(bits: u64) -> u32 {
    if payload_is_str(bits) {
        bits as u32
    } else {
        NO_STRING
    }
}

pub(crate) const DEFAULT_PAGE_CHUNK_ROWS: usize = 4096;
const BITS_PER_WORD: usize = 64;

struct CellChunk {
    kind: Vec<u8>,
    payload: Vec<u64>,
    style: Vec<u32>,
    loaded: Vec<u64>,
    dirty: Vec<u64>,
    last_access: u64,
}

impl CellChunk {
    fn new(rows: usize, last_access: u64) -> Self {
        let words = rows.div_ceil(BITS_PER_WORD);
        Self {
            kind: vec![KIND_EMPTY; rows],
            payload: vec![0; rows],
            style: vec![0; rows],
            loaded: vec![0; words],
            dirty: vec![0; words],
            last_access,
        }
    }

    fn bit(bits: &[u64], offset: usize) -> bool {
        bits[offset / BITS_PER_WORD] & (1 << (offset % BITS_PER_WORD)) != 0
    }

    fn set_bit(bits: &mut [u64], offset: usize, value: bool) {
        let mask = 1 << (offset % BITS_PER_WORD);
        let word = &mut bits[offset / BITS_PER_WORD];
        if value {
            *word |= mask;
        } else {
            *word &= !mask;
        }
    }

    fn has_dirty(&self) -> bool {
        self.dirty.iter().any(|word| *word != 0)
    }

    fn byte_len(&self) -> usize {
        self.kind.len()
            + self.payload.len() * std::mem::size_of::<u64>()
            + self.style.len() * std::mem::size_of::<u32>()
            + (self.loaded.len() + self.dirty.len()) * std::mem::size_of::<u64>()
    }
}

pub(crate) struct PagedStorage {
    chunk_rows: usize,
    byte_budget: usize,
    chunks: HashMap<(usize, usize), CellChunk>,
    pinned: HashSet<(usize, usize)>,
    clock: u64,
}

impl PagedStorage {
    fn new(chunk_rows: usize, byte_budget: usize) -> Self {
        Self {
            chunk_rows: chunk_rows.max(1).next_power_of_two(),
            byte_budget,
            chunks: HashMap::new(),
            pinned: HashSet::new(),
            clock: 0,
        }
    }

    fn key_offset(&self, row: usize, col: usize) -> ((usize, usize), usize) {
        ((col, row / self.chunk_rows), row % self.chunk_rows)
    }

    fn chunk_bytes(&self) -> usize {
        let words = self.chunk_rows.div_ceil(BITS_PER_WORD);
        self.chunk_rows
            * (std::mem::size_of::<u8>() + std::mem::size_of::<u64>() + std::mem::size_of::<u32>())
            + words * std::mem::size_of::<u64>() * 2
    }

    fn evict_for_chunk(&mut self) {
        if self.byte_budget == 0 {
            return;
        }
        let chunk_bytes = self.chunk_bytes();
        while (self.chunks.len() + 1) * chunk_bytes > self.byte_budget {
            let candidate = self
                .chunks
                .iter()
                .filter(|(key, chunk)| !self.pinned.contains(key) && !chunk.has_dirty())
                .min_by_key(|(_, chunk)| chunk.last_access)
                .map(|(key, _)| *key);
            let Some(key) = candidate else {
                break;
            };
            self.chunks.remove(&key);
        }
    }

    fn ensure_chunk(&mut self, key: (usize, usize)) -> &mut CellChunk {
        if !self.chunks.contains_key(&key) {
            self.evict_for_chunk();
            self.clock = self.clock.wrapping_add(1);
            self.chunks
                .insert(key, CellChunk::new(self.chunk_rows, self.clock));
        }
        self.clock = self.clock.wrapping_add(1);
        let chunk = self.chunks.get_mut(&key).expect("inserted paged chunk");
        chunk.last_access = self.clock;
        chunk
    }

    fn read(&self, row: usize, col: usize) -> (u8, u64, u32, bool, bool) {
        let (key, offset) = self.key_offset(row, col);
        let Some(chunk) = self.chunks.get(&key) else {
            return (KIND_EMPTY, 0, 0, false, false);
        };
        if !CellChunk::bit(&chunk.loaded, offset) {
            return (KIND_EMPTY, 0, 0, false, false);
        }
        (
            chunk.kind[offset],
            chunk.payload[offset],
            chunk.style[offset],
            true,
            CellChunk::bit(&chunk.dirty, offset),
        )
    }

    fn write(&mut self, row: usize, col: usize, kind: u8, payload: u64, style: u32, dirty: bool) {
        let (key, offset) = self.key_offset(row, col);
        let chunk = self.ensure_chunk(key);
        chunk.kind[offset] = kind;
        chunk.payload[offset] = payload;
        chunk.style[offset] = style;
        CellChunk::set_bit(&mut chunk.loaded, offset, true);
        if dirty {
            CellChunk::set_bit(&mut chunk.dirty, offset, true);
        }
    }

    fn mark_clean(&mut self, row: usize, col: usize) {
        let (key, offset) = self.key_offset(row, col);
        if let Some(chunk) = self.chunks.get_mut(&key) {
            CellChunk::set_bit(&mut chunk.dirty, offset, false);
        }
    }

    fn pin_range(&mut self, r0: usize, r1: usize, cols: &[u32]) {
        self.pinned.clear();
        for &col in cols {
            for chunk in r0 / self.chunk_rows..=r1 / self.chunk_rows {
                let key = (col as usize, chunk);
                self.pinned.insert(key);
                if let Some(existing) = self.chunks.get_mut(&key) {
                    self.clock = self.clock.wrapping_add(1);
                    existing.last_access = self.clock;
                }
            }
        }
    }

    fn entries(&self) -> Vec<(usize, usize, u8, u64, u32, bool)> {
        let mut entries = Vec::with_capacity(self.loaded_cells());
        for (&(col, chunk_index), chunk) in &self.chunks {
            for offset in 0..self.chunk_rows {
                if !CellChunk::bit(&chunk.loaded, offset) {
                    continue;
                }
                entries.push((
                    chunk_index * self.chunk_rows + offset,
                    col,
                    chunk.kind[offset],
                    chunk.payload[offset],
                    chunk.style[offset],
                    CellChunk::bit(&chunk.dirty, offset),
                ));
            }
        }
        entries
    }

    fn byte_len(&self) -> usize {
        self.chunks.values().map(CellChunk::byte_len).sum()
    }

    fn loaded_cells(&self) -> usize {
        self.chunks
            .values()
            .map(|chunk| {
                chunk
                    .loaded
                    .iter()
                    .map(|word| word.count_ones() as usize)
                    .sum::<usize>()
            })
            .sum()
    }

    fn dirty_cells(&self) -> usize {
        self.chunks
            .values()
            .map(|chunk| {
                chunk
                    .dirty
                    .iter()
                    .map(|word| word.count_ones() as usize)
                    .sum::<usize>()
            })
            .sum()
    }
}

/// One sheet's column-major scalar grid.
pub(crate) struct SheetData {
    pub(crate) n_cols: usize,
    pub(crate) row_count: usize,
    /// `kind[col * row_count + row]`
    pub(crate) kind: Vec<u8>,
    /// NaN-boxed value payload (see module header); `0` when empty.
    pub(crate) payload: Vec<u64>,
    /// Host style-dictionary id; `0` means "no explicit style".
    pub(crate) style: Vec<u32>,
    paged: Option<PagedStorage>,
    /// Arithmetic formulas keyed by (row, col); successful results cache in the payload.
    pub(crate) formulas: HashMap<CellKey, FormulaEntry>,
    /// Cells changed since the last transaction-barrier formula recompute.
    pub(crate) dirty_cells: HashSet<CellKey>,
    /// Bulk load / structural rewrite touched (potentially) every cell; the
    /// recompute pass seeds from the dependency index instead of enumerating
    /// per-cell dirty keys, keeping `dirty_cells` O(interactive edits).
    pub(crate) all_dirty: bool,
    /// Conditional-format rules, synced from the host; evaluated per window.
    pub(crate) cond_rules: Vec<CondRule>,
}

impl SheetData {
    pub(crate) fn new(n_cols: usize, row_count: usize) -> Self {
        let len = n_cols.checked_mul(row_count).unwrap_or(0);
        let (n_cols, row_count) = if len == 0 && n_cols != 0 && row_count != 0 {
            (0, 0)
        } else {
            (n_cols, row_count)
        };

        SheetData {
            n_cols,
            row_count,
            kind: vec![KIND_EMPTY; len],
            payload: vec![0; len],
            style: vec![0; len],
            paged: None,
            formulas: HashMap::new(),
            dirty_cells: HashSet::new(),
            all_dirty: false,
            cond_rules: Vec::new(),
        }
    }

    pub(crate) fn new_paged(
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
    ) -> Self {
        Self {
            n_cols,
            row_count,
            kind: Vec::new(),
            payload: Vec::new(),
            style: Vec::new(),
            paged: Some(PagedStorage::new(chunk_rows, byte_budget)),
            formulas: HashMap::new(),
            dirty_cells: HashSet::new(),
            all_dirty: false,
            cond_rules: Vec::new(),
        }
    }

    pub(crate) fn is_paged(&self) -> bool {
        self.paged.is_some()
    }

    fn coordinates(&self, index: usize) -> (usize, usize) {
        (index % self.row_count, index / self.row_count)
    }

    #[inline]
    pub(crate) fn kind_at(&self, index: usize) -> u8 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            paged.read(row, col).0
        } else {
            self.kind[index]
        }
    }

    #[inline]
    pub(crate) fn style_at(&self, index: usize) -> u32 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            paged.read(row, col).2
        } else {
            self.style[index]
        }
    }

    pub(crate) fn set_kind(&mut self, index: usize, kind: u8) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(index);
            let (_, payload, style, _, dirty) = self.paged.as_ref().unwrap().read(row, col);
            self.paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, payload, style, dirty);
        } else {
            self.kind[index] = kind;
        }
    }

    pub(crate) fn set_style(&mut self, index: usize, style: u32) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(index);
            let (kind, payload, _, _, dirty) = self.paged.as_ref().unwrap().read(row, col);
            self.paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, payload, style, dirty);
        } else {
            self.style[index] = style;
        }
    }

    pub(crate) fn mark_cell_loaded(&mut self, row: usize, col: usize, dirty: bool) {
        if let Some(paged) = &mut self.paged {
            let (kind, payload, style, _, was_dirty) = paged.read(row, col);
            paged.write(row, col, kind, payload, style, dirty || was_dirty);
        }
    }

    pub(crate) fn is_loaded(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.read(row, col).3)
    }

    pub(crate) fn is_cell_dirty(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_some_and(|paged| paged.read(row, col).4)
    }

    pub(crate) fn mark_range_clean(
        &mut self,
        start_row: usize,
        end_row: usize,
        start_col: usize,
        end_col: usize,
    ) {
        if let Some(paged) = &mut self.paged {
            for col in start_col..end_col {
                for row in start_row..end_row {
                    paged.mark_clean(row, col);
                }
            }
        }
    }

    pub(crate) fn pin_range(&mut self, start_row: usize, end_row: usize, cols: &[u32]) {
        if let Some(paged) = &mut self.paged {
            if start_row < end_row {
                paged.pin_range(start_row, end_row - 1, cols);
            }
        }
    }

    pub(crate) fn paged_stats(&self) -> Option<(usize, usize, usize, usize)> {
        self.paged.as_ref().map(|paged| {
            (
                paged.chunks.len(),
                paged.loaded_cells(),
                paged.dirty_cells(),
                paged.byte_len(),
            )
        })
    }

    pub(crate) fn is_fully_loaded(&self) -> bool {
        self.paged.as_ref().is_none_or(|paged| {
            self.row_count
                .checked_mul(self.n_cols)
                .is_some_and(|cells| paged.loaded_cells() >= cells)
        })
    }

    pub(crate) fn range_fully_loaded(&self, r0: usize, c0: usize, r1: usize, c1: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| (c0..=c1).all(|col| (r0..=r1).all(|row| paged.read(row, col).3)))
    }

    // ── Payload accessors ────────────────────────────────────────────────────

    #[inline]
    pub(crate) fn num_at(&self, i: usize) -> f64 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(i);
            payload_num(paged.read(row, col).1)
        } else {
            payload_num(self.payload[i])
        }
    }

    #[inline]
    pub(crate) fn str_id_at(&self, i: usize) -> u32 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(i);
            payload_str_id(paged.read(row, col).1)
        } else {
            payload_str_id(self.payload[i])
        }
    }

    /// # Safety
    /// `i` must be in-bounds for the cell vectors.
    #[inline]
    pub(crate) unsafe fn payload_unchecked(&self, i: usize) -> u64 {
        unsafe { *self.payload.get_unchecked(i) }
    }

    #[inline]
    pub(crate) fn set_num(&mut self, i: usize, value: f64) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(i);
            let (kind, _, style, _, dirty) = self.paged.as_ref().unwrap().read(row, col);
            self.paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, encode_num(value), style, dirty);
        } else {
            self.payload[i] = encode_num(value);
        }
    }

    #[inline]
    pub(crate) fn set_str(&mut self, i: usize, id: u32) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(i);
            let (kind, _, style, _, dirty) = self.paged.as_ref().unwrap().read(row, col);
            self.paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, encode_str_id(id), style, dirty);
        } else {
            self.payload[i] = encode_str_id(id);
        }
    }

    #[inline]
    pub(crate) fn clear_payload(&mut self, i: usize) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(i);
            let (kind, _, style, _, dirty) = self.paged.as_ref().unwrap().read(row, col);
            self.paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, 0, style, dirty);
        } else {
            self.payload[i] = 0;
        }
    }

    #[inline]
    pub(crate) fn contains_cell(&self, row: usize, col: usize) -> bool {
        row < self.row_count && col < self.n_cols
    }

    #[inline]
    pub(crate) fn idx(&self, row: usize, col: usize) -> usize {
        col * self.row_count + row
    }

    /// Reset dirty tracking after a recompute pass. Drops oversized capacity —
    /// `HashSet::clear` walks every retained bucket, so a set inflated by one
    /// giant paste must not tax every later single-cell transaction.
    pub(crate) fn clear_dirty(&mut self) {
        self.all_dirty = false;
        if self.dirty_cells.capacity() > 4096 {
            self.dirty_cells = HashSet::new();
        } else {
            self.dirty_cells.clear();
        }
    }

    fn remap_paged<F>(&mut self, new_rows: usize, new_cols: usize, mut remap: F)
    where
        F: FnMut(usize, usize) -> Option<(usize, usize)>,
    {
        let Some(current) = self.paged.take() else {
            return;
        };
        let entries = current.entries();
        let mut next = PagedStorage::new(current.chunk_rows, current.byte_budget);
        for (row, col, kind, payload, style, dirty) in entries {
            if let Some((new_row, new_col)) = remap(row, col) {
                if new_row < new_rows && new_col < new_cols {
                    next.write(new_row, new_col, kind, payload, style, dirty);
                }
            }
        }
        self.row_count = new_rows;
        self.n_cols = new_cols;
        self.paged = Some(next);
    }

    /// Rebuild the column-major buffers for a new row count, preserving the
    /// overlap `[0, min(old, new))` of every column. Used by structural edits.
    pub(crate) fn resize_rows(&mut self, new_row_count: usize) {
        if new_row_count == self.row_count {
            return;
        }
        if self.is_paged() {
            self.remap_paged(new_row_count, self.n_cols, |row, col| {
                (row < new_row_count).then_some((row, col))
            });
            self.formulas.retain(|&(row, col), _| {
                (row as usize) < new_row_count && (col as usize) < self.n_cols
            });
            self.clear_dirty();
            self.all_dirty = true;
            return;
        }

        let Some(new_len) = self.n_cols.checked_mul(new_row_count) else {
            return;
        };

        let keep = self.row_count.min(new_row_count);
        let mut kind = vec![KIND_EMPTY; new_len];
        let mut payload = vec![0u64; new_len];
        let mut style = vec![0u32; new_len];

        for col in 0..self.n_cols {
            let old_base = col * self.row_count;
            let new_base = col * new_row_count;

            kind[new_base..new_base + keep].copy_from_slice(&self.kind[old_base..old_base + keep]);
            payload[new_base..new_base + keep]
                .copy_from_slice(&self.payload[old_base..old_base + keep]);
            style[new_base..new_base + keep]
                .copy_from_slice(&self.style[old_base..old_base + keep]);
        }

        self.kind = kind;
        self.payload = payload;
        self.style = style;
        self.row_count = new_row_count;

        self.formulas.retain(|&(row, col), _| {
            (row as usize) < new_row_count && (col as usize) < self.n_cols
        });
        self.clear_dirty();
        self.all_dirty = true;
    }

    /// Shift rows `[at, row_count)` down by `count`, opening a blank gap.
    pub(crate) fn insert_rows(&mut self, sheet: u32, at: usize, count: usize) {
        if count == 0 {
            return;
        }

        let at = at.min(self.row_count);
        let old = self.row_count;
        let Some(new_count) = old.checked_add(count) else {
            return;
        };

        if self.is_paged() {
            self.remap_paged(new_count, self.n_cols, |row, col| {
                Some((if row >= at { row + count } else { row }, col))
            });
            if !self.formulas.is_empty() {
                let (at_u, count_u) = (at as u32, count as u32);
                let moved = std::mem::take(&mut self.formulas);
                for ((row, col), mut entry) in moved {
                    entry.shift_rows(at_u, i64::from(count_u), sheet, sheet);
                    let new_row = if row >= at_u {
                        row.saturating_add(count_u)
                    } else {
                        row
                    };
                    self.formulas.insert((new_row, col), entry);
                }
            }
            self.clear_dirty();
            self.all_dirty = true;
            return;
        }

        self.resize_rows(new_count);
        let rc = self.row_count;

        for col in 0..self.n_cols {
            let base = col * rc;

            self.kind
                .copy_within(base + at..base + old, base + at + count);
            self.payload
                .copy_within(base + at..base + old, base + at + count);
            self.style
                .copy_within(base + at..base + old, base + at + count);

            for i in base + at..base + at + count {
                self.kind[i] = KIND_EMPTY;
                self.payload[i] = 0;
                self.style[i] = 0;
            }
        }

        if !self.formulas.is_empty() {
            let (at_u, count_u) = (at as u32, count as u32);
            let moved = std::mem::take(&mut self.formulas);
            for ((row, col), mut entry) in moved {
                entry.shift_rows(at_u, i64::from(count_u), sheet, sheet);
                let new_row = if row >= at_u {
                    row.saturating_add(count_u)
                } else {
                    row
                };
                self.formulas.insert((new_row, col), entry);
            }
        }

        self.clear_dirty();
        self.all_dirty = true;
    }

    /// Delete `count` rows starting at `at`, closing the gap.
    pub(crate) fn delete_rows(&mut self, sheet: u32, at: usize, count: usize) {
        if count == 0 || at >= self.row_count {
            return;
        }

        let count = count.min(self.row_count - at);
        let old = self.row_count;

        if self.is_paged() {
            self.remap_paged(old - count, self.n_cols, |row, col| {
                if row >= at && row < at + count {
                    None
                } else {
                    Some((if row >= at + count { row - count } else { row }, col))
                }
            });
            if !self.formulas.is_empty() {
                let (at_u, count_u) = (at as u32, count as u32);
                let moved = std::mem::take(&mut self.formulas);
                for ((row, col), mut entry) in moved {
                    if row >= at_u && row < at_u.saturating_add(count_u) {
                        continue;
                    }
                    entry.shift_rows(at_u, -i64::from(count_u), sheet, sheet);
                    let new_row = if row >= at_u.saturating_add(count_u) {
                        row - count_u
                    } else {
                        row
                    };
                    self.formulas.insert((new_row, col), entry);
                }
            }
            self.clear_dirty();
            self.all_dirty = true;
            return;
        }

        for col in 0..self.n_cols {
            let base = col * old;

            self.kind
                .copy_within(base + at + count..base + old, base + at);
            self.payload
                .copy_within(base + at + count..base + old, base + at);
            self.style
                .copy_within(base + at + count..base + old, base + at);
        }

        if !self.formulas.is_empty() {
            let (at_u, count_u) = (at as u32, count as u32);
            let moved = std::mem::take(&mut self.formulas);
            for ((row, col), mut entry) in moved {
                if row >= at_u && row < at_u.saturating_add(count_u) {
                    continue;
                }
                entry.shift_rows(at_u, -i64::from(count_u), sheet, sheet);
                let new_row = if row >= at_u.saturating_add(count_u) {
                    row - count_u
                } else {
                    row
                };
                self.formulas.insert((new_row, col), entry);
            }
        }

        self.resize_rows(old - count);
        self.clear_dirty();
        self.all_dirty = true;
    }

    /// Shift columns `[at, n_cols)` right by `count`, opening blank columns.
    pub(crate) fn insert_cols(&mut self, sheet: u32, at: usize, count: usize) {
        if count == 0 {
            return;
        }

        let at = at.min(self.n_cols);
        let old_cols = self.n_cols;
        let Some(new_cols) = old_cols.checked_add(count) else {
            return;
        };
        if self.is_paged() {
            self.remap_paged(self.row_count, new_cols, |row, col| {
                Some((row, if col >= at { col + count } else { col }))
            });
            if !self.formulas.is_empty() {
                let (at_u, count_u) = (at as u32, count as u32);
                let moved = std::mem::take(&mut self.formulas);
                for ((row, col), mut entry) in moved {
                    entry.shift_cols(at_u, i64::from(count_u), sheet, sheet);
                    let new_col = if col >= at_u {
                        col.saturating_add(count_u)
                    } else {
                        col
                    };
                    self.formulas.insert((row, new_col), entry);
                }
            }
            self.clear_dirty();
            self.all_dirty = true;
            return;
        }

        let Some(new_len) = new_cols.checked_mul(self.row_count) else {
            return;
        };

        let mut kind = vec![KIND_EMPTY; new_len];
        let mut payload = vec![0u64; new_len];
        let mut style = vec![0u32; new_len];

        for old_col in 0..old_cols {
            let new_col = if old_col >= at {
                old_col + count
            } else {
                old_col
            };
            let old_base = old_col * self.row_count;
            let new_base = new_col * self.row_count;
            let rows = self.row_count;
            kind[new_base..new_base + rows].copy_from_slice(&self.kind[old_base..old_base + rows]);
            payload[new_base..new_base + rows]
                .copy_from_slice(&self.payload[old_base..old_base + rows]);
            style[new_base..new_base + rows]
                .copy_from_slice(&self.style[old_base..old_base + rows]);
        }

        self.kind = kind;
        self.payload = payload;
        self.style = style;
        self.n_cols = new_cols;

        if !self.formulas.is_empty() {
            let (at_u, count_u) = (at as u32, count as u32);
            let moved = std::mem::take(&mut self.formulas);
            for ((row, col), mut entry) in moved {
                entry.shift_cols(at_u, i64::from(count_u), sheet, sheet);
                let new_col = if col >= at_u {
                    col.saturating_add(count_u)
                } else {
                    col
                };
                self.formulas.insert((row, new_col), entry);
            }
        }

        self.clear_dirty();
        self.all_dirty = true;
    }

    /// Delete `count` columns starting at `at`, closing the gap.
    pub(crate) fn delete_cols(&mut self, sheet: u32, at: usize, count: usize) {
        if count == 0 || at >= self.n_cols {
            return;
        }

        let count = count.min(self.n_cols - at);
        let old_cols = self.n_cols;
        let new_cols = old_cols - count;
        if self.is_paged() {
            self.remap_paged(self.row_count, new_cols, |row, col| {
                if col >= at && col < at + count {
                    None
                } else {
                    Some((row, if col >= at + count { col - count } else { col }))
                }
            });
            if !self.formulas.is_empty() {
                let (at_u, count_u) = (at as u32, count as u32);
                let moved = std::mem::take(&mut self.formulas);
                for ((row, col), mut entry) in moved {
                    if col >= at_u && col < at_u.saturating_add(count_u) {
                        continue;
                    }
                    entry.shift_cols(at_u, -i64::from(count_u), sheet, sheet);
                    let new_col = if col >= at_u.saturating_add(count_u) {
                        col - count_u
                    } else {
                        col
                    };
                    self.formulas.insert((row, new_col), entry);
                }
            }
            self.clear_dirty();
            self.all_dirty = true;
            return;
        }

        let Some(new_len) = new_cols.checked_mul(self.row_count) else {
            return;
        };

        let mut kind = vec![KIND_EMPTY; new_len];
        let mut payload = vec![0u64; new_len];
        let mut style = vec![0u32; new_len];

        for old_col in 0..old_cols {
            if old_col >= at && old_col < at + count {
                continue;
            }
            let new_col = if old_col >= at + count {
                old_col - count
            } else {
                old_col
            };
            let old_base = old_col * self.row_count;
            let new_base = new_col * self.row_count;
            let rows = self.row_count;
            kind[new_base..new_base + rows].copy_from_slice(&self.kind[old_base..old_base + rows]);
            payload[new_base..new_base + rows]
                .copy_from_slice(&self.payload[old_base..old_base + rows]);
            style[new_base..new_base + rows]
                .copy_from_slice(&self.style[old_base..old_base + rows]);
        }

        self.kind = kind;
        self.payload = payload;
        self.style = style;
        self.n_cols = new_cols;

        if !self.formulas.is_empty() {
            let (at_u, count_u) = (at as u32, count as u32);
            let moved = std::mem::take(&mut self.formulas);
            for ((row, col), mut entry) in moved {
                if col >= at_u && col < at_u.saturating_add(count_u) {
                    continue;
                }
                entry.shift_cols(at_u, -i64::from(count_u), sheet, sheet);
                let new_col = if col >= at_u.saturating_add(count_u) {
                    col - count_u
                } else {
                    col
                };
                self.formulas.insert((row, new_col), entry);
            }
        }

        self.clear_dirty();
        self.all_dirty = true;
    }
}

pub(crate) fn formula_error_at(sheet: &SheetData, key: CellKey) -> Option<FormulaError> {
    sheet.formulas.get(&key).and_then(|entry| entry.error)
}
