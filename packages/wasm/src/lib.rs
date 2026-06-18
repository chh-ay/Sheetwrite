//! Columnar cell store for Sheetwrite, resident in WASM linear memory.
//!
//! Layout decisions:
//! - Values are stored **column-major** (each column is a contiguous run) so
//!   whole-column scans (sort/filter/aggregate, added later) stay cache-local.
//! - A cell value is a tagged scalar: empty, number (`f64`), or interned string.
//!   Strings are dictionary-encoded in a per-store pool so repeated text costs
//!   one `u32` per cell, not a heap allocation.
//! - Styles are *not* held here as objects; the host owns the small style
//!   dictionary and the store keeps only a `u32` style id per cell. That keeps
//!   the large per-cell array in linear memory and the tiny dictionary in JS.
//! - The render loop never reads a single cell across the boundary: it asks for
//!   a whole visible window in one call (`get_window`) and receives contiguous
//!   typed arrays plus the window's unique strings.

use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const KIND_EMPTY: u8 = 0;
const KIND_NUMBER: u8 = 1;
const KIND_STRING: u8 = 2;

const NO_STRING: u32 = u32::MAX;

/// One sheet's column-major scalar grid.
struct SheetData {
    n_cols: usize,
    row_count: usize,
    /// `kind[col * row_count + row]`
    kind: Vec<u8>,
    /// numeric payload, valid when `kind == KIND_NUMBER`
    num: Vec<f64>,
    /// string-pool index, valid when `kind == KIND_STRING`, else `NO_STRING`
    str_id: Vec<u32>,
    /// host style-dictionary id; `0` means "no explicit style"
    style: Vec<u32>,
}

impl SheetData {
    fn new(n_cols: usize, row_count: usize) -> Self {
        let len = n_cols * row_count;
        SheetData {
            n_cols,
            row_count,
            kind: vec![KIND_EMPTY; len],
            num: vec![0.0; len],
            str_id: vec![NO_STRING; len],
            style: vec![0; len],
        }
    }

    #[inline]
    fn idx(&self, row: usize, col: usize) -> usize {
        col * self.row_count + row
    }

    /// Rebuild the column-major buffers for a new row count, preserving the
    /// overlap `[0, min(old, new))` of every column. Used by structural edits.
    fn resize_rows(&mut self, new_row_count: usize) {
        if new_row_count == self.row_count {
            return;
        }

        let keep = self.row_count.min(new_row_count);
        let new_len = self.n_cols * new_row_count;

        let mut kind = vec![KIND_EMPTY; new_len];
        let mut num = vec![0.0; new_len];
        let mut str_id = vec![NO_STRING; new_len];
        let mut style = vec![0u32; new_len];

        for col in 0..self.n_cols {
            let old_base = col * self.row_count;
            let new_base = col * new_row_count;

            kind[new_base..new_base + keep].copy_from_slice(&self.kind[old_base..old_base + keep]);
            num[new_base..new_base + keep].copy_from_slice(&self.num[old_base..old_base + keep]);
            str_id[new_base..new_base + keep]
                .copy_from_slice(&self.str_id[old_base..old_base + keep]);
            style[new_base..new_base + keep]
                .copy_from_slice(&self.style[old_base..old_base + keep]);
        }

        self.kind = kind;
        self.num = num;
        self.str_id = str_id;
        self.style = style;
        self.row_count = new_row_count;
    }

    /// Shift rows `[at, row_count)` down by `count`, opening a blank gap.
    fn insert_rows(&mut self, at: usize, count: usize) {
        if count == 0 {
            return;
        }

        let at = at.min(self.row_count);
        let old = self.row_count;
        self.resize_rows(old + count);
        let rc = self.row_count;

        for col in 0..self.n_cols {
            let base = col * rc;

            // memmove the tail down, then clear the opened gap
            self.kind.copy_within(base + at..base + old, base + at + count);
            self.num.copy_within(base + at..base + old, base + at + count);
            self.str_id.copy_within(base + at..base + old, base + at + count);
            self.style.copy_within(base + at..base + old, base + at + count);

            for i in base + at..base + at + count {
                self.kind[i] = KIND_EMPTY;
                self.num[i] = 0.0;
                self.str_id[i] = NO_STRING;
                self.style[i] = 0;
            }
        }
    }

    /// Delete `count` rows starting at `at`, closing the gap.
    fn delete_rows(&mut self, at: usize, count: usize) {
        if count == 0 || at >= self.row_count {
            return;
        }

        let count = count.min(self.row_count - at);
        let old = self.row_count;

        for col in 0..self.n_cols {
            let base = col * old;

            self.kind.copy_within(base + at + count..base + old, base + at);
            self.num.copy_within(base + at + count..base + old, base + at);
            self.str_id.copy_within(base + at + count..base + old, base + at);
            self.style.copy_within(base + at + count..base + old, base + at);
        }

        self.resize_rows(old - count);
    }
}

/// The workbook-wide store: every sheet, one string pool.
#[wasm_bindgen]
pub struct CellStore {
    sheets: Vec<SheetData>,
    strings: Vec<String>,
    string_lookup: HashMap<String, u32>,
}

#[wasm_bindgen]
impl CellStore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> CellStore {
        CellStore {
            sheets: Vec::new(),
            strings: Vec::new(),
            string_lookup: HashMap::new(),
        }
    }

    /// Allocate a sheet grid and return its numeric handle.
    #[wasm_bindgen(js_name = addSheet)]
    pub fn add_sheet(&mut self, n_cols: usize, row_count: usize) -> usize {
        self.sheets.push(SheetData::new(n_cols, row_count));
        self.sheets.len() - 1
    }

    #[wasm_bindgen(js_name = rowCount)]
    pub fn row_count(&self, sheet: usize) -> usize {
        self.sheets[sheet].row_count
    }

    #[wasm_bindgen(js_name = colCount)]
    pub fn col_count(&self, sheet: usize) -> usize {
        self.sheets[sheet].n_cols
    }

    fn intern(&mut self, s: &str) -> u32 {
        if let Some(&id) = self.string_lookup.get(s) {
            return id;
        }
        let id = self.strings.len() as u32;
        self.strings.push(s.to_string());
        self.string_lookup.insert(s.to_string(), id);
        id
    }

    #[wasm_bindgen(js_name = setNumber)]
    pub fn set_number(&mut self, sheet: usize, row: usize, col: usize, value: f64, style: u32) {
        let s = &mut self.sheets[sheet];
        let i = s.idx(row, col);
        s.kind[i] = KIND_NUMBER;
        s.num[i] = value;
        s.str_id[i] = NO_STRING;
        s.style[i] = style;
    }

    #[wasm_bindgen(js_name = setString)]
    pub fn set_string(&mut self, sheet: usize, row: usize, col: usize, value: &str, style: u32) {
        let id = self.intern(value);
        let s = &mut self.sheets[sheet];
        let i = s.idx(row, col);
        s.kind[i] = KIND_STRING;
        s.str_id[i] = id;
        s.style[i] = style;
    }

    #[wasm_bindgen(js_name = clearCell)]
    pub fn clear_cell(&mut self, sheet: usize, row: usize, col: usize, style: u32) {
        let s = &mut self.sheets[sheet];
        let i = s.idx(row, col);
        s.kind[i] = KIND_EMPTY;
        s.str_id[i] = NO_STRING;
        s.style[i] = style;
    }

    /// Bulk-load one column with numbers starting at `start_row` (datasource path).
    #[wasm_bindgen(js_name = setColumnNumbers)]
    pub fn set_column_numbers(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        values: &[f64],
        style: u32,
    ) {
        let s = &mut self.sheets[sheet];
        let base = col * s.row_count;
        for (k, &v) in values.iter().enumerate() {
            let r = start_row + k;
            if r >= s.row_count {
                break;
            }
            let i = base + r;
            s.kind[i] = KIND_NUMBER;
            s.num[i] = v;
            s.str_id[i] = NO_STRING;
            s.style[i] = style;
        }
    }

    /// Bulk-load one column with strings starting at `start_row` (datasource path).
    #[wasm_bindgen(js_name = setColumnStrings)]
    pub fn set_column_strings(
        &mut self,
        sheet: usize,
        col: usize,
        start_row: usize,
        values: Vec<String>,
        style: u32,
    ) {
        let row_count = self.sheets[sheet].row_count;
        let base = col * row_count;
        for (k, v) in values.into_iter().enumerate() {
            let r = start_row + k;
            if r >= row_count {
                break;
            }
            let id = self.intern(&v);
            let s = &mut self.sheets[sheet];
            let i = base + r;
            s.kind[i] = KIND_STRING;
            s.str_id[i] = id;
            s.style[i] = style;
        }
    }

    #[wasm_bindgen(js_name = addRows)]
    pub fn add_rows(&mut self, sheet: usize, at: usize, count: usize) {
        self.sheets[sheet].insert_rows(at, count);
    }

    #[wasm_bindgen(js_name = removeRows)]
    pub fn remove_rows(&mut self, sheet: usize, at: usize, count: usize) {
        self.sheets[sheet].delete_rows(at, count);
    }

    /// Single-cell read for interactions/tests — never the render hot path.
    #[wasm_bindgen(js_name = getCell)]
    pub fn get_cell(&self, sheet: usize, row: usize, col: usize) -> CellOut {
        let s = &self.sheets[sheet];
        let i = s.idx(row, col);
        let kind = s.kind[i];
        CellOut {
            kind,
            num: s.num[i],
            string: if kind == KIND_STRING {
                Some(self.strings[s.str_id[i] as usize].clone())
            } else {
                None
            },
            style: s.style[i],
        }
    }

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
        let s = &self.sheets[sheet];
        let row_start = row_start.min(s.row_count);
        let row_end = row_end.min(s.row_count);
        let n_rows = row_end.saturating_sub(row_start);
        let n_cols = cols.len();
        let cells = n_rows * n_cols;

        let mut kind = vec![KIND_EMPTY; cells];
        let mut num = vec![0.0f64; cells];
        let mut str_local = vec![-1i32; cells];
        let mut style = vec![0u32; cells];

        // local dictionary: store-pool id -> dense index within this window
        let mut local_lookup: HashMap<u32, i32> = HashMap::new();
        let mut strings: Vec<String> = Vec::new();

        for (cj, &col_u) in cols.iter().enumerate() {
            let col = col_u as usize;
            if col >= s.n_cols {
                continue;
            }
            let base = col * s.row_count;
            for ri in 0..n_rows {
                let src = base + row_start + ri;
                let dst = ri * n_cols + cj; // row-major output
                let k = s.kind[src];
                kind[dst] = k;
                style[dst] = s.style[src];
                match k {
                    KIND_NUMBER => num[dst] = s.num[src],
                    KIND_STRING => {
                        let pool_id = s.str_id[src];
                        let local = *local_lookup.entry(pool_id).or_insert_with(|| {
                            let next = strings.len() as i32;
                            strings.push(self.strings[pool_id as usize].clone());
                            next
                        });
                        str_local[dst] = local;
                    }
                    _ => {}
                }
            }
        }

        WindowView {
            n_rows: n_rows as u32,
            n_cols: n_cols as u32,
            kind,
            num,
            str_local,
            style,
            strings,
        }
    }
}

impl Default for CellStore {
    fn default() -> Self {
        Self::new()
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

/// A bulk window of resolved cells, row-major over `n_rows x n_cols`.
#[wasm_bindgen]
pub struct WindowView {
    n_rows: u32,
    n_cols: u32,
    kind: Vec<u8>,
    num: Vec<f64>,
    str_local: Vec<i32>,
    style: Vec<u32>,
    strings: Vec<String>,
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
    /// Per-cell tag: 0 empty, 1 number, 2 string.
    #[wasm_bindgen(getter)]
    pub fn kinds(&self) -> Vec<u8> {
        self.kind.clone()
    }
    /// Per-cell numeric payload (valid where kind == 1).
    #[wasm_bindgen(getter)]
    pub fn numbers(&self) -> Vec<f64> {
        self.num.clone()
    }
    /// Per-cell index into `strings` (valid where kind == 2, else -1).
    #[wasm_bindgen(getter, js_name = stringIndex)]
    pub fn string_index(&self) -> Vec<i32> {
        self.str_local.clone()
    }
    /// Per-cell host style-dictionary id.
    #[wasm_bindgen(getter, js_name = styleIds)]
    pub fn style_ids(&self) -> Vec<u32> {
        self.style.clone()
    }
    /// Unique strings referenced by this window.
    #[wasm_bindgen(getter)]
    pub fn strings(&self) -> Vec<String> {
        self.strings.clone()
    }
}
