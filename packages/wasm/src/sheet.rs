//! One sheet's column-major scalar grid and its structural edits.

use std::cell::{Cell, RefCell};
use std::collections::{BTreeSet, HashMap, HashSet};

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
    last_access: Cell<u64>,
}

impl CellChunk {
    fn new(rows: usize, last_access: u64) -> Self {
        let words = rows.div_ceil(BITS_PER_WORD);
        Self {
            kind: vec![KIND_EMPTY; rows],
            payload: vec![0; rows],
            style: vec![0; rows],
            loaded: vec![0; words],
            last_access: Cell::new(last_access),
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

    fn byte_len(&self) -> usize {
        self.kind.len()
            + self.payload.len() * std::mem::size_of::<u64>()
            + self.style.len() * std::mem::size_of::<u32>()
            + self.loaded.len() * std::mem::size_of::<u64>()
    }
}

#[derive(Clone, Copy)]
struct DirtyCell {
    payload: u64,
    revision: u64,
    style: u32,
    revision_index: usize,
    kind: u8,
}

struct StorageEntry {
    row: usize,
    col: usize,
    kind: u8,
    payload: u64,
    style: u32,
    dirty_revision: Option<u64>,
}

pub(crate) const DEFAULT_MAX_PAGED_DIRTY_CELLS: usize = 1_000_000;

pub(crate) struct PagedStorage {
    chunk_rows: usize,
    byte_budget: usize,
    max_dirty_cells: usize,
    chunks: HashMap<(usize, usize), CellChunk>,
    dirty: HashMap<(usize, usize), DirtyCell>,
    dirty_by_revision: HashMap<u64, Vec<(usize, usize)>>,
    pinned: HashSet<(usize, usize)>,
    evictable: RefCell<BTreeSet<(u64, usize, usize)>>,
    clock: Cell<u64>,
    eviction_candidate_checks: u64,
    evictions: u64,
}

impl PagedStorage {
    fn new(chunk_rows: usize, byte_budget: usize, max_dirty_cells: usize) -> Self {
        Self {
            chunk_rows: chunk_rows.max(1).next_power_of_two(),
            byte_budget,
            max_dirty_cells,
            chunks: HashMap::new(),
            dirty: HashMap::new(),
            dirty_by_revision: HashMap::new(),
            pinned: HashSet::new(),
            evictable: RefCell::new(BTreeSet::new()),
            clock: Cell::new(0),
            eviction_candidate_checks: 0,
            evictions: 0,
        }
    }

    fn key_offset(&self, row: usize, col: usize) -> ((usize, usize), usize) {
        ((col, row / self.chunk_rows), row % self.chunk_rows)
    }

    fn chunk_bytes(&self) -> usize {
        let words = self.chunk_rows.div_ceil(BITS_PER_WORD);
        self.chunk_rows
            * (std::mem::size_of::<u8>() + std::mem::size_of::<u64>() + std::mem::size_of::<u32>())
            + words * std::mem::size_of::<u64>()
    }

    fn next_access(&self) -> u64 {
        let next = self.clock.get().wrapping_add(1);
        self.clock.set(next);
        next
    }

    fn touch(&self, key: (usize, usize)) {
        let Some(chunk) = self.chunks.get(&key) else {
            return;
        };
        let eligible = !self.pinned.contains(&key);
        let previous = chunk.last_access.get();
        let mut evictable = self.evictable.borrow_mut();
        if eligible {
            evictable.remove(&(previous, key.0, key.1));
        }
        let access = self.next_access();
        chunk.last_access.set(access);
        if eligible {
            evictable.insert((access, key.0, key.1));
        }
    }

    fn evict_for_chunk(&mut self) {
        if self.byte_budget == 0 {
            return;
        }
        let chunk_bytes = self.chunk_bytes();
        while (self.chunks.len() + 1) * chunk_bytes > self.byte_budget {
            let candidate = self.evictable.get_mut().pop_first();
            let Some((_, col, chunk_index)) = candidate else {
                break;
            };
            self.eviction_candidate_checks = self.eviction_candidate_checks.saturating_add(1);
            self.chunks.remove(&(col, chunk_index));
            self.evictions = self.evictions.saturating_add(1);
        }
    }

    fn ensure_chunk(&mut self, key: (usize, usize)) -> &mut CellChunk {
        if !self.chunks.contains_key(&key) {
            self.evict_for_chunk();
            let access = self.next_access();
            self.chunks
                .insert(key, CellChunk::new(self.chunk_rows, access));
            if !self.pinned.contains(&key) {
                self.evictable.get_mut().insert((access, key.0, key.1));
            }
        } else {
            self.touch(key);
        }
        self.chunks.get_mut(&key).expect("inserted paged chunk")
    }

    fn clean_loaded(&self, row: usize, col: usize) -> bool {
        let (key, offset) = self.key_offset(row, col);
        self.chunks
            .get(&key)
            .is_some_and(|chunk| CellChunk::bit(&chunk.loaded, offset))
    }

    fn read(&self, row: usize, col: usize) -> (u8, u64, u32, bool, bool) {
        if let Some(cell) = self.dirty.get(&(row, col)) {
            return (cell.kind, cell.payload, cell.style, true, true);
        }
        let (key, offset) = self.key_offset(row, col);
        let Some(chunk) = self.chunks.get(&key) else {
            return (KIND_EMPTY, 0, 0, false, false);
        };
        self.touch(key);
        if !CellChunk::bit(&chunk.loaded, offset) {
            return (KIND_EMPTY, 0, 0, false, false);
        }
        (
            chunk.kind[offset],
            chunk.payload[offset],
            chunk.style[offset],
            true,
            false,
        )
    }

    fn write_clean(&mut self, row: usize, col: usize, kind: u8, payload: u64, style: u32) {
        let (key, offset) = self.key_offset(row, col);
        let chunk = self.ensure_chunk(key);
        chunk.kind[offset] = kind;
        chunk.payload[offset] = payload;
        chunk.style[offset] = style;
        CellChunk::set_bit(&mut chunk.loaded, offset, true);
    }

    fn can_dirty_cell(&self, row: usize, col: usize) -> bool {
        self.dirty.contains_key(&(row, col)) || self.dirty.len() < self.max_dirty_cells
    }

    fn can_dirty_rect(&self, r0: usize, c0: usize, rows: usize, cols: usize) -> bool {
        let mut additional = 0usize;
        for col in c0..c0 + cols {
            for row in r0..r0 + rows {
                if !self.dirty.contains_key(&(row, col)) {
                    additional += 1;
                    if self.dirty.len() + additional > self.max_dirty_cells {
                        return false;
                    }
                }
            }
        }
        true
    }

    fn reserve_revision_slot(&mut self, revision: u64, key: (usize, usize)) -> Option<usize> {
        if !self.dirty_by_revision.contains_key(&revision)
            && self.dirty_by_revision.try_reserve(1).is_err()
        {
            return None;
        }
        let slots = self.dirty_by_revision.entry(revision).or_default();
        if slots.try_reserve(1).is_err() {
            return None;
        }
        let index = slots.len();
        slots.push(key);
        Some(index)
    }

    fn remove_revision_slot(&mut self, revision: u64, index: usize) {
        let Some(slots) = self.dirty_by_revision.get_mut(&revision) else {
            return;
        };
        let moved = (index + 1 < slots.len()).then(|| slots[slots.len() - 1]);
        slots.swap_remove(index);
        let empty = slots.is_empty();
        if let Some(moved) = moved {
            if let Some(cell) = self.dirty.get_mut(&moved) {
                cell.revision_index = index;
            }
        }
        if empty {
            self.dirty_by_revision.remove(&revision);
        }
    }

    fn write_dirty(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        revision: u64,
    ) -> bool {
        debug_assert_ne!(revision, 0);
        let key = (row, col);
        if let Some(cell) = self.dirty.get(&key).copied() {
            if cell.revision == revision {
                self.dirty.insert(
                    key,
                    DirtyCell {
                        payload,
                        revision,
                        revision_index: cell.revision_index,
                        style,
                        kind,
                    },
                );
                return true;
            }
            let Some(revision_index) = self.reserve_revision_slot(revision, key) else {
                return false;
            };
            self.remove_revision_slot(cell.revision, cell.revision_index);
            self.dirty.insert(
                key,
                DirtyCell {
                    payload,
                    revision,
                    revision_index,
                    style,
                    kind,
                },
            );
            return true;
        }
        if self.dirty.len() >= self.max_dirty_cells || self.dirty.try_reserve(1).is_err() {
            return false;
        }
        let Some(revision_index) = self.reserve_revision_slot(revision, key) else {
            return false;
        };
        self.dirty.insert(
            key,
            DirtyCell {
                payload,
                revision,
                revision_index,
                style,
                kind,
            },
        );
        true
    }

    fn restore_dirty(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        revision: u64,
    ) -> bool {
        self.write_dirty(row, col, kind, payload, style, revision)
    }

    fn write(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        dirty_revision: Option<u64>,
    ) -> bool {
        if let Some(revision) = dirty_revision {
            return self.write_dirty(row, col, kind, payload, style, revision);
        }
        if let Some(cell) = self.dirty.get_mut(&(row, col)) {
            cell.kind = kind;
            cell.payload = payload;
            cell.style = style;
        } else {
            self.write_clean(row, col, kind, payload, style);
        }
        true
    }

    fn hydrate(&mut self, row: usize, col: usize, kind: u8, payload: u64, style: u32) -> bool {
        if self.dirty.contains_key(&(row, col)) {
            return false;
        }
        self.write_clean(row, col, kind, payload, style);
        true
    }

    fn dirty_revision(&self, row: usize, col: usize) -> Option<u64> {
        self.dirty.get(&(row, col)).map(|cell| cell.revision)
    }

    fn mark_clean(&mut self, row: usize, col: usize, revision: Option<u64>) -> bool {
        let key = (row, col);
        let Some(cell) = self.dirty.get(&key).copied() else {
            return false;
        };
        if revision.is_some_and(|expected| expected != cell.revision) {
            return false;
        }
        self.remove_revision_slot(cell.revision, cell.revision_index);
        self.dirty.remove(&key);
        self.write_clean(row, col, cell.kind, cell.payload, cell.style);
        true
    }

    fn acknowledge_revision(&mut self, revision: u64) {
        let Some(matches) = self.dirty_by_revision.remove(&revision) else {
            return;
        };
        for (row, col) in matches {
            let key = (row, col);
            let Some(cell) = self.dirty.get(&key).copied() else {
                continue;
            };
            if cell.revision != revision {
                continue;
            }
            self.dirty.remove(&key);
            self.write_clean(row, col, cell.kind, cell.payload, cell.style);
        }
    }

    fn pin_range(&mut self, r0: usize, r1: usize, cols: &[u32]) {
        let mut next = HashSet::new();
        for &col in cols {
            for chunk in r0 / self.chunk_rows..=r1 / self.chunk_rows {
                next.insert((col as usize, chunk));
            }
        }

        for key in self.pinned.difference(&next) {
            if let Some(chunk) = self.chunks.get(key) {
                self.evictable
                    .get_mut()
                    .insert((chunk.last_access.get(), key.0, key.1));
            }
        }
        for key in next.difference(&self.pinned) {
            if let Some(chunk) = self.chunks.get(key) {
                self.evictable
                    .get_mut()
                    .remove(&(chunk.last_access.get(), key.0, key.1));
            }
        }
        self.pinned = next;
        let access = self.next_access();
        for &key in &self.pinned {
            if let Some(chunk) = self.chunks.get(&key) {
                chunk.last_access.set(access);
            }
        }
    }

    fn entries(&self) -> Vec<StorageEntry> {
        let mut entries = Vec::with_capacity(self.loaded_cells());
        for (&(col, chunk_index), chunk) in &self.chunks {
            for offset in 0..self.chunk_rows {
                if !CellChunk::bit(&chunk.loaded, offset) {
                    continue;
                }
                let row = chunk_index * self.chunk_rows + offset;
                if self.dirty.contains_key(&(row, col)) {
                    continue;
                }
                entries.push(StorageEntry {
                    row,
                    col,
                    kind: chunk.kind[offset],
                    payload: chunk.payload[offset],
                    style: chunk.style[offset],
                    dirty_revision: None,
                });
            }
        }
        entries.extend(self.dirty.iter().map(|(&(row, col), cell)| StorageEntry {
            row,
            col,
            kind: cell.kind,
            payload: cell.payload,
            style: cell.style,
            dirty_revision: Some(cell.revision),
        }));
        entries.sort_unstable_by_key(|entry| (entry.col, entry.row));
        entries
    }

    fn dirty_coordinates(&self) -> Vec<f64> {
        let mut coordinates = Vec::with_capacity(self.dirty.len().saturating_mul(2));
        let mut keys: Vec<_> = self.dirty.keys().copied().collect();
        keys.sort_unstable();
        for (row, col) in keys {
            coordinates.push(row as f64);
            coordinates.push(col as f64);
        }
        coordinates
    }

    fn byte_len(&self) -> usize {
        self.chunks.values().map(CellChunk::byte_len).sum()
    }

    fn dirty_byte_len(&self) -> usize {
        let dirty_cells = self.dirty.capacity()
            * (std::mem::size_of::<(usize, usize)>()
                + std::mem::size_of::<DirtyCell>()
                + std::mem::size_of::<u8>());
        let revision_map = self.dirty_by_revision.capacity()
            * (std::mem::size_of::<u64>()
                + std::mem::size_of::<Vec<(usize, usize)>>()
                + std::mem::size_of::<u8>());
        let revision_cells = self
            .dirty_by_revision
            .values()
            .map(|cells| cells.capacity() * std::mem::size_of::<(usize, usize)>())
            .sum::<usize>();
        dirty_cells + revision_map + revision_cells
    }

    fn loaded_cells(&self) -> usize {
        let clean = self
            .chunks
            .values()
            .map(|chunk| {
                chunk
                    .loaded
                    .iter()
                    .map(|word| word.count_ones() as usize)
                    .sum::<usize>()
            })
            .sum::<usize>();
        clean
            + self
                .dirty
                .keys()
                .filter(|&&(row, col)| !self.clean_loaded(row, col))
                .count()
    }

    fn dirty_cells(&self) -> usize {
        self.dirty.len()
    }
}

pub(crate) const MAX_DENSE_CELLS: usize = 5_000_000;

pub(crate) fn checked_dense_cell_count(n_cols: usize, row_count: usize) -> Option<usize> {
    n_cols
        .checked_mul(row_count)
        .filter(|&cells| cells <= MAX_DENSE_CELLS)
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
        Self::try_new(n_cols, row_count).expect("trusted dense sheet dimensions")
    }

    pub(crate) fn try_new(n_cols: usize, row_count: usize) -> Result<Self, String> {
        let len = checked_dense_cell_count(n_cols, row_count).ok_or_else(|| {
            format!(
                "dense sheet resource limit exceeded: {n_cols} columns by {row_count} rows exceeds {MAX_DENSE_CELLS} cells"
            )
        })?;
        let mut kind = Vec::new();
        kind.try_reserve_exact(len)
            .map_err(|_| "dense sheet allocation failed for cell kinds".to_string())?;
        kind.resize(len, KIND_EMPTY);
        let mut payload = Vec::new();
        payload
            .try_reserve_exact(len)
            .map_err(|_| "dense sheet allocation failed for cell payloads".to_string())?;
        payload.resize(len, 0);
        let mut style = Vec::new();
        style
            .try_reserve_exact(len)
            .map_err(|_| "dense sheet allocation failed for cell styles".to_string())?;
        style.resize(len, 0);

        Ok(SheetData {
            n_cols,
            row_count,
            kind,
            payload,
            style,
            paged: None,
            formulas: HashMap::new(),
            dirty_cells: HashSet::new(),
            all_dirty: false,
            cond_rules: Vec::new(),
        })
    }

    pub(crate) fn new_paged(
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Self {
        Self {
            n_cols,
            row_count,
            kind: Vec::new(),
            payload: Vec::new(),
            style: Vec::new(),
            paged: Some(PagedStorage::new(
                chunk_rows,
                byte_budget,
                max_dirty_cells,
            )),
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
            let (_, payload, style, _, _) = self.paged.as_ref().unwrap().read(row, col);
            let _ = self
                .paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, payload, style, None);
        } else {
            self.kind[index] = kind;
        }
    }

    pub(crate) fn set_style(&mut self, index: usize, style: u32) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(index);
            let (kind, payload, _, _, _) = self.paged.as_ref().unwrap().read(row, col);
            let _ = self
                .paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, payload, style, None);
        } else {
            self.style[index] = style;
        }
    }

    pub(crate) fn can_dirty_cell(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.can_dirty_cell(row, col))
    }

    pub(crate) fn can_dirty_rect(
        &self,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
    ) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.can_dirty_rect(r0, c0, rows, cols))
    }

    pub(crate) fn write_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        dirty_revision: Option<u64>,
    ) -> bool {
        if let Some(paged) = &mut self.paged {
            return paged.write(row, col, kind, payload, style, dirty_revision);
        }
        let index = self.idx(row, col);
        self.kind[index] = kind;
        self.payload[index] = payload;
        self.style[index] = style;
        true
    }

    pub(crate) fn mark_cell_loaded(&mut self, row: usize, col: usize, dirty: bool) {
        if let Some(paged) = &mut self.paged {
            let (kind, payload, style, _, was_dirty) = paged.read(row, col);
            let revision = if dirty {
                Some(paged.dirty_revision(row, col).unwrap_or(1))
            } else {
                None
            };
            let _ = paged.write(row, col, kind, payload, style, revision);
            debug_assert!(!was_dirty || paged.dirty_revision(row, col).is_some());
        }
    }

    pub(crate) fn hydrate_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
    ) -> bool {
        if let Some(paged) = &mut self.paged {
            return paged.hydrate(row, col, kind, payload, style);
        }
        let index = self.idx(row, col);
        self.kind[index] = kind;
        self.payload[index] = payload;
        self.style[index] = style;
        true
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

    pub(crate) fn dirty_revision(&self, row: usize, col: usize) -> Option<u64> {
        self.paged
            .as_ref()
            .and_then(|paged| paged.dirty_revision(row, col))
    }

    pub(crate) fn dirty_coordinates(&self) -> Vec<f64> {
        self.paged
            .as_ref()
            .map_or_else(Vec::new, PagedStorage::dirty_coordinates)
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
                    paged.mark_clean(row, col, None);
                }
            }
        }
    }


    pub(crate) fn mark_cell_clean_revision(
        &mut self,
        row: usize,
        col: usize,
        revision: u64,
    ) -> bool {
        self.paged
            .as_mut()
            .is_some_and(|paged| paged.mark_clean(row, col, Some(revision)))
    }

    pub(crate) fn acknowledge_revision(&mut self, revision: u64) {
        if let Some(paged) = &mut self.paged {
            paged.acknowledge_revision(revision);
        }
    }
    pub(crate) fn pin_range(&mut self, start_row: usize, end_row: usize, cols: &[u32]) {
        if let Some(paged) = &mut self.paged {
            if start_row < end_row {
                paged.pin_range(start_row, end_row - 1, cols);
            }
        }
    }

    pub(crate) fn paged_stats(&self) -> Option<(usize, usize, usize, usize, usize)> {
        self.paged.as_ref().map(|paged| {
            (
                paged.chunks.len(),
                paged.loaded_cells(),
                paged.dirty_cells(),
                paged.byte_len(),
                paged.dirty_byte_len(),
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
            let (kind, _, style, _, _) = self.paged.as_ref().unwrap().read(row, col);
            let _ = self
                .paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, encode_num(value), style, None);
        } else {
            self.payload[i] = encode_num(value);
        }
    }

    #[inline]
    pub(crate) fn set_str(&mut self, i: usize, id: u32) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(i);
            let (kind, _, style, _, _) = self.paged.as_ref().unwrap().read(row, col);
            let _ = self
                .paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, encode_str_id(id), style, None);
        } else {
            self.payload[i] = encode_str_id(id);
        }
    }

    #[inline]
    pub(crate) fn clear_payload(&mut self, i: usize) {
        if self.paged.is_some() {
            let (row, col) = self.coordinates(i);
            let (kind, _, style, _, _) = self.paged.as_ref().unwrap().read(row, col);
            let _ = self
                .paged
                .as_mut()
                .unwrap()
                .write(row, col, kind, 0, style, None);
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
        let mut next = PagedStorage::new(
            current.chunk_rows,
            current.byte_budget,
            current.max_dirty_cells,
        );
        for entry in entries {
            if let Some((new_row, new_col)) = remap(entry.row, entry.col) {
                if new_row < new_rows && new_col < new_cols {
                    if let Some(revision) = entry.dirty_revision {
                        let _ = next.restore_dirty(
                            new_row,
                            new_col,
                            entry.kind,
                            entry.payload,
                            entry.style,
                            revision,
                        );
                    } else {
                        let _ = next.write(
                            new_row,
                            new_col,
                            entry.kind,
                            entry.payload,
                            entry.style,
                            None,
                        );
                    }
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

#[cfg(test)]
mod paged_storage_tests {
    use super::{PagedStorage, SheetData, KIND_EMPTY};

    #[test]
    fn clean_eviction_index_tracks_access_and_pin_transitions() {
        let chunk_bytes = PagedStorage::new(4, 0, 100).chunk_bytes();
        let mut storage = PagedStorage::new(4, 2 * chunk_bytes, 100);
        assert!(storage.write(0, 0, KIND_EMPTY, 0, 0, None));
        assert!(storage.write(4, 0, KIND_EMPTY, 0, 0, None));
        storage.read(0, 0);
        assert!(storage.write(8, 0, KIND_EMPTY, 0, 0, None));
        assert!(storage.chunks.contains_key(&(0, 0)));
        assert!(!storage.chunks.contains_key(&(0, 1)));

        storage.pin_range(0, 3, &[0]);
        assert!(storage.write(12, 0, KIND_EMPTY, 0, 7, Some(1)));
        assert!(storage.write(16, 0, KIND_EMPTY, 0, 0, None));
        assert_eq!(storage.chunks.len(), 2);
        assert!(storage.chunks.contains_key(&(0, 0)));
        assert_eq!(storage.read(12, 0), (KIND_EMPTY, 0, 7, true, true));

        storage.pin_range(16, 19, &[0]);
        assert!(storage.write(20, 0, KIND_EMPTY, 0, 0, None));
        assert_eq!(storage.chunks.len(), 2);
        assert!(storage.chunks.contains_key(&(0, 4)));
        assert!(storage.chunks.contains_key(&(0, 5)));
        assert_eq!(storage.dirty_cells(), 1);
    }
    #[test]
    fn revision_index_cleans_only_cells_still_owned_by_the_acknowledged_write() {
        let mut storage = PagedStorage::new(4, 0, 4);
        assert!(storage.write(0, 0, KIND_EMPTY, 10, 0, Some(7)));
        assert!(storage.write(4, 0, KIND_EMPTY, 20, 0, Some(7)));
        assert!(storage.write(0, 0, KIND_EMPTY, 30, 0, Some(8)));

        storage.acknowledge_revision(7);
        assert_eq!(storage.read(4, 0), (KIND_EMPTY, 20, 0, true, false));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 30, 0, true, true));
        assert_eq!(storage.dirty_cells(), 1);

        storage.acknowledge_revision(8);
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 30, 0, true, false));
        assert_eq!(storage.dirty_cells(), 0);
    }

    #[test]
    fn structural_rebase_preserves_revision_ownership_at_the_moved_cell() {
        let mut sheet = SheetData::new_paged(2, 8, 4, 0, 4);
        assert!(sheet.write_cell(1, 0, KIND_EMPTY, 10, 0, Some(11)));
        assert!(sheet.write_cell(3, 1, KIND_EMPTY, 20, 0, Some(12)));

        sheet.insert_rows(0, 0, 2);
        sheet.insert_cols(0, 0, 1);
        assert_eq!(sheet.paged.as_ref().unwrap().read(3, 1), (KIND_EMPTY, 10, 0, true, true));
        assert_eq!(sheet.paged.as_ref().unwrap().read(5, 2), (KIND_EMPTY, 20, 0, true, true));

        sheet.acknowledge_revision(11);
        assert_eq!(sheet.paged.as_ref().unwrap().read(3, 1), (KIND_EMPTY, 10, 0, true, false));
        assert_eq!(sheet.paged.as_ref().unwrap().read(5, 2), (KIND_EMPTY, 20, 0, true, true));
        sheet.acknowledge_revision(12);
        assert_eq!(sheet.paged.as_ref().unwrap().dirty_cells(), 0);
    }


    #[test]
    fn dirty_overlay_precedes_hydration_survives_eviction_and_cleans_by_revision() {
        let chunk_bytes = PagedStorage::new(4, 0, 2).chunk_bytes();
        let mut storage = PagedStorage::new(4, chunk_bytes, 2);
        assert!(storage.hydrate(0, 0, KIND_EMPTY, 10, 1));
        assert!(storage.write(0, 0, KIND_EMPTY, 20, 2, Some(7)));
        assert!(!storage.hydrate(0, 0, KIND_EMPTY, 30, 3));
        assert!(storage.write(4, 0, KIND_EMPTY, 40, 4, None));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 20, 2, true, true));
        assert_eq!(storage.chunks.len(), 1);
        assert!(!storage.mark_clean(0, 0, Some(6)));
        assert_eq!(storage.dirty_cells(), 1);
        assert!(storage.mark_clean(0, 0, Some(7)));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 20, 2, true, false));
        assert_eq!(storage.dirty_cells(), 0);
    }

    #[test]
    fn dirty_overlay_limit_fails_closed_without_changing_existing_cells() {
        let mut storage = PagedStorage::new(4, 0, 2);
        assert!(storage.write(0, 0, KIND_EMPTY, 1, 0, Some(1)));
        assert!(storage.write(4, 0, KIND_EMPTY, 2, 0, Some(1)));
        assert!(!storage.write(8, 0, KIND_EMPTY, 3, 0, Some(1)));
        assert_eq!(storage.dirty_cells(), 2);
        assert_eq!(storage.read(8, 0), (KIND_EMPTY, 0, 0, false, false));
        assert!(storage.write(0, 0, KIND_EMPTY, 4, 0, Some(2)));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 4, 0, true, true));
    }

    #[test]
    fn cache_churn_examines_one_index_entry_per_eviction() {
        const RETAINED: usize = 8;
        const CHUNKS: usize = 10_000;
        let chunk_bytes = PagedStorage::new(4, 0, 100).chunk_bytes();
        let mut storage = PagedStorage::new(4, RETAINED * chunk_bytes, 100);

        for chunk in 0..CHUNKS {
            assert!(storage.write(chunk * 4, 0, KIND_EMPTY, 0, 0, None));
        }

        assert_eq!(storage.chunks.len(), RETAINED);
        assert_eq!(storage.evictions, (CHUNKS - RETAINED) as u64);
        assert_eq!(storage.eviction_candidate_checks, storage.evictions);
    }
}
