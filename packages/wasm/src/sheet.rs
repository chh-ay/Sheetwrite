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
    debug_assert!(id != NO_STRING, "NO_STRING is expressed by a non-tagged payload");
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
            formulas: HashMap::new(),
            dirty_cells: HashSet::new(),
            all_dirty: false,
            cond_rules: Vec::new(),
        }
    }

    // ── Payload accessors ────────────────────────────────────────────────────

    #[inline]
    pub(crate) fn num_at(&self, i: usize) -> f64 {
        payload_num(self.payload[i])
    }

    #[inline]
    pub(crate) fn str_id_at(&self, i: usize) -> u32 {
        payload_str_id(self.payload[i])
    }

    /// # Safety
    /// `i` must be in-bounds for the cell vectors.
    #[inline]
    pub(crate) unsafe fn payload_unchecked(&self, i: usize) -> u64 {
        unsafe { *self.payload.get_unchecked(i) }
    }

    #[inline]
    pub(crate) fn set_num(&mut self, i: usize, value: f64) {
        self.payload[i] = encode_num(value);
    }

    #[inline]
    pub(crate) fn set_str(&mut self, i: usize, id: u32) {
        self.payload[i] = encode_str_id(id);
    }

    #[inline]
    pub(crate) fn clear_payload(&mut self, i: usize) {
        self.payload[i] = 0;
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

    /// Rebuild the column-major buffers for a new row count, preserving the
    /// overlap `[0, min(old, new))` of every column. Used by structural edits.
    pub(crate) fn resize_rows(&mut self, new_row_count: usize) {
        if new_row_count == self.row_count {
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
