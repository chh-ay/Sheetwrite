//! Bulk render-window assembly: one boundary crossing per visible window.

use wasm_bindgen::prelude::*;

use crate::query::matches_needle;
use crate::sheet::{formula_error_at, CondPred, SheetData};
use crate::store::CellStore;
use crate::types::{
    cell_key, FormulaError, FormulaValueKind, StringPool, KIND_BOOL, KIND_EMPTY, KIND_FORMULA,
    KIND_NUMBER, KIND_STRING, NO_STRING,
};

#[wasm_bindgen]
impl CellStore {
    /// One bulk read of a rectangular window for the renderer. Returns
    /// contiguous typed arrays (row-major over `rows x cols`) plus the unique
    /// strings referenced by the window, so the host paints without crossing
    /// the boundary per cell.
    #[wasm_bindgen(js_name = getWindow)]
    pub fn get_window(
        &self,
        sheet: usize,
        row_start: usize,
        row_end: usize,
        cols: &[u32],
    ) -> WindowView {
        let Some(s) = self.sheets.get(sheet) else {
            return WindowView::empty();
        };
        let row_start = row_start.min(s.row_count);
        let row_end = row_end.min(s.row_count);
        let n_rows = row_end.saturating_sub(row_start);
        let n_cols = cols.len();
        let cells = n_rows.saturating_mul(n_cols);

        let mut kind = vec![KIND_EMPTY; cells];
        let mut num = vec![0.0f64; cells];
        let mut str_local = vec![-1i32; cells];
        let mut style_local = vec![0u32; cells];
        let mut string_ids = vec![NO_STRING; cells];

        let mut error_slots = [-1i32; 8];
        let mut strings: Vec<String> = Vec::new();
        let mut style_dict: Vec<u32> = Vec::new();

        // 2026-06 release harness: unchecked indexing was 1.02x here,
        // below the 2x threshold; keep the clearer safe loop.
        for (col_index, &col_u) in cols.iter().enumerate() {
            let col = col_u as usize;
            if col >= s.n_cols {
                continue;
            }
            for row_index in 0..n_rows {
                let row = row_start + row_index;
                let dst = row_index * n_cols + col_index;
                fill_window_cell(
                    s,
                    row,
                    col,
                    dst,
                    &mut kind,
                    &mut num,
                    &mut str_local,
                    &mut style_local,
                    &mut string_ids,
                    &mut error_slots,
                    &mut strings,
                    &mut style_dict,
                );
            }
        }

        let row_start_u = row_start as u32;
        let cond_matches = cond_matches_for_window(
            s,
            &self.strings,
            |ri| row_start_u + ri as u32,
            n_rows,
            cols,
            &kind,
            &num,
            &string_ids,
            &str_local,
            &strings,
        );

        WindowView {
            n_rows: n_rows as u32,
            n_cols: n_cols as u32,
            kind,
            num,
            str_local,
            style_local,
            string_ids,
            strings,
            style_dict,
            cond_matches,
        }
    }

    /// Bulk read of an explicit row list (sorted/filtered views) — same output
    /// shape as `get_window`, rows taken from `rows` rather than a range.
    #[wasm_bindgen(js_name = getWindowRows)]
    pub fn get_window_rows(&self, sheet: usize, rows: &[u32], cols: &[u32]) -> WindowView {
        let Some(s) = self.sheets.get(sheet) else {
            return WindowView::empty();
        };
        let n_rows = rows.len();
        let n_cols = cols.len();
        let cells = n_rows.saturating_mul(n_cols);

        let mut kind = vec![KIND_EMPTY; cells];
        let mut num = vec![0.0f64; cells];
        let mut str_local = vec![-1i32; cells];
        let mut style_local = vec![0u32; cells];
        let mut string_ids = vec![NO_STRING; cells];

        let mut error_slots = [-1i32; 8];
        let mut strings: Vec<String> = Vec::new();
        let mut style_dict: Vec<u32> = Vec::new();

        // 2026-06 release harness: unchecked indexing was 0.88x here,
        // below the 2x threshold; keep the clearer safe loop.
        for (col_index, &col_u) in cols.iter().enumerate() {
            let col = col_u as usize;
            if col >= s.n_cols {
                continue;
            }
            for (row_index, &row_u) in rows.iter().enumerate() {
                let row = row_u as usize;
                if row >= s.row_count {
                    continue;
                }
                let dst = row_index * n_cols + col_index;
                fill_window_cell(
                    s,
                    row,
                    col,
                    dst,
                    &mut kind,
                    &mut num,
                    &mut str_local,
                    &mut style_local,
                    &mut string_ids,
                    &mut error_slots,
                    &mut strings,
                    &mut style_dict,
                );
            }
        }

        let cond_matches = cond_matches_for_window(
            s,
            &self.strings,
            |ri| rows.get(ri).copied().unwrap_or(u32::MAX),
            n_rows,
            cols,
            &kind,
            &num,
            &string_ids,
            &str_local,
            &strings,
        );

        WindowView {
            n_rows: n_rows as u32,
            n_cols: n_cols as u32,
            kind,
            num,
            str_local,
            style_local,
            string_ids,
            strings,
            style_dict,
            cond_matches,
        }
    }
}

pub(crate) fn fill_window_cell(
    sheet: &SheetData,
    row: usize,
    col: usize,
    dst: usize,
    kind: &mut [u8],
    num: &mut [f64],
    str_local: &mut [i32],
    style_local: &mut [u32],
    string_ids: &mut [u32],
    error_slots: &mut [i32; 8],
    strings: &mut Vec<String>,
    style_dict: &mut Vec<u32>,
) {
    if !sheet.is_loaded(row, col) {
        kind[dst] = KIND_STRING;
        str_local[dst] = local_error_index(FormulaError::Loading, error_slots, strings);
        return;
    }
    let src = sheet.idx(row, col);
    let stored_kind = sheet.kind_at(src);
    kind[dst] = stored_kind;
    style_local[dst] = local_style_index(sheet.style_at(src), style_dict);

    match stored_kind {
        KIND_NUMBER | KIND_BOOL => num[dst] = sheet.num_at(src),
        KIND_STRING => {
            let pool_id = sheet.str_id_at(src);
            if pool_id == NO_STRING {
                kind[dst] = KIND_EMPTY;
            } else {
                string_ids[dst] = pool_id;
            }
        }
        KIND_FORMULA => {
            let error = cell_key(row, col).and_then(|key| formula_error_at(sheet, key));
            if let Some(error) = error {
                kind[dst] = KIND_STRING;
                str_local[dst] = local_error_index(error, error_slots, strings);
            } else {
                let value_kind = cell_key(row, col)
                    .and_then(|key| sheet.formulas.get(&key))
                    .map(|entry| entry.value_kind);
                match value_kind {
                    Some(FormulaValueKind::Bool) => {
                        kind[dst] = KIND_BOOL;
                        num[dst] = sheet.num_at(src);
                    }
                    Some(FormulaValueKind::Text) => {
                        kind[dst] = KIND_STRING;
                        string_ids[dst] = sheet.str_id_at(src);
                    }
                    _ => {
                        kind[dst] = KIND_NUMBER;
                        num[dst] = sheet.num_at(src);
                    }
                }
            }
        }
        _ => {}
    }
}

/// Window-local style index: linear scan over the (tiny) per-window dict. A
/// visible window holds a handful of distinct styles, so a scan beats a
/// per-frame `HashMap` allocation and hashing on the 60Hz render path.
pub(crate) fn local_style_index(style_id: u32, style_dict: &mut Vec<u32>) -> u32 {
    if let Some(pos) = style_dict.iter().position(|&s| s == style_id) {
        return pos as u32;
    }
    style_dict.push(style_id);
    (style_dict.len() - 1) as u32
}

/// Window-local index of a formula-error sentinel; `slots` is a fixed 6-entry
/// table (one per `FormulaError` variant), allocation-free.
pub(crate) fn local_error_index(
    error: FormulaError,
    slots: &mut [i32; 8],
    strings: &mut Vec<String>,
) -> i32 {
    let slot = &mut slots[error.slot()];
    if *slot < 0 {
        *slot = strings.len() as i32;
        strings.push(error.sentinel().to_string());
    }
    *slot
}

/// Per-cell conditional-format matches for one window: bit `i` set means rule
/// `i` (capped at 32 rules) matched the cell's displayed value. Empty when the
/// sheet has no rules, so rule-free windows pay nothing. Predicates evaluate
/// against the window OUTPUT arrays — the same displayed values the host would
/// otherwise re-derive in JS — including formula results and error sentinels.
#[allow(clippy::too_many_arguments)]
fn cond_matches_for_window<F: Fn(usize) -> u32>(
    sheet: &SheetData,
    pool: &StringPool,
    data_row_at: F,
    n_rows: usize,
    cols: &[u32],
    kind: &[u8],
    num: &[f64],
    string_ids: &[u32],
    str_local: &[i32],
    local_strings: &[String],
) -> Vec<u32> {
    if sheet.cond_rules.is_empty() || n_rows == 0 || cols.is_empty() {
        return Vec::new();
    }

    let n_cols = cols.len();
    let mut matches = vec![0u32; n_rows * n_cols];
    for ri in 0..n_rows {
        let data_row = data_row_at(ri);
        for (cj, &col) in cols.iter().enumerate() {
            let dst = ri * n_cols + cj;
            for (bit, rule) in sheet.cond_rules.iter().take(32).enumerate() {
                let covered =
                    data_row >= rule.r0 && data_row <= rule.r1 && col >= rule.c0 && col <= rule.c1;
                if !covered {
                    continue;
                }
                let hit = cond_pred_matches(
                    &rule.pred,
                    kind[dst],
                    num[dst],
                    cell_text(string_ids[dst], str_local[dst], pool, local_strings),
                );
                if hit {
                    matches[dst] |= 1 << bit;
                }
            }
        }
    }
    matches
}

fn cond_pred_matches(pred: &CondPred, kind: u8, num: f64, text: Option<&str>) -> bool {
    match pred {
        CondPred::GtNum(v) => kind == KIND_NUMBER && num > *v,
        CondPred::LtNum(v) => kind == KIND_NUMBER && num < *v,
        CondPred::EqNum(v) => kind == KIND_NUMBER && num == *v,
        CondPred::EqEmpty => kind == KIND_EMPTY,
        CondPred::EqStr(s) => kind == KIND_STRING && text == Some(s.as_str()),
        CondPred::Contains { needle, match_case } => {
            if kind != KIND_STRING || needle.is_empty() {
                return false;
            }
            text.is_some_and(|hay| matches_needle(hay, needle, !match_case, false))
        }
    }
}

/// Displayed text of a window cell: pooled user/formula text, or the
/// window-local list (formula error sentinels).
fn cell_text<'a>(
    pool_id: u32,
    local_id: i32,
    pool: &'a StringPool,
    local_strings: &'a [String],
) -> Option<&'a str> {
    if pool_id != NO_STRING {
        pool.get(pool_id)
    } else if local_id >= 0 {
        local_strings.get(local_id as usize).map(String::as_str)
    } else {
        None
    }
}

/// A bulk window of resolved cells, row-major over `n_rows x n_cols`.
#[wasm_bindgen]
pub struct WindowView {
    n_rows: u32,
    n_cols: u32,
    kind: Vec<u8>,
    num: Vec<f64>,
    str_local: Vec<i32>,
    style_local: Vec<u32>,
    string_ids: Vec<u32>,
    strings: Vec<String>,
    style_dict: Vec<u32>,
    cond_matches: Vec<u32>,
}

impl WindowView {
    pub(crate) fn empty() -> Self {
        Self {
            n_rows: 0,
            n_cols: 0,
            kind: Vec::new(),
            num: Vec::new(),
            str_local: Vec::new(),
            style_local: Vec::new(),
            string_ids: Vec::new(),
            strings: Vec::new(),
            style_dict: Vec::new(),
            cond_matches: Vec::new(),
        }
    }
}

#[wasm_bindgen]
impl WindowView {
    #[wasm_bindgen(getter, js_name = nRows)]
    pub fn n_rows(&self) -> u32 {
        self.n_rows
    }

    #[wasm_bindgen(getter, js_name = nCols)]
    pub fn n_cols(&self) -> u32 {
        self.n_cols
    }

    /// Consume and return the per-cell tag array: 0 empty, 1 number, 2 string.
    #[wasm_bindgen(js_name = takeKinds)]
    pub fn take_kinds(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.kind)
    }

    /// Consume and return per-cell numeric payloads (valid where kind == 1).
    #[wasm_bindgen(js_name = takeNumbers)]
    pub fn take_numbers(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.num)
    }

    /// Consume and return per-cell indices into `strings` (string cells only).
    #[wasm_bindgen(js_name = takeStringIndex)]
    pub fn take_string_index(&mut self) -> Vec<i32> {
        std::mem::take(&mut self.str_local)
    }

    /// Consume and return per-cell GLOBAL string-pool ids; `u32::MAX` means none.
    #[wasm_bindgen(js_name = takeStringIds)]
    pub fn take_string_ids(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.string_ids)
    }

    /// Consume and return per-cell WINDOW-LOCAL style indices into the dict.
    #[wasm_bindgen(js_name = takeStyleIndex)]
    pub fn take_style_index(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.style_local)
    }

    /// Consume and return the unique global style-dictionary ids referenced by
    /// this window, in local-index order; the host maps each to a `CellStyle`.
    #[wasm_bindgen(js_name = takeStyleDict)]
    pub fn take_style_dict(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.style_dict)
    }

    /// Consume and return unique strings referenced by this window.
    #[wasm_bindgen(js_name = takeStrings)]
    pub fn take_strings(&mut self) -> Vec<String> {
        std::mem::take(&mut self.strings)
    }

    /// Consume and return per-cell conditional-format rule bitmasks; empty
    /// when the sheet has no rules.
    #[wasm_bindgen(js_name = takeCondMatches)]
    pub fn take_cond_matches(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.cond_matches)
    }
}
