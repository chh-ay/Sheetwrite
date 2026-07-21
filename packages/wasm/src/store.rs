//! The workbook-wide store: sheet management, cell reads/writes, bulk loads.

use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hash, Hasher};

use wasm_bindgen::prelude::*;

use crate::calc::{parse, resolve_named_ranges, resolve_sheet_refs, shift_range, NamedRangeRef};
use crate::eval::DepIndex;
use crate::memory::{
    StoreMemoryStats, DEPENDENCY_EDGES, DEPENDENCY_NODES, SHEET_INDEXES_METADATA, STRING_INDEX,
    STRING_POOL_SPANS, STRING_POOL_UTF8,
};
use crate::sheet::{
    encode_num, encode_str_id, formula_error_at, payload_num, payload_str_id, CondPred, CondRule,
    SheetData, SpillBlocker, DEFAULT_MAX_PAGED_DIRTY_CELLS, DEFAULT_PAGE_CHUNK_ROWS,
    MAX_SPILL_OWNER_CELLS,
};
use crate::types::{
    cell_key, string_from_pool, AbsCellKey, FormulaEntry, FormulaError, FormulaValueKind,
    StringPool, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

fn utf16_slices<'a>(buf: &'a str, utf16_lens: &[u32], limit: usize) -> Vec<&'a str> {
    let mut slices = Vec::with_capacity(limit);
    if buf.is_ascii() {
        let mut start = 0usize;
        for &len in utf16_lens.iter().take(limit) {
            let end = (start + len as usize).min(buf.len());
            slices.push(&buf[start..end]);
            start = end;
        }
        return slices;
    }

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
    slices
}

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

/// Compact serializable projection of persisted derived-cell sources in one
/// range. Offsets are row-major and sorted; reference targets are packed
/// `[sheet_handle, row, col]` triples.
#[wasm_bindgen]
pub struct SourceSnapshot {
    formula_offsets: Vec<u32>,
    formula_sources: Vec<String>,
    reference_offsets: Vec<u32>,
    reference_targets: Vec<u32>,
}

#[wasm_bindgen]
impl SourceSnapshot {
    #[wasm_bindgen(js_name = formulaOffsets)]
    pub fn formula_offsets(&self) -> Vec<u32> {
        self.formula_offsets.clone()
    }

    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formula_sources.clone()
    }

    #[wasm_bindgen(js_name = referenceOffsets)]
    pub fn reference_offsets(&self) -> Vec<u32> {
        self.reference_offsets.clone()
    }

    #[wasm_bindgen(js_name = referenceTargets)]
    pub fn reference_targets(&self) -> Vec<u32> {
        self.reference_targets.clone()
    }

    #[wasm_bindgen(js_name = byteLength)]
    pub fn byte_length(&self) -> usize {
        (self.formula_offsets.len() + self.reference_offsets.len()) * std::mem::size_of::<u32>()
            + self.reference_targets.len() * std::mem::size_of::<u32>()
            + self.formula_sources.iter().map(String::len).sum::<usize>()
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
        let mut offsets = Vec::new();
        for (row, col, entry) in &self.formulas {
            if entry.is_formula() {
                offsets.push(*row);
                offsets.push(*col);
            }
        }
        offsets
    }

    #[wasm_bindgen(js_name = referenceOffsets)]
    pub fn reference_offsets(&self) -> Vec<u32> {
        let mut offsets = Vec::new();
        for (row, col, entry) in &self.formulas {
            if entry.is_reference() {
                offsets.push(*row);
                offsets.push(*col);
            }
        }
        offsets
    }

    #[wasm_bindgen(js_name = referenceTargets)]
    pub fn reference_targets(&self) -> Vec<u32> {
        let mut targets = Vec::new();
        for (_, _, entry) in &self.formulas {
            if let Some(target) = entry.reference_target(0) {
                targets.push(target.sheet);
                targets.push(target.row);
                targets.push(target.col);
            }
        }
        targets
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
                .map(|(_, _, entry)| {
                    std::mem::size_of::<(u32, u32)>()
                        + if entry.is_formula() {
                            entry.source.len()
                        } else {
                            std::mem::size_of::<AbsCellKey>()
                        }
                })
                .sum::<usize>()
    }

    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formulas
            .iter()
            .filter(|(_, _, entry)| entry.is_formula())
            .map(|(_, _, entry)| entry.source.clone())
            .collect()
    }
}
const BLOCK_OK: u32 = 0;
const BLOCK_INVALID: u32 = 1;
const BLOCK_SOURCE_INVALID: u32 = 2;
const BLOCK_RESOURCE_LIMIT: u32 = 3;

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
    loading_page: usize,
    named_ranges: HashMap<(Option<u32>, String), NamedRangeRef>,
    mutation_revision: u64,
    active_mutation_revision: Option<u64>,
    pub(crate) volatile_serial: f64,
    pub(crate) spill_owner_cell_limit: usize,
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
            loading_page: 0,
            mutation_revision: 0,
            active_mutation_revision: None,
            named_ranges: HashMap::new(),
            volatile_serial: 0.0,
            spill_owner_cell_limit: MAX_SPILL_OWNER_CELLS,
        }
    }

    fn next_mutation_revision(&mut self) -> u64 {
        self.mutation_revision = self.mutation_revision.wrapping_add(1);
        if self.mutation_revision == 0 {
            self.mutation_revision = 1;
        }
        self.mutation_revision
    }

    fn local_dirty_revision(&mut self) -> Option<u64> {
        if self.loading_page > 0 {
            return None;
        }
        Some(
            self.active_mutation_revision
                .unwrap_or_else(|| self.next_mutation_revision()),
        )
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
        match self.try_add_sheet(n_cols, row_count) {
            Ok(index) => index,
            Err(error) => wasm_bindgen::throw_str(&error),
        }
    }

    /// Allocate a logical sheet whose cell chunks materialize on page load or edit.
    #[wasm_bindgen(js_name = addPagedSheet)]
    pub fn add_paged_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> usize {
        let index = self.sheets.len();
        self.sheets.push(SheetData::new_paged(
            n_cols,
            row_count,
            if chunk_rows == 0 {
                DEFAULT_PAGE_CHUNK_ROWS
            } else {
                chunk_rows
            },
            byte_budget,
            if max_dirty_cells == 0 {
                DEFAULT_MAX_PAGED_DIRTY_CELLS
            } else {
                max_dirty_cells
            },
        ));
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        index
    }

    #[wasm_bindgen(js_name = isPaged)]
    pub fn is_paged(&self, sheet: usize) -> bool {
        self.sheets.get(sheet).is_some_and(SheetData::is_paged)
    }

    /// `[chunks, loaded cells, dirty cells, clean chunk bytes, fully loaded, dirty bytes]`.
    #[wasm_bindgen(js_name = pagedStats)]
    pub fn paged_stats(&self, sheet: usize) -> Vec<f64> {
        let Some(data) = self.sheets.get(sheet) else {
            return vec![0.0; 6];
        };
        let Some((chunks, loaded, dirty, clean_bytes, dirty_bytes)) = data.paged_stats() else {
            return vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        };
        vec![
            chunks as f64,
            loaded as f64,
            dirty as f64,
            clean_bytes as f64,
            if data.is_fully_loaded() { 1.0 } else { 0.0 },
            dirty_bytes as f64,
        ]
    }

    #[wasm_bindgen(js_name = memoryStats)]
    pub fn memory_stats(&self) -> Vec<f64> {
        self.store_memory_stats().encode()
    }

    /// Benchmark diagnostic: `[current matrix bytes, peak matrix bytes, allocations]`.
    #[wasm_bindgen(js_name = formulaMatrixResourceStats)]
    pub fn formula_matrix_resource_stats(&self) -> Vec<f64> {
        crate::eval::matrix_resource_stats()
            .into_iter()
            .map(|value| value as f64)
            .collect()
    }

    #[wasm_bindgen(js_name = resetFormulaMatrixResourceStats)]
    pub fn reset_formula_matrix_resource_stats(&self) {
        crate::eval::reset_matrix_resource_stats();
    }

    /// Release geometric growth slack after a bounded bulk ingest.
    #[wasm_bindgen(js_name = compactStringStorage)]
    pub fn compact_string_storage(&mut self) {
        self.strings.shrink_to_fit();
    }

    #[wasm_bindgen(js_name = wasmCommittedBytes)]
    pub fn wasm_committed_bytes(&self) -> usize {
        #[cfg(target_arch = "wasm32")]
        {
            core::arch::wasm32::memory_size::<0>().saturating_mul(65_536)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            0
        }
    }

    /// 0 unloaded, 1 loaded-empty, 2 loaded-value, 3 dirty local edit.
    #[wasm_bindgen(js_name = cellState)]
    pub fn cell_state(&self, sheet: usize, row: usize, col: usize) -> u8 {
        let Some(data) = self.sheets.get(sheet) else {
            return 0;
        };
        if !data.contains_cell(row, col) || !data.is_loaded(row, col) {
            return 0;
        }
        if data.is_cell_dirty(row, col) {
            3
        } else if data.kind_at(data.idx(row, col)) == KIND_EMPTY {
            1
        } else {
            2
        }
    }

    #[wasm_bindgen(js_name = canDirtyCell)]
    pub fn can_dirty_cell(&self, sheet: usize, row: usize, col: usize) -> bool {
        self.loading_page > 0
            || self
                .sheets
                .get(sheet)
                .is_some_and(|data| data.contains_cell(row, col) && data.can_dirty_cell(row, col))
    }

    #[wasm_bindgen(js_name = pagedDirtyCoordinates)]
    pub fn paged_dirty_coordinates(&self, sheet: usize) -> Vec<f64> {
        self.sheets
            .get(sheet)
            .map_or_else(Vec::new, SheetData::dirty_coordinates)
    }

    #[wasm_bindgen(js_name = dirtyRevision)]
    pub fn dirty_revision(&self, sheet: usize, row: usize, col: usize) -> u64 {
        self.sheets
            .get(sheet)
            .and_then(|data| data.dirty_revision(row, col))
            .unwrap_or(0)
    }

    #[wasm_bindgen(js_name = isFullyLoaded)]
    pub fn is_fully_loaded(&self, sheet: usize) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(SheetData::is_fully_loaded)
    }

    #[wasm_bindgen(js_name = rangeFullyLoaded)]
    pub fn range_fully_loaded(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(|data| data.range_fully_loaded(r0, c0, r1, c1))
    }

    #[wasm_bindgen(js_name = markRangeClean)]
    pub fn mark_range_clean(
        &mut self,
        sheet: usize,
        start_row: usize,
        end_row: usize,
        start_col: usize,
        end_col: usize,
    ) {
        if let Some(data) = self.sheets.get_mut(sheet) {
            data.mark_range_clean(start_row, end_row, start_col, end_col);
        }
    }

    #[wasm_bindgen(js_name = markCellCleanRevision)]
    pub fn mark_cell_clean_revision(
        &mut self,
        sheet: usize,
        row: usize,
        col: usize,
        revision: u64,
    ) -> bool {
        revision != 0
            && self
                .sheets
                .get_mut(sheet)
                .is_some_and(|data| data.mark_cell_clean_revision(row, col, revision))
    }

    #[wasm_bindgen(js_name = acknowledgeRevision)]
    pub fn acknowledge_revision(&mut self, revision: u64) {
        if revision == 0 {
            return;
        }
        for sheet in &mut self.sheets {
            sheet.acknowledge_revision(revision);
        }
    }

    #[wasm_bindgen(js_name = pinRange)]
    pub fn pin_range(&mut self, sheet: usize, start_row: usize, end_row: usize, cols: &[u32]) {
        if let Some(data) = self.sheets.get_mut(sheet) {
            data.pin_range(start_row, end_row, cols);
        }
    }

    #[wasm_bindgen(js_name = beginMutation)]
    pub fn begin_mutation(&mut self) -> u64 {
        let revision = self.next_mutation_revision();
        self.active_mutation_revision = Some(revision);
        revision
    }

    #[wasm_bindgen(js_name = endMutation)]
    pub fn end_mutation(&mut self) {
        self.active_mutation_revision = None;
    }

    #[wasm_bindgen(js_name = beginPageLoad)]
    pub fn begin_page_load(&mut self) {
        self.loading_page = self.loading_page.saturating_add(1);
    }

    #[wasm_bindgen(js_name = endPageLoad)]
    pub fn end_page_load(&mut self) {
        self.loading_page = self.loading_page.saturating_sub(1);
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
        let before_names = self.named_ranges.len();
        self.named_ranges.retain(|(scope, _), definition| {
            definition.sheet != sheet as u32 && *scope != Some(sheet as u32)
        });
        let removed_names = self.named_ranges.len() != before_names;
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet].clear();
        self.sheets[sheet] = SheetData::new(0, 0);
        self.sheet_alive[sheet] = false;
        self.bump_formula_epoch();
        if removed_names {
            self.refresh_named_formula_entries();
            self.recompute_all_sheets();
        } else {
            for formula_sheet in affected {
                self.recompute(formula_sheet);
            }
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
        let dirty_revision = self.local_dirty_revision();
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if !s.contains_cell(row, col)
                || !s.write_cell(
                    row,
                    col,
                    KIND_NUMBER,
                    encode_num(value),
                    style,
                    dirty_revision,
                )
            {
                return;
            }

            let removed_formula = s.formulas.remove(&key).is_some();
            s.dirty_cells.insert(key);
            removed_formula
        };
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    #[wasm_bindgen(js_name = setBool)]
    pub fn set_bool(&mut self, sheet: usize, row: usize, col: usize, value: bool, style: u32) {
        let Some(key) = cell_key(row, col) else {
            return;
        };
        let dirty_revision = self.local_dirty_revision();
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if !s.contains_cell(row, col)
                || !s.write_cell(
                    row,
                    col,
                    KIND_BOOL,
                    encode_num(f64::from(value)),
                    style,
                    dirty_revision,
                )
            {
                return;
            }

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
        s.style_at(s.idx(row, col))
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
        let dirty_revision = self.local_dirty_revision();
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if !existing.contains_cell(row, col)
            || (dirty_revision.is_some() && !existing.can_dirty_cell(row, col))
        {
            return;
        }

        let id = self.intern(value);
        let removed_formula = {
            let s = &mut self.sheets[sheet];
            if !s.write_cell(
                row,
                col,
                KIND_STRING,
                encode_str_id(id),
                style,
                dirty_revision,
            ) {
                return;
            }
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
        let dirty_revision = self.local_dirty_revision();
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if !s.contains_cell(row, col)
                || !s.write_cell(row, col, KIND_EMPTY, 0, style, dirty_revision)
            {
                return;
            }

            let removed_formula = s.formulas.remove(&key).is_some();
            s.dirty_cells.insert(key);
            removed_formula
        };
        if removed_formula {
            self.bump_formula_epoch();
        }
    }
    /// Atomically write one row-major mixed literal/formula/reference block.
    /// Formula/reference offsets are sparse row-major exceptions. Reference
    /// targets are packed `[sheet_handle, row, col]` triples. The compact
    /// status is `0` success, `1` invalid shape/bounds, `2` invalid or duplicate
    /// source metadata, and `3` paged dirty-capacity rejection.
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
        formula_offsets: &[u32],
        formula_sources: Vec<String>,
        reference_offsets: &[u32],
        reference_targets: &[u32],
    ) -> u32 {
        let Some(cell_count) = rows.checked_mul(cols) else {
            return BLOCK_INVALID;
        };
        let dirty_revision = self.local_dirty_revision();
        let Some(existing) = self.sheets.get(sheet) else {
            return BLOCK_INVALID;
        };
        if rows == 0
            || cols == 0
            || cell_count > u32::MAX as usize
            || kinds.len() != cell_count
            || numbers.len() != cell_count
            || texts.len() != cell_count
            || styles.len() != cell_count
            || formula_offsets.len() != formula_sources.len()
            || reference_targets.len() != reference_offsets.len().saturating_mul(3)
            || start_row
                .checked_add(rows)
                .is_none_or(|end| end > existing.row_count)
            || start_row > u32::MAX as usize
            || rows - 1 > u32::MAX as usize - start_row
            || start_col
                .checked_add(cols)
                .is_none_or(|end| end > existing.n_cols)
            || start_col > u32::MAX as usize
            || cols - 1 > u32::MAX as usize - start_col
        {
            return BLOCK_INVALID;
        }
        if dirty_revision.is_some() && !existing.can_dirty_rect(start_row, start_col, rows, cols) {
            return BLOCK_RESOURCE_LIMIT;
        }

        let mut source_kinds = vec![0u8; cell_count];
        let mut seen_offsets = HashSet::with_capacity(
            formula_offsets
                .len()
                .saturating_add(reference_offsets.len()),
        );
        for &offset in formula_offsets {
            let offset = offset as usize;
            if offset >= cell_count || !seen_offsets.insert(offset as u32) {
                return BLOCK_SOURCE_INVALID;
            }
            source_kinds[offset] = 1;
        }
        for &offset in reference_offsets {
            let offset = offset as usize;
            if offset >= cell_count || !seen_offsets.insert(offset as u32) {
                return BLOCK_SOURCE_INVALID;
            }
            source_kinds[offset] = 2;
        }

        let mut prepared = Vec::with_capacity(seen_offsets.len());
        for (&offset, source) in formula_offsets.iter().zip(formula_sources.iter()) {
            let offset = offset as usize;
            let row = start_row + offset / cols;
            let col = start_col + offset % cols;
            let Some(key) = cell_key(row, col) else {
                return BLOCK_SOURCE_INVALID;
            };
            prepared.push((key, self.parse_formula_entry(source, sheet as u32)));
        }
        for (index, &offset) in reference_offsets.iter().enumerate() {
            let target_index = index * 3;
            let target = AbsCellKey {
                sheet: reference_targets[target_index],
                row: reference_targets[target_index + 1],
                col: reference_targets[target_index + 2],
            };
            let target_sheet = target.sheet as usize;
            if !self.sheet_alive.get(target_sheet).copied().unwrap_or(false)
                || !self.sheets[target_sheet]
                    .contains_cell(target.row as usize, target.col as usize)
            {
                return BLOCK_SOURCE_INVALID;
            }
            let offset = offset as usize;
            let row = start_row + offset / cols;
            let col = start_col + offset % cols;
            let Some(key) = cell_key(row, col) else {
                return BLOCK_SOURCE_INVALID;
            };
            prepared.push((
                key,
                FormulaEntry::reference(target, &self.sheet_names[target_sheet], sheet as u32),
            ));
        }

        if let Some(revision) = dirty_revision {
            if !self.sheets[sheet].prepare_dirty_rect(start_row, start_col, rows, cols, revision) {
                return BLOCK_RESOURCE_LIMIT;
            }
        }

        let mut string_ids = vec![NO_STRING; cell_count];
        for (offset, text) in texts.iter().enumerate() {
            if source_kinds[offset] == 0 && kinds[offset] == KIND_STRING {
                string_ids[offset] = self.intern(text);
            }
        }

        let s = &mut self.sheets[sheet];
        s.clear_all_spills();
        for col_offset in 0..cols {
            let col = start_col + col_offset;
            for row_offset in 0..rows {
                let row = start_row + row_offset;
                let offset = row_offset * cols + col_offset;
                let (kind, payload) = if source_kinds[offset] != 0 {
                    (KIND_FORMULA, 0)
                } else {
                    match kinds[offset] {
                        KIND_NUMBER | KIND_BOOL => (kinds[offset], encode_num(numbers[offset])),
                        KIND_STRING => (KIND_STRING, encode_str_id(string_ids[offset])),
                        _ => (KIND_EMPTY, 0),
                    }
                };
                if !s.write_cell(row, col, kind, payload, styles[offset], dirty_revision) {
                    return BLOCK_RESOURCE_LIMIT;
                }
                if let Some(key) = cell_key(row, col) {
                    s.formulas.remove(&key);
                }
            }
        }
        for (key, entry) in prepared {
            s.formulas.insert(key, entry);
        }
        s.clear_dirty();
        s.all_dirty = true;
        self.bump_formula_epoch();
        BLOCK_OK
    }

    /// Write one sparse mixed transaction/page/snapshot block without
    /// allocating by logical rectangle size. Inside `beginPageLoad`, dirty
    /// paged cells are skipped; otherwise the whole sparse write is preflighted.
    #[wasm_bindgen(js_name = setSparseBlock)]
    pub fn set_sparse_block(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        offsets: &[u32],
        kinds: &[u8],
        numbers: &[f64],
        texts: Vec<String>,
        styles: &[u32],
        formula_offsets: &[u32],
        formula_sources: Vec<String>,
        reference_offsets: &[u32],
        reference_targets: &[u32],
    ) -> u32 {
        let hydrating = self.loading_page > 0;
        let dirty_revision = if hydrating {
            None
        } else {
            self.local_dirty_revision()
        };
        let Some(cell_count) = rows.checked_mul(cols) else {
            return BLOCK_INVALID;
        };
        let Some(existing) = self.sheets.get(sheet) else {
            return BLOCK_INVALID;
        };
        if rows == 0
            || cols == 0
            || cell_count > u32::MAX as usize
            || offsets.len() != kinds.len()
            || offsets.len() != numbers.len()
            || offsets.len() != texts.len()
            || offsets.len() != styles.len()
            || formula_offsets.len() != formula_sources.len()
            || reference_targets.len() != reference_offsets.len().saturating_mul(3)
            || start_row
                .checked_add(rows)
                .is_none_or(|end| end > existing.row_count)
            || start_row > u32::MAX as usize
            || rows - 1 > u32::MAX as usize - start_row
            || start_col
                .checked_add(cols)
                .is_none_or(|end| end > existing.n_cols)
            || start_col > u32::MAX as usize
            || cols - 1 > u32::MAX as usize - start_col
        {
            return BLOCK_INVALID;
        }

        let mut destination_cells = Vec::with_capacity(offsets.len());
        let mut entry_offsets = HashSet::with_capacity(offsets.len());
        for &offset in offsets {
            if offset as usize >= cell_count || !entry_offsets.insert(offset) {
                return BLOCK_INVALID;
            }
            let offset = offset as usize;
            destination_cells.push((start_row + offset / cols, start_col + offset % cols));
        }
        let mut source_offsets = HashSet::with_capacity(
            formula_offsets
                .len()
                .saturating_add(reference_offsets.len()),
        );
        for &offset in formula_offsets {
            if !entry_offsets.contains(&offset) || !source_offsets.insert(offset) {
                return BLOCK_SOURCE_INVALID;
            }
        }
        for &offset in reference_offsets {
            if !entry_offsets.contains(&offset) || !source_offsets.insert(offset) {
                return BLOCK_SOURCE_INVALID;
            }
        }

        let mut prepared_sources = HashMap::with_capacity(source_offsets.len());
        for (&offset, source) in formula_offsets.iter().zip(formula_sources.iter()) {
            prepared_sources.insert(offset, self.parse_formula_entry(source, sheet as u32));
        }
        for (index, &offset) in reference_offsets.iter().enumerate() {
            let target_index = index * 3;
            let target = AbsCellKey {
                sheet: reference_targets[target_index],
                row: reference_targets[target_index + 1],
                col: reference_targets[target_index + 2],
            };
            let target_sheet = target.sheet as usize;
            if !self.sheet_alive.get(target_sheet).copied().unwrap_or(false)
                || !self.sheets[target_sheet]
                    .contains_cell(target.row as usize, target.col as usize)
            {
                return BLOCK_SOURCE_INVALID;
            }
            prepared_sources.insert(
                offset,
                FormulaEntry::reference(target, &self.sheet_names[target_sheet], sheet as u32),
            );
        }

        if let Some(revision) = dirty_revision {
            if !self.sheets[sheet].prepare_dirty_cells(&destination_cells, revision) {
                return BLOCK_RESOURCE_LIMIT;
            }
        }

        let mut string_ids = vec![NO_STRING; offsets.len()];
        for (index, text) in texts.iter().enumerate() {
            if !source_offsets.contains(&offsets[index]) && kinds[index] == KIND_STRING {
                string_ids[index] = self.intern(text);
            }
        }

        let mut wrote = false;
        let mut changed_sources = false;
        let data = &mut self.sheets[sheet];
        for (index, &offset) in offsets.iter().enumerate() {
            let offset_usize = offset as usize;
            let row = start_row + offset_usize / cols;
            let col = start_col + offset_usize % cols;
            let Some(key) = cell_key(row, col) else {
                return BLOCK_SOURCE_INVALID;
            };
            let source = prepared_sources.remove(&offset);
            let (kind, payload) = if source.is_some() {
                (KIND_FORMULA, 0)
            } else {
                match kinds[index] {
                    KIND_NUMBER | KIND_BOOL => (kinds[index], encode_num(numbers[index])),
                    KIND_STRING => (KIND_STRING, encode_str_id(string_ids[index])),
                    _ => (KIND_EMPTY, 0),
                }
            };
            let accepted = if hydrating {
                data.hydrate_cell(row, col, kind, payload, styles[index])
            } else {
                data.write_cell(row, col, kind, payload, styles[index], dirty_revision)
            };
            if !accepted {
                if hydrating {
                    continue;
                }
                return BLOCK_RESOURCE_LIMIT;
            }
            wrote = true;
            if !hydrating {
                data.dirty_cells.insert(key);
            }
            changed_sources |= data.formulas.remove(&key).is_some();
            if let Some(entry) = source {
                data.formulas.insert(key, entry);
                changed_sources = true;
            }
        }
        if wrote && hydrating {
            data.all_dirty = true;
        }
        if changed_sources {
            self.bump_formula_epoch();
        }
        BLOCK_OK
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
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0 > r1
            || c0 > c1
            || r1 >= s.row_count
            || c1 >= s.n_cols
            || (dirty_revision.is_some() && !s.can_dirty_rect(r0, c0, r1 - r0 + 1, c1 - c0 + 1))
        {
            return false;
        }
        if contents {
            s.clear_all_spills();
        }
        let mut removed_formula = false;
        for col in c0..=c1 {
            for row in r0..=r1 {
                if s.is_paged() && !s.is_loaded(row, col) {
                    continue;
                }
                let index = s.idx(row, col);
                let kind = if contents {
                    KIND_EMPTY
                } else {
                    s.kind_at(index)
                };
                let payload = if contents {
                    0
                } else if s.str_id_at(index) != NO_STRING {
                    encode_str_id(s.str_id_at(index))
                } else {
                    encode_num(s.num_at(index))
                };
                let next_style = if style { 0 } else { s.style_at(index) };
                if !s.write_cell(row, col, kind, payload, next_style, dirty_revision) {
                    return false;
                }
                if contents {
                    if let Some(key) = cell_key(row, col) {
                        removed_formula |= s.formulas.remove(&key).is_some();
                    }
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
                if s.is_loaded(row, col) {
                    ids.insert(s.style_at(base + row), ());
                }
            }
        }
        let mut out: Vec<u32> = ids.into_keys().collect();
        out.sort_unstable();
        out
    }

    /// Capture only persisted formula/reference sources in a rectangle. The
    /// returned opaque object is compact in source cardinality, not cell count.
    #[wasm_bindgen(js_name = captureSources)]
    pub fn capture_sources(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
    ) -> Option<SourceSnapshot> {
        let s = self.sheets.get(sheet)?;
        let cell_count = rows.checked_mul(cols)?;
        if rows == 0
            || cols == 0
            || cell_count > u32::MAX as usize
            || r0.checked_add(rows).is_none_or(|end| end > s.row_count)
            || c0.checked_add(cols).is_none_or(|end| end > s.n_cols)
        {
            return None;
        }

        let mut formulas = Vec::new();
        let mut references = Vec::new();
        for (&(row, col), entry) in &s.formulas {
            let row = row as usize;
            let col = col as usize;
            if row < r0 || row >= r0 + rows || col < c0 || col >= c0 + cols {
                continue;
            }
            let offset = ((row - r0) * cols + col - c0) as u32;
            if entry.is_formula() {
                formulas.push((offset, entry.source.clone()));
            } else if let Some(target) = entry.reference_target(sheet as u32) {
                references.push((offset, target));
            }
        }
        formulas.sort_unstable_by_key(|(offset, _)| *offset);
        references.sort_unstable_by_key(|(offset, _)| *offset);

        let mut formula_offsets = Vec::with_capacity(formulas.len());
        let mut formula_sources = Vec::with_capacity(formulas.len());
        for (offset, source) in formulas {
            formula_offsets.push(offset);
            formula_sources.push(source);
        }
        let mut reference_offsets = Vec::with_capacity(references.len());
        let mut reference_targets = Vec::with_capacity(references.len() * 3);
        for (offset, target) in references {
            reference_offsets.push(offset);
            reference_targets.extend_from_slice(&[target.sheet, target.row, target.col]);
        }
        Some(SourceSnapshot {
            formula_offsets,
            formula_sources,
            reference_offsets,
            reference_targets,
        })
    }

    /// Capture persisted formula/reference sources for arbitrary row/column
    /// coordinates. Offsets follow the caller's row-major coordinate order.
    #[wasm_bindgen(js_name = captureSourcesForRows)]
    pub fn capture_sources_for_rows(
        &self,
        sheet: usize,
        rows: &[u32],
        cols: &[u32],
    ) -> Option<SourceSnapshot> {
        let data = self.sheets.get(sheet)?;
        let cell_count = rows.len().checked_mul(cols.len())?;
        if rows.is_empty()
            || cols.is_empty()
            || cell_count > u32::MAX as usize
            || rows.iter().any(|&row| row as usize >= data.row_count)
            || cols.iter().any(|&col| col as usize >= data.n_cols)
        {
            return None;
        }

        let mut formula_offsets = Vec::new();
        let mut formula_sources = Vec::new();
        let mut reference_offsets = Vec::new();
        let mut reference_targets = Vec::new();
        for (row_index, &row) in rows.iter().enumerate() {
            for (col_index, &col) in cols.iter().enumerate() {
                let Some(entry) = data.formulas.get(&(row, col)) else {
                    continue;
                };
                let offset = (row_index * cols.len() + col_index) as u32;
                if entry.is_formula() {
                    formula_offsets.push(offset);
                    formula_sources.push(entry.source.clone());
                } else if let Some(target) = entry.reference_target(sheet as u32) {
                    reference_offsets.push(offset);
                    reference_targets.extend_from_slice(&[target.sheet, target.row, target.col]);
                }
            }
        }
        Some(SourceSnapshot {
            formula_offsets,
            formula_sources,
            reference_offsets,
            reference_targets,
        })
    }

    /// Capture only persisted references for one sheet. The explicit entry cap
    /// bounds allocation for host-side structural admission simulation.
    #[wasm_bindgen(js_name = captureReferences)]
    pub fn capture_references(&self, sheet: usize, max_entries: usize) -> Option<SourceSnapshot> {
        let data = self.sheets.get(sheet)?;
        let cell_count = data.row_count.checked_mul(data.n_cols)?;
        if cell_count > u32::MAX as usize {
            return None;
        }
        let mut references = Vec::new();
        for (&(row, col), entry) in &data.formulas {
            let Some(target) = entry.reference_target(sheet as u32) else {
                continue;
            };
            if references.len() >= max_entries {
                return None;
            }
            let offset = (row as usize)
                .checked_mul(data.n_cols)?
                .checked_add(col as usize)?;
            references.push((offset as u32, target));
        }
        references.sort_unstable_by_key(|(offset, _)| *offset);
        let mut reference_offsets = Vec::with_capacity(references.len());
        let mut reference_targets = Vec::with_capacity(references.len().saturating_mul(3));
        for (offset, target) in references {
            reference_offsets.push(offset);
            reference_targets.extend_from_slice(&[target.sheet, target.row, target.col]);
        }
        Some(SourceSnapshot {
            formula_offsets: Vec::new(),
            formula_sources: Vec::new(),
            reference_offsets,
            reference_targets,
        })
    }

    /// Return packed `[source_sheet, source_row, source_col, ...]` references
    /// targeting one sheet, bounded before crossing into the host.
    #[wasm_bindgen(js_name = referencesTargeting)]
    pub fn references_targeting(
        &self,
        target_sheet: usize,
        max_entries: usize,
    ) -> Option<Vec<u32>> {
        if !self.sheet_alive.get(target_sheet).copied().unwrap_or(false) {
            return Some(Vec::new());
        }
        let mut sources = Vec::new();
        for (source_sheet, data) in self.sheets.iter().enumerate() {
            if !self.sheet_alive.get(source_sheet).copied().unwrap_or(false) {
                continue;
            }
            for (&(row, col), entry) in &data.formulas {
                if entry
                    .reference_target(source_sheet as u32)
                    .is_none_or(|target| target.sheet as usize != target_sheet)
                {
                    continue;
                }
                if sources.len() / 3 >= max_entries {
                    return None;
                }
                sources.extend_from_slice(&[source_sheet as u32, row, col]);
            }
        }
        Some(sources)
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
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0 > r1
            || c0 > c1
            || r1 >= s.row_count
            || c1 >= s.n_cols
            || old_ids.len() != new_ids.len()
            || (dirty_revision.is_some() && !s.can_dirty_rect(r0, c0, r1 - r0 + 1, c1 - c0 + 1))
        {
            return false;
        }
        let mapping: HashMap<u32, u32> = old_ids
            .iter()
            .copied()
            .zip(new_ids.iter().copied())
            .collect();
        for col in c0..=c1 {
            for row in r0..=r1 {
                if !s.is_loaded(row, col) {
                    continue;
                }
                let index = s.idx(row, col);
                let old_style = s.style_at(index);
                let Some(&new_style) = mapping.get(&old_style) else {
                    continue;
                };
                let kind = s.kind_at(index);
                let payload = if s.str_id_at(index) != NO_STRING {
                    encode_str_id(s.str_id_at(index))
                } else {
                    encode_num(s.num_at(index))
                };
                if !s.write_cell(row, col, kind, payload, new_style, dirty_revision) {
                    return false;
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
            let col = c0 + col_offset;
            for row_offset in 0..rows {
                let row = r0 + row_offset;
                let index = s.idx(row, col);
                let key = (row as u32, col as u32);
                let derived = s.spill_owner(key).is_some_and(|anchor| anchor != key);
                kind.push(if derived {
                    KIND_EMPTY
                } else {
                    s.kind_at(index)
                });
                payload.push(if derived {
                    0
                } else if s.str_id_at(index) != NO_STRING {
                    crate::sheet::encode_str_id(s.str_id_at(index))
                } else {
                    crate::sheet::encode_num(s.num_at(index))
                });
                style.push(s.style_at(index));
            }
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
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0
            .checked_add(snapshot.rows)
            .is_none_or(|end| end > s.row_count)
            || c0
                .checked_add(snapshot.cols)
                .is_none_or(|end| end > s.n_cols)
            || (dirty_revision.is_some() && !s.can_dirty_rect(r0, c0, snapshot.rows, snapshot.cols))
        {
            return false;
        }
        s.clear_all_spills();
        s.formulas.retain(|&(row, col), _| {
            let row = row as usize;
            let col = col as usize;
            row < r0 || row >= r0 + snapshot.rows || col < c0 || col >= c0 + snapshot.cols
        });
        for col_offset in 0..snapshot.cols {
            let source = col_offset * snapshot.rows;
            let col = c0 + col_offset;
            for row_offset in 0..snapshot.rows {
                let row = r0 + row_offset;
                if !s.write_cell(
                    row,
                    col,
                    snapshot.kind[source + row_offset],
                    snapshot.payload[source + row_offset],
                    snapshot.style[source + row_offset],
                    dirty_revision,
                ) {
                    return false;
                }
            }
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

    /// Hydrate one datasource page column while retaining local dirty cells and
    /// request-revision exceptions. `protected_offsets` is sorted and relative
    /// to `start_row`.
    #[wasm_bindgen(js_name = hydratePageNumbers)]
    pub fn hydrate_page_numbers(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        values: &[f64],
        style: u32,
        protected_offsets: &[u32],
    ) {
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if col >= existing.n_cols || start_row >= existing.row_count {
            return;
        }

        let limit = values.len().min(existing.row_count - start_row);
        let mut protected_index = 0usize;
        let mut removed_formula = false;
        let mut wrote = false;
        let s = &mut self.sheets[sheet];
        s.clear_all_spills();
        for (offset, &value) in values.iter().take(limit).enumerate() {
            while protected_offsets
                .get(protected_index)
                .is_some_and(|protected| *protected < offset as u32)
            {
                protected_index += 1;
            }
            if protected_offsets.get(protected_index) == Some(&(offset as u32)) {
                continue;
            }
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            if !s.hydrate_cell(row, col, KIND_NUMBER, encode_num(value), style) {
                continue;
            }
            removed_formula |= s.formulas.remove(&key).is_some();
            wrote = true;
        }
        if wrote {
            s.all_dirty = true;
        }
        if removed_formula {
            self.bump_formula_epoch();
        }
    }

    /// Packed-string counterpart to [`CellStore::hydrate_page_numbers`].
    #[wasm_bindgen(js_name = hydratePageStringsPacked)]
    pub fn hydrate_page_strings_packed(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        buf: String,
        utf16_lens: &[u32],
        style: u32,
        protected_offsets: &[u32],
    ) {
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if col >= existing.n_cols || start_row >= existing.row_count {
            return;
        }

        let limit = utf16_lens.len().min(existing.row_count - start_row);
        let slices = utf16_slices(&buf, utf16_lens, limit);
        let mut protected_index = 0usize;
        let mut removed_formula = false;
        let mut wrote = false;
        self.sheets[sheet].clear_all_spills();
        for (offset, text) in slices.into_iter().enumerate() {
            while protected_offsets
                .get(protected_index)
                .is_some_and(|protected| *protected < offset as u32)
            {
                protected_index += 1;
            }
            if protected_offsets.get(protected_index) == Some(&(offset as u32)) {
                continue;
            }
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            if self.sheets[sheet].is_cell_dirty(row, col) {
                continue;
            }
            let id = self.intern(text);
            let s = &mut self.sheets[sheet];
            if !s.hydrate_cell(row, col, KIND_STRING, encode_str_id(id), style) {
                continue;
            }
            removed_formula |= s.formulas.remove(&key).is_some();
            wrote = true;
        }
        if wrote {
            self.sheets[sheet].all_dirty = true;
        }
        if removed_formula {
            self.bump_formula_epoch();
        }
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
        let dirty_revision = self.local_dirty_revision();
        let removed_formula = {
            let Some(s) = self.sheets.get_mut(sheet) else {
                return;
            };
            if col >= s.n_cols || start_row >= s.row_count {
                return;
            }

            s.clear_all_spills();
            let limit = values.len().min(s.row_count - start_row);
            if dirty_revision.is_some() && !s.can_dirty_rect(start_row, col, limit, 1) {
                return;
            }
            let mut removed_formula = false;
            for (offset, &value) in values.iter().take(limit).enumerate() {
                let row = start_row + offset;
                let Some(key) = cell_key(row, col) else {
                    continue;
                };
                if !s.write_cell(
                    row,
                    col,
                    KIND_NUMBER,
                    encode_num(value),
                    style,
                    dirty_revision,
                ) {
                    return;
                }
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
        let dirty_revision = self.local_dirty_revision();
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if col >= existing.n_cols || start_row >= existing.row_count {
            return;
        }

        let limit = values.len().min(existing.row_count - start_row);
        if dirty_revision.is_some() && !existing.can_dirty_rect(start_row, col, limit, 1) {
            return;
        }
        let mut removed_formula = false;
        self.sheets[sheet].clear_all_spills();
        for (offset, value) in values.into_iter().take(limit).enumerate() {
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            let id = self.intern(&value);
            let s = &mut self.sheets[sheet];
            if !s.write_cell(
                row,
                col,
                KIND_STRING,
                encode_str_id(id),
                style,
                dirty_revision,
            ) {
                return;
            }
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
        let dirty_revision = self.local_dirty_revision();
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };
        if col >= existing.n_cols || start_row >= existing.row_count {
            return;
        }

        let limit = utf16_lens.len().min(existing.row_count - start_row);
        if dirty_revision.is_some() && !existing.can_dirty_rect(start_row, col, limit, 1) {
            return;
        }
        let slices = utf16_slices(&buf, utf16_lens, limit);

        let mut removed_formula = false;
        self.sheets[sheet].clear_all_spills();
        for (offset, text) in slices.iter().enumerate() {
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            let id = self.intern(text);
            let s = &mut self.sheets[sheet];
            if !s.write_cell(
                row,
                col,
                KIND_STRING,
                encode_str_id(id),
                style,
                dirty_revision,
            ) {
                return;
            }
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
        self.sheets[sheet].clear_all_spills();
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
        self.sheets[sheet].clear_all_spills();
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
        self.sheets[sheet].clear_all_spills();
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
        self.sheets[sheet].clear_all_spills();
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
        if !s.is_loaded(row, col) {
            return CellOut {
                kind: KIND_STRING,
                num: 0.0,
                string: Some(FormulaError::Loading.sentinel().to_string()),
                style: 0,
            };
        }

        let i = s.idx(row, col);
        let kind = s.kind_at(i);
        let key = cell_key(row, col);
        if kind == KIND_FORMULA {
            if let Some(error) = key.and_then(|key| formula_error_at(s, key)) {
                return CellOut {
                    kind: KIND_STRING,
                    num: 0.0,
                    string: Some(error.sentinel().to_string()),
                    style: s.style_at(i),
                };
            }
            if let Some(entry) = key.and_then(|key| s.formulas.get(&key)) {
                match entry.value_kind {
                    FormulaValueKind::Bool => {
                        return CellOut {
                            kind: KIND_BOOL,
                            num: s.num_at(i),
                            string: None,
                            style: s.style_at(i),
                        };
                    }
                    FormulaValueKind::Text => {
                        return CellOut {
                            kind: KIND_STRING,
                            num: 0.0,
                            string: string_from_pool(&self.strings, s.str_id_at(i)),
                            style: s.style_at(i),
                        };
                    }
                    FormulaValueKind::Number => {}
                    FormulaValueKind::Blank => {
                        return CellOut {
                            kind: KIND_EMPTY,
                            num: 0.0,
                            string: None,
                            style: s.style_at(i),
                        };
                    }
                }
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
            style: s.style_at(i),
        }
    }

    #[wasm_bindgen(js_name = setNamedRange)]
    pub fn set_named_range(
        &mut self,
        name: &str,
        scope: i32,
        sheet: usize,
        row_start: usize,
        col_start: usize,
        row_end: usize,
        col_end: usize,
    ) -> bool {
        let parsed_name = parse(name).ok();
        if name.is_empty()
            || !matches!(parsed_name, Some(crate::calc::Ast::Name(_)))
            || !self.sheet_alive.get(sheet).copied().unwrap_or(false)
            || row_start > row_end
            || col_start > col_end
            || row_end >= self.sheets[sheet].row_count
            || col_end >= self.sheets[sheet].n_cols
        {
            return false;
        }
        let scope = if scope < 0 {
            None
        } else {
            let scope = scope as usize;
            if !self.sheet_alive.get(scope).copied().unwrap_or(false) {
                return false;
            }
            Some(scope as u32)
        };
        let definition = NamedRangeRef {
            name: name.to_string(),
            scope,
            sheet: sheet as u32,
            row_start: row_start as u32,
            col_start: col_start as u32,
            row_end: row_end as u32,
            col_end: col_end as u32,
        };
        self.named_ranges
            .insert((scope, name.to_ascii_uppercase()), definition);
        self.refresh_named_formula_entries();
        self.recompute_all_sheets();
        true
    }

    #[wasm_bindgen(js_name = removeNamedRange)]
    pub fn remove_named_range(&mut self, name: &str, scope: i32) -> bool {
        let scope = if scope < 0 { None } else { Some(scope as u32) };
        if self
            .named_ranges
            .remove(&(scope, name.to_ascii_uppercase()))
            .is_none()
        {
            return false;
        }
        self.refresh_named_formula_entries();
        self.recompute_all_sheets();
        true
    }

    /// Explicit volatile barrier. `serial` is a UTC spreadsheet serial using
    /// the 1899-12-30 epoch; only TODAY/NOW formulas and their dependents dirty.
    #[wasm_bindgen(js_name = recomputeVolatile)]
    pub fn recompute_volatile(&mut self, serial: f64) -> bool {
        if !serial.is_finite() {
            return false;
        }
        self.volatile_serial = serial;
        let mut volatile_sheets = Vec::new();
        for (sheet_index, sheet) in self.sheets.iter_mut().enumerate() {
            let volatile_cells: Vec<_> = sheet
                .formulas
                .iter()
                .filter_map(|(key, entry)| entry.volatile.then_some(*key))
                .collect();
            if volatile_cells.is_empty() {
                continue;
            }
            sheet.dirty_cells.extend(volatile_cells);
            volatile_sheets.push(sheet_index);
        }
        for sheet in volatile_sheets {
            self.recompute_sheet(sheet);
        }
        true
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
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get(sheet) else {
            return f64::NAN;
        };
        if !s.contains_cell(row, col) || (dirty_revision.is_some() && !s.can_dirty_cell(row, col)) {
            return f64::NAN;
        }

        let entry = self.parse_formula_entry(src, sheet as u32);
        let cached_value = {
            let s = &mut self.sheets[sheet];

            let carried = if entry.error.is_some() {
                0.0
            } else {
                s.num_at(s.idx(row, col))
            };
            if !s.write_cell(
                row,
                col,
                KIND_FORMULA,
                encode_num(carried),
                style,
                dirty_revision,
            ) {
                return f64::NAN;
            }
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
        entry.is_formula().then(|| entry.source.clone())
    }

    #[wasm_bindgen(js_name = referenceTarget)]
    pub fn reference_target(&self, sheet: usize, row: usize, col: usize) -> Option<Vec<u32>> {
        let key = cell_key(row, col)?;
        let target = self
            .sheets
            .get(sheet)?
            .formulas
            .get(&key)?
            .reference_target(sheet as u32)?;
        Some(vec![target.sheet, target.row, target.col])
    }
    /// Replace the host-owned merge/protection collision ranges. Packed as
    /// `[row_start, col_start, row_end, col_end, ...]`; invalid input fails
    /// without weakening the old gate.
    #[wasm_bindgen(js_name = setSpillBlockers)]
    pub fn set_spill_blockers(&mut self, sheet: usize, bounds: &[u32]) -> bool {
        if bounds.len() % 4 != 0 || bounds.len() / 4 > 100_000 {
            return false;
        }
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let mut blockers = Vec::with_capacity(bounds.len() / 4);
        for range in bounds.chunks_exact(4) {
            if range[0] > range[2]
                || range[1] > range[3]
                || !data.contains_cell(range[2] as usize, range[3] as usize)
            {
                return false;
            }
            blockers.push(SpillBlocker {
                row_start: range[0],
                col_start: range[1],
                row_end: range[2],
                col_end: range[3],
            });
        }
        let data = &mut self.sheets[sheet];
        if data.spill_blockers != blockers {
            data.spill_blockers = blockers;
            data.clear_dirty();
            data.all_dirty = true;
        }
        true
    }

    /// Stable spill owner coordinate, or `u32::MAX` when `cell` is not part of
    /// a materialized spill.
    #[wasm_bindgen(js_name = spillAnchorRow)]
    pub fn spill_anchor_row(&self, sheet: usize, row: usize, col: usize) -> u32 {
        cell_key(row, col)
            .and_then(|cell| self.sheets.get(sheet)?.spill_owner(cell))
            .map_or(u32::MAX, |anchor| anchor.0)
    }

    #[wasm_bindgen(js_name = spillAnchorCol)]
    pub fn spill_anchor_col(&self, sheet: usize, row: usize, col: usize) -> u32 {
        cell_key(row, col)
            .and_then(|cell| self.sheets.get(sheet)?.spill_owner(cell))
            .map_or(u32::MAX, |anchor| anchor.1)
    }

    /// Row-major mask aligned with render-window layout; `1` marks a derived
    /// spill cell and deliberately excludes the anchor.
    #[wasm_bindgen(js_name = spillDerivedMask)]
    pub fn spill_derived_mask(
        &self,
        sheet: usize,
        row_start: usize,
        row_end: usize,
        cols: &[u32],
    ) -> Vec<u8> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let row_start = row_start.min(data.row_count);
        let row_end = row_end.min(data.row_count);
        let Some(len) = row_end.saturating_sub(row_start).checked_mul(cols.len()) else {
            return Vec::new();
        };
        let mut mask = vec![0; len];
        for (col_index, &col) in cols.iter().enumerate() {
            if col as usize >= data.n_cols {
                continue;
            }
            for row_index in 0..row_end.saturating_sub(row_start) {
                let cell = ((row_start + row_index) as u32, col);
                if data.spill_owner(cell).is_some_and(|anchor| anchor != cell) {
                    mask[row_index * cols.len() + col_index] = 1;
                }
            }
        }
        mask
    }
    /// Row-major derived-cell mask for an explicit view-row order.
    #[wasm_bindgen(js_name = spillDerivedMaskForRows)]
    pub fn spill_derived_mask_for_rows(&self, sheet: usize, rows: &[u32], cols: &[u32]) -> Vec<u8> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let Some(len) = rows.len().checked_mul(cols.len()) else {
            return Vec::new();
        };
        let mut mask = vec![0; len];
        for (row_index, &row) in rows.iter().enumerate() {
            if row as usize >= data.row_count {
                continue;
            }
            for (col_index, &col) in cols.iter().enumerate() {
                if col as usize >= data.n_cols {
                    continue;
                }
                let cell = (row, col);
                if data.spill_owner(cell).is_some_and(|anchor| anchor != cell) {
                    mask[row_index * cols.len() + col_index] = 1;
                }
            }
        }
        mask
    }
    /// Packed row-major `[anchor_row, anchor_col, ...]` owner coordinates.
    #[wasm_bindgen(js_name = spillOwnerCoordinates)]
    pub fn spill_owner_coordinates(
        &self,
        sheet: usize,
        row_start: usize,
        row_end: usize,
        cols: &[u32],
    ) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let row_start = row_start.min(data.row_count);
        let row_end = row_end.min(data.row_count);
        let Some(len) = row_end
            .saturating_sub(row_start)
            .checked_mul(cols.len())
            .and_then(|cells| cells.checked_mul(2))
        else {
            return Vec::new();
        };
        let mut owners = vec![u32::MAX; len];
        for (col_index, &col) in cols.iter().enumerate() {
            if col as usize >= data.n_cols {
                continue;
            }
            for row_index in 0..row_end.saturating_sub(row_start) {
                let cell = ((row_start + row_index) as u32, col);
                if let Some(anchor) = data.spill_owner(cell) {
                    let offset = (row_index * cols.len() + col_index) * 2;
                    owners[offset] = anchor.0;
                    owners[offset + 1] = anchor.1;
                }
            }
        }
        owners
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

    /// Recompute the union of every dirty sheet once at the host transaction
    /// barrier, including cross-sheet formula and plain-reference dependents.
    #[wasm_bindgen(js_name = recomputeChanged)]
    pub fn recompute_changed_sources(&mut self) {
        self.recompute_changed();
    }
}

impl Default for CellStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CellStore {
    fn store_memory_stats(&self) -> StoreMemoryStats {
        let mut stats = StoreMemoryStats::default();
        for sheet in &self.sheets {
            sheet.add_memory_stats(&mut stats);
        }

        let (utf8, spans) = self.strings.memory_stats();
        stats.owner_mut(STRING_POOL_UTF8).add(utf8);
        stats.owner_mut(STRING_POOL_SPANS).add(spans);

        let string_index = stats.owner_mut(STRING_INDEX);
        string_index.add_hash_table::<u64, InternSlot>(
            self.string_lookup.len(),
            self.string_lookup.capacity(),
        );
        for slot in self.string_lookup.values() {
            if let InternSlot::Many(ids) = slot {
                string_index.add_payload(
                    ids.len().saturating_mul(std::mem::size_of::<u32>()),
                    ids.capacity().saturating_mul(std::mem::size_of::<u32>()),
                );
            }
        }

        if let Some(index) = &self.dep_index {
            let (nodes, edges) = index.memory_stats();
            stats.owner_mut(DEPENDENCY_NODES).add(nodes);
            stats.owner_mut(DEPENDENCY_EDGES).add(edges);
        }

        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        metadata.add_payload(
            std::mem::size_of::<CellStore>(),
            std::mem::size_of::<CellStore>(),
        );
        metadata.add_vec::<SheetData>(self.sheets.len(), self.sheets.capacity());
        metadata.add_vec::<String>(self.sheet_names.len(), self.sheet_names.capacity());
        for name in &self.sheet_names {
            metadata.add_payload(name.len(), name.capacity());
        }
        metadata.add_vec::<bool>(self.sheet_alive.len(), self.sheet_alive.capacity());
        metadata
            .add_hash_table::<String, usize>(self.sheet_lookup.len(), self.sheet_lookup.capacity());
        for name in self.sheet_lookup.keys() {
            metadata.add_payload(name.len(), name.capacity());
        }
        metadata.add_hash_table::<(Option<u32>, String), NamedRangeRef>(
            self.named_ranges.len(),
            self.named_ranges.capacity(),
        );
        for ((_, key), value) in &self.named_ranges {
            metadata.add_payload(key.len(), key.capacity());
            metadata.add_payload(value.name.len(), value.name.capacity());
        }
        stats
    }

    #[cfg(test)]
    pub(crate) fn set_spill_owner_limit_for_test(&mut self, cells: usize) {
        self.spill_owner_cell_limit = cells.min(MAX_SPILL_OWNER_CELLS);
    }

    pub(crate) fn try_add_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
    ) -> Result<usize, String> {
        let sheet = SheetData::try_new(n_cols, row_count)?;
        let index = self.sheets.len();
        self.sheets.push(sheet);
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        Ok(index)
    }

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
        self.drop_invalid_references();
        if self.rebase_named_rows(edited_sheet, at, delta) {
            self.refresh_named_formula_entries();
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
        self.drop_invalid_references();
        if self.rebase_named_cols(edited_sheet, at, delta) {
            self.refresh_named_formula_entries();
        }
    }

    fn drop_invalid_references(&mut self) {
        for (sheet_index, sheet) in self.sheets.iter_mut().enumerate() {
            let invalid: Vec<_> = sheet
                .formulas
                .iter()
                .filter_map(|(key, entry)| {
                    (entry.is_reference() && entry.reference_target(sheet_index as u32).is_none())
                        .then_some(*key)
                })
                .collect();
            for key in invalid {
                sheet.formulas.remove(&key);
                let (row, col) = (key.0 as usize, key.1 as usize);
                if sheet.contains_cell(row, col) {
                    let style = sheet.style_at(sheet.idx(row, col));
                    let _ = sheet.write_cell(row, col, KIND_EMPTY, 0, style, None);
                }
            }
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
impl CellStore {
    fn named_range(&self, name: &str, formula_sheet: u32) -> Option<NamedRangeRef> {
        let normalized = name.to_ascii_uppercase();
        self.named_ranges
            .get(&(Some(formula_sheet), normalized.clone()))
            .or_else(|| self.named_ranges.get(&(None, normalized)))
            .cloned()
    }

    fn parse_formula_entry(&self, source: &str, formula_sheet: u32) -> FormulaEntry {
        let ast = match parse(source) {
            Ok(ast) => ast,
            Err(_) => return FormulaEntry::parse_error(source),
        };
        let ast = match resolve_sheet_refs(ast, &|name| {
            self.sheet_lookup.get(name).map(|&index| index as u32)
        }) {
            Ok(ast) => ast,
            Err(_) => return FormulaEntry::error(source, FormulaError::Ref),
        };
        let ast = resolve_named_ranges(ast, formula_sheet, &|name, sheet| {
            self.named_range(name, sheet)
        });
        FormulaEntry::parsed_source(ast, formula_sheet, source.to_string())
    }

    fn rebase_named_rows(&mut self, edited_sheet: u32, at: u32, delta: i64) -> bool {
        let mut removed = Vec::new();
        let mut changed = false;
        for (key, definition) in &mut self.named_ranges {
            if definition.sheet != edited_sheet {
                continue;
            }
            if let Some((start, end)) =
                shift_range(definition.row_start, definition.row_end, at, delta)
            {
                definition.row_start = start;
                definition.row_end = end;
            } else {
                removed.push(key.clone());
            }
            changed = true;
        }
        for key in removed {
            self.named_ranges.remove(&key);
        }
        changed
    }

    fn rebase_named_cols(&mut self, edited_sheet: u32, at: u32, delta: i64) -> bool {
        let mut removed = Vec::new();
        let mut changed = false;
        for (key, definition) in &mut self.named_ranges {
            if definition.sheet != edited_sheet {
                continue;
            }
            if let Some((start, end)) =
                shift_range(definition.col_start, definition.col_end, at, delta)
            {
                definition.col_start = start;
                definition.col_end = end;
            } else {
                removed.push(key.clone());
            }
            changed = true;
        }
        for key in removed {
            self.named_ranges.remove(&key);
        }
        changed
    }

    fn recompute_all_sheets(&mut self) {
        for sheet in 0..self.sheets.len() {
            if self.sheet_alive.get(sheet).copied().unwrap_or(false) {
                self.recompute_sheet(sheet);
            }
        }
    }

    fn refresh_named_formula_entries(&mut self) {
        for formula_sheet in 0..self.sheets.len() {
            if !self
                .sheet_alive
                .get(formula_sheet)
                .copied()
                .unwrap_or(false)
            {
                continue;
            }
            let sources: Vec<_> = self.sheets[formula_sheet]
                .formulas
                .iter()
                .filter(|(_, entry)| entry.is_formula())
                .map(|(key, entry)| (*key, entry.source.clone()))
                .collect();
            let refreshed: Vec<_> = sources
                .into_iter()
                .map(|(key, source)| (key, self.parse_formula_entry(&source, formula_sheet as u32)))
                .collect();
            let sheet = &mut self.sheets[formula_sheet];
            for (key, entry) in refreshed {
                sheet.formulas.insert(key, entry);
            }
            sheet.clear_dirty();
            sheet.all_dirty = true;
        }
        self.bump_formula_epoch();
    }
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
