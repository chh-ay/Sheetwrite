//! The workbook-wide store: sheet management, cell reads/writes, bulk loads.

use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{BuildHasherDefault, Hash, Hasher};

use wasm_bindgen::prelude::*;

use crate::calc::{parse, resolve_sheet_refs};
use crate::eval::{bool_text, DepIndex};
use crate::sheet::{formula_error_at, payload_num, payload_str_id, CondPred, CondRule, SheetData};
use crate::types::{
    cell_key, string_from_pool, FormulaEntry, FormulaValueKind, StringPool, KIND_EMPTY,
    KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

pub(crate) enum InternSlot {
    One(u32),
    Many(Vec<u32>),
}

/// The intern map's keys are already 64-bit string hashes; re-hashing them
/// through SipHash on every probe is pure waste. This hasher passes the key
/// through untouched, halving the hashing work per intern.
#[derive(Default)]
pub(crate) struct IdentityHasher(u64);

impl Hasher for IdentityHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, _: &[u8]) {
        unreachable!("IdentityHasher is only used with u64 keys");
    }

    fn write_u64(&mut self, n: u64) {
        self.0 = n;
    }
}

/// Opaque, store-local history payload for one dense rectangular cell block.
///
/// The host may retain this object in undo history, but it is deliberately not
/// part of the serialized document protocol. String payloads remain interned in
/// the owning `CellStore`, so snapshots must only be restored into that store.
#[wasm_bindgen]
pub struct RangeSnapshot {
    rows: usize,
    cols: usize,
    kind: Vec<u8>,
    payload: Vec<u64>,
    style: Vec<u32>,
    formulas: Vec<(u32, u32, FormulaEntry)>,
}

#[wasm_bindgen]
impl RangeSnapshot {
    #[wasm_bindgen(js_name = formulaOffsets)]
    pub fn formula_offsets(&self) -> Vec<u32> {
        let mut offsets = Vec::with_capacity(self.formulas.len() * 2);
        for (row, col, _) in &self.formulas {
            offsets.push(*row);
            offsets.push(*col);
        }
        offsets
    }

    #[wasm_bindgen(js_name = kinds)]
    pub fn kinds(&self) -> Vec<u8> {
        self.kind.clone()
    }

    #[wasm_bindgen(js_name = styleIds)]
    pub fn style_ids(&self) -> Vec<u32> {
        self.style.clone()
    }

    #[wasm_bindgen(js_name = byteLength)]
    pub fn byte_length(&self) -> usize {
        self.kind.len()
            + self.payload.len() * std::mem::size_of::<u64>()
            + self.style.len() * std::mem::size_of::<u32>()
            + self
                .formulas
                .iter()
                .map(|(_, _, entry)| std::mem::size_of::<(u32, u32)>() + entry.source.len())
                .sum::<usize>()
    }

    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formulas
            .iter()
            .map(|(_, _, entry)| entry.source.clone())
            .collect()
    }
}

type InternMap = HashMap<u64, InternSlot, BuildHasherDefault<IdentityHasher>>;

/// The workbook-wide store: every sheet, one string pool.
#[wasm_bindgen]
pub struct CellStore {
    pub(crate) sheets: Vec<SheetData>,
    pub(crate) sheet_names: Vec<String>,
    pub(crate) sheet_alive: Vec<bool>,
    pub(crate) sheet_lookup: HashMap<String, usize>,
    pub(crate) strings: StringPool,
    pub(crate) string_lookup: InternMap,
    pub(crate) formula_epoch: u64,
    pub(crate) dep_index: Option<DepIndex>,
}

#[wasm_bindgen]
impl CellStore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> CellStore {
        CellStore {
            sheets: Vec::new(),
            sheet_names: Vec::new(),
            sheet_alive: Vec::new(),
            sheet_lookup: HashMap::new(),
            strings: StringPool::new(),
            string_lookup: InternMap::default(),
            formula_epoch: 0,
            dep_index: None,
        }
    }
    #[wasm_bindgen(js_name = snapshotNumbers)]
    pub fn snapshot_numbers(&self, snapshot: &RangeSnapshot) -> Vec<f64> {
        snapshot.payload.iter().copied().map(payload_num).collect()
    }

    #[wasm_bindgen(js_name = snapshotTexts)]
    pub fn snapshot_texts(&self, snapshot: &RangeSnapshot) -> Vec<String> {
        snapshot
            .payload
            .iter()
            .copied()
            .map(|payload| {
                let id = payload_str_id(payload);
                if id == NO_STRING {
                    String::new()
                } else {
                    string_from_pool(&self.strings, id).unwrap_or_default()
                }
            })
            .collect()
    }

    /// Allocate a sheet grid and return its numeric handle.
    #[wasm_bindgen(js_name = addSheet)]
    pub fn add_sheet(&mut self, n_cols: usize, row_count: usize) -> usize {
        let index = self.sheets.len();
        self.sheets.push(SheetData::new(n_cols, row_count));
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        index
    }

    #[wasm_bindgen(js_name = setSheetName)]
    pub fn set_sheet_name(&mut self, sheet: usize, id: &str, name: &str) {
        if sheet >= self.sheets.len() {
            return;
        }
        if !self.sheet_alive[sheet] {
            return;
        }

        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet] = name.to_string();
        self.sheet_lookup.insert(id.to_string(), sheet);
        self.sheet_lookup.insert(name.to_string(), sheet);
    }

    /// Rename a live stable sheet handle and rewrite every resolved formula AST reference.
    #[wasm_bindgen(js_name = renameSheet)]
    pub fn rename_sheet(&mut self, sheet: usize, id: &str, name: &str) -> bool {
        if id.is_empty()
            || name.is_empty()
            || !self.sheet_alive.get(sheet).copied().unwrap_or(false)
            || self
                .sheet_lookup
                .get(id)
                .is_some_and(|existing| *existing != sheet)
            || self
                .sheet_lookup
                .get(name)
                .is_some_and(|existing| *existing != sheet)
        {
            return false;
        }

        let mut affected = Vec::new();
        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if !self.sheet_alive[formula_sheet] {
                continue;
            }
            let mut changed = false;
            for entry in data.formulas.values_mut() {
                changed |= entry.rename_sheet(sheet as u32, name, formula_sheet as u32);
            }
            if changed {
                data.clear_dirty();
                data.all_dirty = true;
                affected.push(formula_sheet);
            }
        }
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet] = name.to_string();
        self.sheet_lookup.insert(id.to_string(), sheet);
        self.sheet_lookup.insert(name.to_string(), sheet);
        self.bump_formula_epoch();
        for formula_sheet in affected {
            self.recompute(formula_sheet);
        }
        true
    }

    /// Tombstone a stable sheet handle and invalidate every formula reference to it.
    #[wasm_bindgen(js_name = removeSheet)]
    pub fn remove_sheet(&mut self, sheet: usize) -> bool {
        if !self.sheet_alive.get(sheet).copied().unwrap_or(false) {
            return false;
        }

        let mut affected = Vec::new();
        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if formula_sheet == sheet || !self.sheet_alive[formula_sheet] {
                continue;
            }
            let mut changed = false;
            for entry in data.formulas.values_mut() {
                changed |= entry.invalidate_sheet(sheet as u32, formula_sheet as u32);
            }
            if changed {
                data.clear_dirty();
                data.all_dirty = true;
                affected.push(formula_sheet);
            }
        }
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet].clear();
        self.sheets[sheet] = SheetData::new(0, 0);
        self.sheet_alive[sheet] = false;
        self.bump_formula_epoch();
        for formula_sheet in affected {
            self.recompute(formula_sheet);
        }
        true
    }

    #[wasm_bindgen(js_name = isSheetAlive)]
    pub fn is_sheet_alive(&self, sheet: usize) -> bool {
        self.sheet_alive.get(sheet).copied().unwrap_or(false)
    }

    #[wasm_bindgen(js_name = rowCount)]
    pub fn row_count(&self, sheet: usize) -> usize {
        self.sheets.get(sheet).map_or(0, |s| s.row_count)
    }

    #[wasm_bindgen(js_name = colCount)]
    pub fn col_count(&self, sheet: usize) -> usize {
        self.sheets.get(sheet).map_or(0, |s| s.n_cols)
    }

    #[wasm_bindgen(js_name = setNumber)]
    pub fn set_number(&mut self, sheet: usize, row: usize, col: usize, value: f64, style: u32) {
        let Some(key) = cell_key(row, col) else {
            return;
        };
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if !s.contains_cell(row, col) {
                return;
            }

            let i = s.idx(row, col);
            s.kind[i] = KIND_NUMBER;
            s.set_num(i, value);
            s.style[i] = style;
            let removed_formula = s.formulas.remove(&key).is_some();
            s.dirty_cells.insert(key);
            removed_formula
        };
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    /// Current style-dictionary id at a cell; `0` when out of bounds. Used by
    /// the host to write derived (reference-shadow) values without disturbing
    /// the cell's style.
    #[wasm_bindgen(js_name = styleIdAt)]
    pub fn style_id_at(&self, sheet: usize, row: usize, col: usize) -> u32 {
        let Some(s) = self.sheets.get(sheet) else {
            return 0;
        };
        if !s.contains_cell(row, col) {
            return 0;
        }
        s.style[s.idx(row, col)]
    }

    /// Replace a sheet's conditional-format rules. Packed columnar encoding,
    /// one entry per rule: `kinds` 0 gt / 1 lt / 2 eqNum / 3 eqStr / 4 eqEmpty /
    /// 5 contains; `bounds` = normalized `[r0, c0, r1, c1]` per rule; `nums`
    /// carries the numeric operand; `strs` the text operand; `flags` bit 0 =
    /// match-case for `contains`. Case-insensitive needles are lowercased here
    /// once so the per-cell match never allocates.
    #[wasm_bindgen(js_name = setConditionalRules)]
    pub fn set_conditional_rules(
        &mut self,
        sheet: usize,
        kinds: &[u8],
        bounds: &[u32],
        nums: &[f64],
        strs: Vec<String>,
        flags: &[u8],
    ) {
        let Some(s) = self.sheets.get_mut(sheet) else {
            return;
        };

        let mut rules: Vec<CondRule> = Vec::with_capacity(kinds.len());
        for (i, (&kind, text)) in kinds.iter().zip(strs.into_iter()).enumerate() {
            let b = i * 4;
            let (Some(&r0), Some(&c0), Some(&r1), Some(&c1)) = (
                bounds.get(b),
                bounds.get(b + 1),
                bounds.get(b + 2),
                bounds.get(b + 3),
            ) else {
                break;
            };
            let num = nums.get(i).copied().unwrap_or(0.0);
            let match_case = flags.get(i).is_some_and(|&f| f & 1 != 0);
            let pred = match kind {
                0 => CondPred::GtNum(num),
                1 => CondPred::LtNum(num),
                2 => CondPred::EqNum(num),
                3 => CondPred::EqStr(text),
                4 => CondPred::EqEmpty,
                5 => CondPred::Contains {
                    needle: if match_case {
                        text
                    } else {
                        text.to_lowercase()
                    },
                    match_case,
                },
                _ => continue,
            };
            rules.push(CondRule {
                r0,
                c0,
                r1,
                c1,
                pred,
            });
        }
        s.cond_rules = rules;
    }

    #[wasm_bindgen(js_name = setString)]
    pub fn set_string(&mut self, sheet: usize, row: usize, col: usize, value: &str, style: u32) {
        let Some(key) = cell_key(row, col) else {
            return;
        };
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if !existing.contains_cell(row, col) {
            return;
        }

        let id = self.intern(value);
        let removed_formula = {
            let s = &mut self.sheets[sheet];
            let i = s.idx(row, col);
            s.kind[i] = KIND_STRING;
            s.set_str(i, id);
            s.style[i] = style;
            let removed_formula = s.formulas.remove(&key).is_some();
            s.dirty_cells.insert(key);
            removed_formula
        };
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    #[wasm_bindgen(js_name = clearCell)]
    pub fn clear_cell(&mut self, sheet: usize, row: usize, col: usize, style: u32) {
        let Some(key) = cell_key(row, col) else {
            return;
        };
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if !s.contains_cell(row, col) {
                return;
            }

            let i = s.idx(row, col);
            s.kind[i] = KIND_EMPTY;
            s.clear_payload(i);
            s.style[i] = style;
            let removed_formula = s.formulas.remove(&key).is_some();
            s.dirty_cells.insert(key);
            removed_formula
        };
        if removed_formula {
            self.bump_formula_epoch();
        }
    }
    /// Write one row-major typed block in a single boundary call. `kinds` uses
    /// 0 empty / 1 number / 2 string; formulas and references are sparse host
    /// exceptions applied after this literal bulk write.
    #[wasm_bindgen(js_name = setBlock)]
    pub fn set_block(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        kinds: &[u8],
        numbers: &[f64],
        texts: Vec<String>,
        styles: &[u32],
    ) -> bool {
        let Some(cell_count) = rows.checked_mul(cols) else {
            return false;
        };
        let Some(existing) = self.sheets.get(sheet) else {
            return false;
        };
        if rows == 0
            || cols == 0
            || kinds.len() != cell_count
            || numbers.len() != cell_count
            || texts.len() != cell_count
            || styles.len() != cell_count
            || start_row
                .checked_add(rows)
                .is_none_or(|end| end > existing.row_count)
            || start_col
                .checked_add(cols)
                .is_none_or(|end| end > existing.n_cols)
        {
            return false;
        }

        let mut string_ids = vec![NO_STRING; cell_count];
        for (offset, text) in texts.iter().enumerate() {
            if kinds[offset] == KIND_STRING {
                string_ids[offset] = self.intern(text);
            }
        }

        let s = &mut self.sheets[sheet];
        let mut removed_formula = false;
        for col_offset in 0..cols {
            let col = start_col + col_offset;
            let base = col * s.row_count + start_row;
            for row_offset in 0..rows {
                let row = start_row + row_offset;
                let offset = row_offset * cols + col_offset;
                let index = base + row_offset;
                s.kind[index] = kinds[offset];
                match kinds[offset] {
                    KIND_NUMBER => s.set_num(index, numbers[offset]),
                    KIND_STRING => s.set_str(index, string_ids[offset]),
                    _ => {
                        s.kind[index] = KIND_EMPTY;
                        s.clear_payload(index);
                    }
                }
                s.style[index] = styles[offset];
                if let Some(key) = cell_key(row, col) {
                    removed_formula |= s.formulas.remove(&key).is_some();
                }
            }
        }
        s.clear_dirty();
        s.all_dirty = true;
        if removed_formula {
            self.bump_formula_epoch();
        }
        true
    }

    /// Clear a rectangle while independently controlling contents and style.
    #[wasm_bindgen(js_name = clearRange)]
    pub fn clear_range(
        &mut self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
        contents: bool,
        style: bool,
    ) -> bool {
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0 > r1 || c0 > c1 || r1 >= s.row_count || c1 >= s.n_cols {
            return false;
        }
        let mut removed_formula = false;
        for col in c0..=c1 {
            let base = col * s.row_count;
            for row in r0..=r1 {
                let index = base + row;
                if contents {
                    s.kind[index] = KIND_EMPTY;
                    s.clear_payload(index);
                    if let Some(key) = cell_key(row, col) {
                        removed_formula |= s.formulas.remove(&key).is_some();
                    }
                }
                if style {
                    s.style[index] = 0;
                }
            }
        }
        s.clear_dirty();
        s.all_dirty = true;
        if removed_formula {
            self.bump_formula_epoch();
        }
        true
    }

    /// Unique style ids present in a rectangle; cost stays inside WASM.
    #[wasm_bindgen(js_name = rangeStyleIds)]
    pub fn range_style_ids(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if r0 > r1 || c0 > c1 || r1 >= s.row_count || c1 >= s.n_cols {
            return Vec::new();
        }
        let mut ids = HashMap::<u32, ()>::new();
        for col in c0..=c1 {
            let base = col * s.row_count;
            for row in r0..=r1 {
                ids.insert(s.style[base + row], ());
            }
        }
        let mut out: Vec<u32> = ids.into_keys().collect();
        out.sort_unstable();
        out
    }

    /// Remap styles over a rectangle using parallel old/new id tables.
    #[wasm_bindgen(js_name = remapRangeStyles)]
    pub fn remap_range_styles(
        &mut self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
        old_ids: &[u32],
        new_ids: &[u32],
    ) -> bool {
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0 > r1
            || c0 > c1
            || r1 >= s.row_count
            || c1 >= s.n_cols
            || old_ids.len() != new_ids.len()
        {
            return false;
        }
        let mapping: HashMap<u32, u32> = old_ids
            .iter()
            .copied()
            .zip(new_ids.iter().copied())
            .collect();
        for col in c0..=c1 {
            let base = col * s.row_count;
            for row in r0..=r1 {
                let style = &mut s.style[base + row];
                if let Some(new_style) = mapping.get(style) {
                    *style = *new_style;
                }
            }
        }
        true
    }

    /// Capture a dense rectangle into an opaque store-local history resource.
    #[wasm_bindgen(js_name = captureRange)]
    pub fn capture_range(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
    ) -> Option<RangeSnapshot> {
        let s = self.sheets.get(sheet)?;
        if rows == 0
            || cols == 0
            || r0.checked_add(rows).is_none_or(|end| end > s.row_count)
            || c0.checked_add(cols).is_none_or(|end| end > s.n_cols)
        {
            return None;
        }
        let cell_count = rows.checked_mul(cols)?;
        let mut kind = Vec::with_capacity(cell_count);
        let mut payload = Vec::with_capacity(cell_count);
        let mut style = Vec::with_capacity(cell_count);
        for col_offset in 0..cols {
            let base = (c0 + col_offset) * s.row_count + r0;
            kind.extend_from_slice(&s.kind[base..base + rows]);
            payload.extend_from_slice(&s.payload[base..base + rows]);
            style.extend_from_slice(&s.style[base..base + rows]);
        }
        let formulas = s
            .formulas
            .iter()
            .filter_map(|(&(row, col), entry)| {
                let row = row as usize;
                let col = col as usize;
                (row >= r0 && row < r0 + rows && col >= c0 && col < c0 + cols)
                    .then(|| ((row - r0) as u32, (col - c0) as u32, entry.clone()))
            })
            .collect();
        Some(RangeSnapshot {
            rows,
            cols,
            kind,
            payload,
            style,
            formulas,
        })
    }

    /// Restore a captured block at a destination of the same dimensions.
    #[wasm_bindgen(js_name = restoreRange)]
    pub fn restore_range(
        &mut self,
        sheet: usize,
        r0: usize,
        c0: usize,
        snapshot: &RangeSnapshot,
    ) -> bool {
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0
            .checked_add(snapshot.rows)
            .is_none_or(|end| end > s.row_count)
            || c0
                .checked_add(snapshot.cols)
                .is_none_or(|end| end > s.n_cols)
        {
            return false;
        }
        s.formulas.retain(|&(row, col), _| {
            let row = row as usize;
            let col = col as usize;
            row < r0 || row >= r0 + snapshot.rows || col < c0 || col >= c0 + snapshot.cols
        });
        for col_offset in 0..snapshot.cols {
            let source = col_offset * snapshot.rows;
            let target = (c0 + col_offset) * s.row_count + r0;
            s.kind[target..target + snapshot.rows]
                .copy_from_slice(&snapshot.kind[source..source + snapshot.rows]);
            s.payload[target..target + snapshot.rows]
                .copy_from_slice(&snapshot.payload[source..source + snapshot.rows]);
            s.style[target..target + snapshot.rows]
                .copy_from_slice(&snapshot.style[source..source + snapshot.rows]);
        }
        for (row, col, entry) in &snapshot.formulas {
            s.formulas
                .insert((r0 as u32 + *row, c0 as u32 + *col), entry.clone());
        }
        s.clear_dirty();
        s.all_dirty = true;
        self.bump_formula_epoch();
        true
    }

    /// Bulk-load one column with numbers starting at `start_row`.
    #[wasm_bindgen(js_name = setColumnNumbers)]
    pub fn set_column_numbers(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        values: &[f64],
        style: u32,
    ) {
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if col >= s.n_cols || start_row >= s.row_count {
                return;
            }

            let limit = values.len().min(s.row_count - start_row);
            let base = col * s.row_count;
            let mut removed_formula = false;
            for (offset, &value) in values.iter().take(limit).enumerate() {
                let row = start_row + offset;
                let Some(key) = cell_key(row, col) else {
                    continue;
                };
                let i = base + row;
                s.kind[i] = KIND_NUMBER;
                s.set_num(i, value);
                s.style[i] = style;
                removed_formula |= s.formulas.remove(&key).is_some();
            }
            if limit > 0 {
                s.all_dirty = true;
            }
            removed_formula
        };
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    /// Bulk-load one column with strings starting at `start_row`.
    #[wasm_bindgen(js_name = setColumnStrings)]
    pub fn set_column_strings(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        values: Vec<String>,
        style: u32,
    ) {
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if col >= existing.n_cols || start_row >= existing.row_count {
            return;
        }

        let row_count = existing.row_count;
        let limit = values.len().min(row_count - start_row);
        let base = col * row_count;
        let mut removed_formula = false;

        for (offset, value) in values.into_iter().take(limit).enumerate() {
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            let id = self.intern(&value);
            let s = &mut self.sheets[sheet];
            let i = base + row;
            s.kind[i] = KIND_STRING;
            s.set_str(i, id);
            s.style[i] = style;
            removed_formula |= s.formulas.remove(&key).is_some();
        }
        if limit > 0 {
            self.sheets[sheet].all_dirty = true;
        }
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    /// Bulk-load one column of strings from a single concatenated buffer plus
    /// per-row lengths in UTF-16 code units (the JS `string.length` unit).
    /// One boundary decode and one Rust allocation for the whole column,
    /// instead of one per row — the dominant ingest cost for text columns.
    #[wasm_bindgen(js_name = setColumnStringsPacked)]
    pub fn set_column_strings_packed(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        buf: String,
        utf16_lens: &[u32],
        style: u32,
    ) {
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if col >= existing.n_cols || start_row >= existing.row_count {
            return;
        }

        let row_count = existing.row_count;
        let limit = utf16_lens.len().min(row_count - start_row);
        let base = col * row_count;

        // Split the buffer into per-row slices. ASCII text (the overwhelmingly
        // common case) maps one UTF-16 unit to one byte, so slicing is direct;
        // otherwise one linear char walk converts unit counts to byte offsets.
        let mut slices: Vec<&str> = Vec::with_capacity(limit);
        if buf.is_ascii() {
            let mut start = 0usize;
            for &len in utf16_lens.iter().take(limit) {
                let end = (start + len as usize).min(buf.len());
                slices.push(&buf[start..end]);
                start = end;
            }
        } else {
            let mut chars = buf.char_indices().peekable();
            for &len in utf16_lens.iter().take(limit) {
                let start = chars.peek().map_or(buf.len(), |&(idx, _)| idx);
                let mut units = 0u32;
                while units < len {
                    let Some((_, ch)) = chars.next() else {
                        break;
                    };
                    units += ch.len_utf16() as u32;
                }
                let end = chars.peek().map_or(buf.len(), |&(idx, _)| idx);
                slices.push(&buf[start..end]);
            }
        }

        let mut removed_formula = false;
        for (offset, text) in slices.iter().enumerate() {
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            let id = self.intern(text);
            let s = &mut self.sheets[sheet];
            let i = base + row;
            s.kind[i] = KIND_STRING;
            s.set_str(i, id);
            s.style[i] = style;
            removed_formula |= s.formulas.remove(&key).is_some();
        }
        if limit > 0 {
            self.sheets[sheet].all_dirty = true;
        }
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    #[wasm_bindgen(js_name = addRows)]
    pub fn add_rows(&mut self, sheet: usize, at: usize, count: usize) {
        let Some(row_count) = self.sheets.get(sheet).map(|s| s.row_count) else {
            return;
        };
        if count == 0 {
            return;
        }
        let at = at.min(row_count);
        self.sheets[sheet].insert_rows(sheet as u32, at, count);
        self.rewrite_formula_rows(sheet as u32, at as u32, count as i64);
        self.bump_formula_epoch();
    }

    #[wasm_bindgen(js_name = removeRows)]
    pub fn remove_rows(&mut self, sheet: usize, at: usize, count: usize) {
        let Some(row_count) = self.sheets.get(sheet).map(|s| s.row_count) else {
            return;
        };
        if count == 0 || at >= row_count {
            return;
        }
        let count = count.min(row_count - at);
        self.sheets[sheet].delete_rows(sheet as u32, at, count);
        self.rewrite_formula_rows(sheet as u32, at as u32, -(count as i64));
        self.bump_formula_epoch();
    }

    #[wasm_bindgen(js_name = insertCols)]
    pub fn insert_cols(&mut self, sheet: usize, at: usize, count: usize) {
        let Some(col_count) = self.sheets.get(sheet).map(|s| s.n_cols) else {
            return;
        };
        if count == 0 {
            return;
        }
        let at = at.min(col_count);
        self.sheets[sheet].insert_cols(sheet as u32, at, count);
        self.rewrite_formula_cols(sheet as u32, at as u32, count as i64);
        self.bump_formula_epoch();
    }

    #[wasm_bindgen(js_name = removeCols)]
    pub fn remove_cols(&mut self, sheet: usize, at: usize, count: usize) {
        let Some(col_count) = self.sheets.get(sheet).map(|s| s.n_cols) else {
            return;
        };
        if count == 0 || at >= col_count {
            return;
        }
        let count = count.min(col_count - at);
        self.sheets[sheet].delete_cols(sheet as u32, at, count);
        self.rewrite_formula_cols(sheet as u32, at as u32, -(count as i64));
        self.bump_formula_epoch();
    }

    /// Single-cell read for interactions/tests — never the render hot path.
    #[wasm_bindgen(js_name = getCell)]
    pub fn get_cell(&self, sheet: usize, row: usize, col: usize) -> CellOut {
        let Some(s) = self.sheets.get(sheet) else {
            return CellOut::empty();
        };
        if !s.contains_cell(row, col) {
            return CellOut::empty();
        }

        let i = s.idx(row, col);
        let kind = s.kind[i];
        let key = cell_key(row, col);
        if kind == KIND_FORMULA {
            if let Some(error) = key.and_then(|key| formula_error_at(s, key)) {
                return CellOut {
                    kind: KIND_STRING,
                    num: 0.0,
                    string: Some(error.sentinel().to_string()),
                    style: s.style[i],
                };
            }
            if s.str_id_at(i) != NO_STRING {
                let string = string_from_pool(&self.strings, s.str_id_at(i));
                // A bool formula's numeric view is its truth (the payload
                // holds the "TRUE"/"FALSE" display sentinel); text reads 0.0.
                let num = if key
                    .and_then(|key| s.formulas.get(&key))
                    .is_some_and(|entry| entry.value_kind == FormulaValueKind::Bool)
                {
                    f64::from(string.as_deref() == Some(bool_text(true)))
                } else {
                    0.0
                };
                return CellOut {
                    kind: KIND_STRING,
                    num,
                    string,
                    style: s.style[i],
                };
            }
        }

        CellOut {
            kind,
            num: s.num_at(i),
            string: if kind == KIND_STRING {
                string_from_pool(&self.strings, s.str_id_at(i))
            } else {
                None
            },
            style: s.style[i],
        }
    }

    /// Parse and store an arithmetic formula at `(row, col)`.
    ///
    /// Setters only mark cells dirty; they do not recompute formulas. The host
    /// calls `recompute(sheet)` once at the transaction barrier so a multi-cell
    /// edit performs one dependency-scoped pass instead of one full-sheet pass
    /// per setter. The returned value is the previous cached value until that
    /// barrier recompute runs, and the store facade ignores it for batched edits.
    #[wasm_bindgen(js_name = setFormula)]
    pub fn set_formula(
        &mut self,
        sheet: usize,
        row: usize,
        col: usize,
        src: &str,
        style: u32,
    ) -> f64 {
        let Some(key) = cell_key(row, col) else {
            return f64::NAN;
        };
        let Some(s) = self.sheets.get(sheet) else {
            return f64::NAN;
        };
        if !s.contains_cell(row, col) {
            return f64::NAN;
        }

        let entry = match parse(src).and_then(|ast| {
            resolve_sheet_refs(ast, &|name| {
                self.sheet_lookup.get(name).map(|&idx| idx as u32)
            })
        }) {
            Ok(ast) => FormulaEntry::parsed(ast, sheet as u32),
            Err(_) => FormulaEntry::parse_error(src),
        };

        let cached_value = {
            let s = &mut self.sheets[sheet];
            let i = s.idx(row, col);
            s.kind[i] = KIND_FORMULA;
            // A formula keeps the previous numeric cached value until the
            // barrier recompute; a previous string payload reads as 0.0,
            // matching the old zeroed `num` slot.
            let carried = if entry.error.is_some() {
                0.0
            } else {
                s.num_at(i)
            };
            s.set_num(i, carried);
            s.style[i] = style;
            s.formulas.insert(key, entry);
            s.dirty_cells.insert(key);
            carried
        };
        self.bump_formula_epoch();
        cached_value
    }

    #[wasm_bindgen(js_name = formulaSource)]
    pub fn formula_source(&self, sheet: usize, row: usize, col: usize) -> Option<String> {
        let key = cell_key(row, col)?;
        let entry = self.sheets.get(sheet)?.formulas.get(&key)?;
        Some(entry.source.clone())
    }

    #[wasm_bindgen(js_name = poolStrings)]
    pub fn pool_strings(&self, ids: &[u32]) -> Vec<String> {
        ids.iter()
            .map(|&id| {
                if id == NO_STRING {
                    String::new()
                } else {
                    self.strings.get(id).map(str::to_owned).unwrap_or_default()
                }
            })
            .collect()
    }

    /// Recompute formulas affected by cells changed since the last call.
    ///
    /// The pass first grows the dirty cell set through formula read-sets to find
    /// all dependent formulas. It then evaluates only those formulas, using a
    /// per-pass memo table so each formula cell is evaluated at most once even
    /// when many downstream formulas reference it.
    #[wasm_bindgen(js_name = recompute)]
    pub fn recompute(&mut self, sheet: usize) {
        self.recompute_sheet(sheet);
    }
}

impl Default for CellStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CellStore {
    pub(crate) fn intern(&mut self, s: &str) -> u32 {
        let hash = string_hash(s);
        if let Some(slot) = self.string_lookup.get(&hash) {
            match slot {
                InternSlot::One(id) => {
                    if self.strings.get(*id) == Some(s) {
                        return *id;
                    }
                }
                InternSlot::Many(ids) => {
                    for &id in ids {
                        if self.strings.get(id) == Some(s) {
                            return id;
                        }
                    }
                }
            }
        }

        let id = self.strings.push(s);
        match self.string_lookup.get_mut(&hash) {
            None => {
                self.string_lookup.insert(hash, InternSlot::One(id));
            }
            Some(slot) => match slot {
                InternSlot::One(previous) => {
                    let first = *previous;
                    *slot = InternSlot::Many(vec![first, id]);
                }
                InternSlot::Many(ids) => {
                    ids.push(id);
                }
            },
        }
        id
    }

    fn rewrite_formula_rows(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            if formula_sheet as u32 != edited_sheet {
                for entry in sheet.formulas.values_mut() {
                    entry.shift_rows(at, delta, formula_sheet as u32, edited_sheet);
                }
            }
            sheet.clear_dirty();
            sheet.all_dirty = true;
        }
    }

    fn rewrite_formula_cols(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            if formula_sheet as u32 != edited_sheet {
                for entry in sheet.formulas.values_mut() {
                    entry.shift_cols(at, delta, formula_sheet as u32, edited_sheet);
                }
            }
            sheet.clear_dirty();
            sheet.all_dirty = true;
        }
    }

    pub(crate) fn bump_formula_epoch(&mut self) {
        self.formula_epoch += 1;
    }
}

fn string_hash(s: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

/// Result of a single-cell read.
#[wasm_bindgen]
pub struct CellOut {
    kind: u8,
    num: f64,
    string: Option<String>,
    style: u32,
}

impl CellOut {
    pub(crate) fn empty() -> Self {
        Self {
            kind: KIND_EMPTY,
            num: 0.0,
            string: None,
            style: 0,
        }
    }
}

#[wasm_bindgen]
impl CellOut {
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> u8 {
        self.kind
    }

    #[wasm_bindgen(getter)]
    pub fn num(&self) -> f64 {
        self.num
    }

    #[wasm_bindgen(getter)]
    pub fn string(&self) -> Option<String> {
        self.string.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn style(&self) -> u32 {
        self.style
    }
}
