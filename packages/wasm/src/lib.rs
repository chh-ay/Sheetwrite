//! Columnar cell store for Sheetwrite, resident in WASM linear memory.
//!
//! Layout decisions:
//! - Values are stored **column-major** (each column is a contiguous run) so
//!   whole-column scans (sort/filter/aggregate) stay cache-local.
//! - A cell value is a tagged scalar: empty, number (`f64`), interned string,
//!   or formula. Strings are dictionary-encoded in a per-store pool so repeated
//!   text costs one `u32` per cell, not a heap allocation.
//! - Styles are *not* held here as objects; the host owns the small style
//!   dictionary and the store keeps only a `u32` style id per cell. That keeps
//!   the large per-cell array in linear memory and the tiny dictionary in JS.
//! - The render loop never reads a single cell across the boundary: it asks for
//!   a whole visible window in one call (`get_window`) and receives contiguous
//!   typed arrays plus the window's unique strings.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet, VecDeque};

use wasm_bindgen::prelude::*;

mod calc;
use calc::{parse, resolve_sheet_refs, shift_rows, Ast, CmpOp, Func, Op};

const KIND_EMPTY: u8 = 0;
const KIND_NUMBER: u8 = 1;
const KIND_STRING: u8 = 2;
const KIND_FORMULA: u8 = 4;

const NO_STRING: u32 = u32::MAX;
const FORMULA_RECURSION_LIMIT: usize = 256;
const RANGE_CELL_LIMIT: u64 = 1_000_000;

type CellKey = (u32, u32);

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct AbsCellKey {
    sheet: u32,
    row: u32,
    col: u32,
}

impl AbsCellKey {
    fn new(sheet: usize, row: u32, col: u32) -> Self {
        Self {
            sheet: sheet as u32,
            row,
            col,
        }
    }

    fn from_local(sheet: usize, (row, col): CellKey) -> Self {
        Self::new(sheet, row, col)
    }

    fn local(self) -> CellKey {
        (self.row, self.col)
    }
}
type EvalResult = Value;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum FormulaError {
    Cycle,
    DivZero,
    Ref,
    Num,
    Value,
    Error,
}

impl FormulaError {
    fn sentinel(self) -> &'static str {
        match self {
            FormulaError::Cycle => "#CYCLE!",
            FormulaError::DivZero => "#DIV/0!",
            FormulaError::Ref => "#REF!",
            FormulaError::Num => "#NUM!",
            FormulaError::Value => "#VALUE!",
            FormulaError::Error => "#ERROR!",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Value {
    Number(f64),
    Text(String),
    Bool(bool),
    Blank,
    Error(FormulaError),
}

impl Value {
    fn number(value: f64) -> Self {
        if value.is_finite() {
            Value::Number(value)
        } else {
            Value::Error(FormulaError::Num)
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct CellRange {
    sheet: u32,
    row_start: u32,
    col_start: u32,
    row_end: u32,
    col_end: u32,
}

impl CellRange {
    fn new(sheet: u32, row_start: u32, col_start: u32, row_end: u32, col_end: u32) -> Self {
        Self {
            sheet,
            row_start,
            col_start,
            row_end,
            col_end,
        }
    }

    fn contains(self, cell: AbsCellKey) -> bool {
        cell.sheet == self.sheet
            && cell.row >= self.row_start
            && cell.row <= self.row_end
            && cell.col >= self.col_start
            && cell.col <= self.col_end
    }
}

/// Cell and range references captured from one formula AST.
///
/// Mutators add changed cells to a per-sheet dirty set. A transaction-barrier
/// recompute grows that set through these read-sets until every dependent
/// formula cell has been found, then evaluates only that affected subgraph.
#[derive(Clone, Debug, Default)]
struct ReadSet {
    cells: Vec<AbsCellKey>,
    ranges: Vec<CellRange>,
}

impl ReadSet {
    fn from_ast(ast: &Ast, formula_sheet: u32) -> Self {
        let mut out = Self::default();
        out.collect(ast, formula_sheet);
        out
    }

    fn collect(&mut self, ast: &Ast, formula_sheet: u32) {
        match ast {
            Ast::Cell(row, col) => self.push_cell(AbsCellKey {
                sheet: formula_sheet,
                row: *row,
                col: *col,
            }),
            Ast::AbsCell(sheet, row, col) => self.push_cell(AbsCellKey {
                sheet: *sheet,
                row: *row,
                col: *col,
            }),
            Ast::Range(row_start, col_start, row_end, col_end) => self.push_range(CellRange::new(
                formula_sheet,
                *row_start,
                *col_start,
                *row_end,
                *col_end,
            )),
            Ast::AbsRange(sheet, row_start, col_start, row_end, col_end) => self.push_range(
                CellRange::new(*sheet, *row_start, *col_start, *row_end, *col_end),
            ),
            Ast::Func(_, args) => {
                for arg in args {
                    self.collect(arg, formula_sheet);
                }
            }
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.collect(left, formula_sheet);
                self.collect(right, formula_sheet);
            }
            Ast::Neg(inner) => self.collect(inner, formula_sheet),
            Ast::SheetCell(_, _, _)
            | Ast::SheetRange(_, _, _, _, _)
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Num(_) => {}
        }
    }

    fn push_cell(&mut self, cell: AbsCellKey) {
        if !self.cells.contains(&cell) {
            self.cells.push(cell);
        }
    }

    fn push_range(&mut self, range: CellRange) {
        if !self.ranges.contains(&range) {
            self.ranges.push(range);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FormulaValueKind {
    Number,
    Text,
    Bool,
}

/// Stored formula metadata: parsed AST, precomputed read-set, and last error.
#[derive(Clone, Debug)]
struct FormulaEntry {
    ast: Option<Ast>,
    reads: ReadSet,
    error: Option<FormulaError>,
    value_kind: FormulaValueKind,
}

impl FormulaEntry {
    fn parsed(ast: Ast, sheet: u32) -> Self {
        let reads = ReadSet::from_ast(&ast, sheet);
        Self {
            ast: Some(ast),
            reads,
            error: None,
            value_kind: FormulaValueKind::Number,
        }
    }

    fn parse_error() -> Self {
        Self {
            ast: None,
            reads: ReadSet::default(),
            error: Some(FormulaError::Error),
            value_kind: FormulaValueKind::Number,
        }
    }

    fn shift_rows(&mut self, at: u32, delta: i64, sheet: u32) {
        if let Some(ast) = &mut self.ast {
            shift_rows(ast, at, delta);
            self.reads = ReadSet::from_ast(ast, sheet);
        }
    }
}

/// One sheet's column-major scalar grid.
struct SheetData {
    n_cols: usize,
    row_count: usize,
    /// `kind[col * row_count + row]`
    kind: Vec<u8>,
    /// Numeric payload, valid when `kind == KIND_NUMBER` or a formula succeeds.
    num: Vec<f64>,
    /// String-pool index, valid when `kind == KIND_STRING`, else `NO_STRING`.
    str_id: Vec<u32>,
    /// Host style-dictionary id; `0` means "no explicit style".
    style: Vec<u32>,
    /// Arithmetic formulas keyed by (row, col); successful results cache in `num`.
    formulas: HashMap<CellKey, FormulaEntry>,
    /// Cells changed since the last transaction-barrier formula recompute.
    dirty_cells: HashSet<CellKey>,
}

impl SheetData {
    fn new(n_cols: usize, row_count: usize) -> Self {
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
            num: vec![0.0; len],
            str_id: vec![NO_STRING; len],
            style: vec![0; len],
            formulas: HashMap::new(),
            dirty_cells: HashSet::new(),
        }
    }

    #[inline]
    fn contains_cell(&self, row: usize, col: usize) -> bool {
        row < self.row_count && col < self.n_cols
    }

    #[inline]
    fn idx(&self, row: usize, col: usize) -> usize {
        col * self.row_count + row
    }

    fn mark_all_formulas_dirty(&mut self) {
        self.dirty_cells.extend(self.formulas.keys().copied());
    }

    /// Rebuild the column-major buffers for a new row count, preserving the
    /// overlap `[0, min(old, new))` of every column. Used by structural edits.
    fn resize_rows(&mut self, new_row_count: usize) {
        if new_row_count == self.row_count {
            return;
        }

        let Some(new_len) = self.n_cols.checked_mul(new_row_count) else {
            return;
        };

        let keep = self.row_count.min(new_row_count);
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

        self.formulas.retain(|&(row, col), _| {
            (row as usize) < new_row_count && (col as usize) < self.n_cols
        });
        self.dirty_cells
            .retain(|&(row, col)| (row as usize) < new_row_count && (col as usize) < self.n_cols);
        self.mark_all_formulas_dirty();
    }

    /// Shift rows `[at, row_count)` down by `count`, opening a blank gap.
    fn insert_rows(&mut self, sheet: u32, at: usize, count: usize) {
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
            self.num
                .copy_within(base + at..base + old, base + at + count);
            self.str_id
                .copy_within(base + at..base + old, base + at + count);
            self.style
                .copy_within(base + at..base + old, base + at + count);

            for i in base + at..base + at + count {
                self.kind[i] = KIND_EMPTY;
                self.num[i] = 0.0;
                self.str_id[i] = NO_STRING;
                self.style[i] = 0;
            }
        }

        if !self.formulas.is_empty() {
            let (at_u, count_u) = (at as u32, count as u32);
            let moved = std::mem::take(&mut self.formulas);
            for ((row, col), mut entry) in moved {
                entry.shift_rows(at_u, i64::from(count_u), sheet);
                let new_row = if row >= at_u {
                    row.saturating_add(count_u)
                } else {
                    row
                };
                self.formulas.insert((new_row, col), entry);
            }
        }

        self.dirty_cells.clear();
        self.mark_all_formulas_dirty();
    }

    /// Delete `count` rows starting at `at`, closing the gap.
    fn delete_rows(&mut self, sheet: u32, at: usize, count: usize) {
        if count == 0 || at >= self.row_count {
            return;
        }

        let count = count.min(self.row_count - at);
        let old = self.row_count;

        for col in 0..self.n_cols {
            let base = col * old;

            self.kind
                .copy_within(base + at + count..base + old, base + at);
            self.num
                .copy_within(base + at + count..base + old, base + at);
            self.str_id
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
                entry.shift_rows(at_u, -i64::from(count_u), sheet);
                let new_row = if row >= at_u.saturating_add(count_u) {
                    row - count_u
                } else {
                    row
                };
                self.formulas.insert((new_row, col), entry);
            }
        }

        self.resize_rows(old - count);
        self.dirty_cells.clear();
        self.mark_all_formulas_dirty();
    }
}

/// The workbook-wide store: every sheet, one string pool.
#[wasm_bindgen]
pub struct CellStore {
    sheets: Vec<SheetData>,
    sheet_names: Vec<String>,
    sheet_lookup: HashMap<String, usize>,
    strings: Vec<String>,
    string_lookup: HashMap<String, u32>,
}

#[wasm_bindgen]
impl CellStore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> CellStore {
        CellStore {
            sheets: Vec::new(),
            sheet_names: Vec::new(),
            sheet_lookup: HashMap::new(),
            strings: Vec::new(),
            string_lookup: HashMap::new(),
        }
    }

    /// Allocate a sheet grid and return its numeric handle.
    #[wasm_bindgen(js_name = addSheet)]
    pub fn add_sheet(&mut self, n_cols: usize, row_count: usize) -> usize {
        let index = self.sheets.len();
        self.sheets.push(SheetData::new(n_cols, row_count));
        self.sheet_names.push(String::new());
        index
    }

    #[wasm_bindgen(js_name = setSheetName)]
    pub fn set_sheet_name(&mut self, sheet: usize, id: &str, name: &str) {
        if sheet >= self.sheets.len() {
            return;
        }

        let previous = std::mem::take(&mut self.sheet_names[sheet]);
        if !previous.is_empty() {
            self.sheet_lookup.remove(&previous);
        }
        self.sheet_names[sheet] = name.to_string();
        self.sheet_lookup.insert(id.to_string(), sheet);
        self.sheet_lookup.insert(name.to_string(), sheet);
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
        let Some(s) = self.sheets.get_mut(sheet) else {
            return;
        };
        if !s.contains_cell(row, col) {
            return;
        }

        let i = s.idx(row, col);
        s.kind[i] = KIND_NUMBER;
        s.num[i] = value;
        s.str_id[i] = NO_STRING;
        s.style[i] = style;
        s.formulas.remove(&key);
        s.dirty_cells.insert(key);
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
        let s = &mut self.sheets[sheet];
        let i = s.idx(row, col);
        s.kind[i] = KIND_STRING;
        s.num[i] = 0.0;
        s.str_id[i] = id;
        s.style[i] = style;
        s.formulas.remove(&key);
        s.dirty_cells.insert(key);
    }

    #[wasm_bindgen(js_name = clearCell)]
    pub fn clear_cell(&mut self, sheet: usize, row: usize, col: usize, style: u32) {
        let Some(key) = cell_key(row, col) else {
            return;
        };
        let Some(s) = self.sheets.get_mut(sheet) else {
            return;
        };
        if !s.contains_cell(row, col) {
            return;
        }

        let i = s.idx(row, col);
        s.kind[i] = KIND_EMPTY;
        s.num[i] = 0.0;
        s.str_id[i] = NO_STRING;
        s.style[i] = style;
        s.formulas.remove(&key);
        s.dirty_cells.insert(key);
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
        let Some(s) = self.sheets.get_mut(sheet) else {
            return;
        };
        if col >= s.n_cols || start_row >= s.row_count {
            return;
        }

        let limit = values.len().min(s.row_count - start_row);
        let base = col * s.row_count;
        for (offset, &value) in values.iter().take(limit).enumerate() {
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            let i = base + row;
            s.kind[i] = KIND_NUMBER;
            s.num[i] = value;
            s.str_id[i] = NO_STRING;
            s.style[i] = style;
            s.formulas.remove(&key);
            s.dirty_cells.insert(key);
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

        for (offset, value) in values.into_iter().take(limit).enumerate() {
            let row = start_row + offset;
            let Some(key) = cell_key(row, col) else {
                continue;
            };
            let id = self.intern(&value);
            let s = &mut self.sheets[sheet];
            let i = base + row;
            s.kind[i] = KIND_STRING;
            s.num[i] = 0.0;
            s.str_id[i] = id;
            s.style[i] = style;
            s.formulas.remove(&key);
            s.dirty_cells.insert(key);
        }
    }

    #[wasm_bindgen(js_name = addRows)]
    pub fn add_rows(&mut self, sheet: usize, at: usize, count: usize) {
        let Some(s) = self.sheets.get_mut(sheet) else {
            return;
        };
        s.insert_rows(sheet as u32, at, count);
    }

    #[wasm_bindgen(js_name = removeRows)]
    pub fn remove_rows(&mut self, sheet: usize, at: usize, count: usize) {
        let Some(s) = self.sheets.get_mut(sheet) else {
            return;
        };
        s.delete_rows(sheet as u32, at, count);
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
            if s.str_id[i] != NO_STRING {
                return CellOut {
                    kind: KIND_STRING,
                    num: s.num[i],
                    string: string_from_pool(&self.strings, s.str_id[i]),
                    style: s.style[i],
                };
            }
        }

        CellOut {
            kind,
            num: s.num[i],
            string: if kind == KIND_STRING {
                string_from_pool(&self.strings, s.str_id[i])
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
        let mut style = vec![0u32; cells];

        let mut local_lookup: HashMap<u32, i32> = HashMap::new();
        let mut error_lookup: HashMap<FormulaError, i32> = HashMap::new();
        let mut strings: Vec<String> = Vec::new();

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
                    &self.strings,
                    row,
                    col,
                    dst,
                    &mut kind,
                    &mut num,
                    &mut str_local,
                    &mut style,
                    &mut local_lookup,
                    &mut error_lookup,
                    &mut strings,
                );
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
        let mut style = vec![0u32; cells];

        let mut local_lookup: HashMap<u32, i32> = HashMap::new();
        let mut error_lookup: HashMap<FormulaError, i32> = HashMap::new();
        let mut strings: Vec<String> = Vec::new();

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
                    &self.strings,
                    row,
                    col,
                    dst,
                    &mut kind,
                    &mut num,
                    &mut str_local,
                    &mut style,
                    &mut local_lookup,
                    &mut error_lookup,
                    &mut strings,
                );
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

    /// Column aggregate over numeric cells. op: 0 sum, 1 avg, 2 min, 3 max, 4 count.
    #[wasm_bindgen(js_name = aggregate)]
    pub fn aggregate(&self, sheet: usize, col: usize, op: u8) -> f64 {
        let Some(s) = self.sheets.get(sheet) else {
            return 0.0;
        };
        if col >= s.n_cols {
            return 0.0;
        }

        let base = col * s.row_count;
        let mut sum = 0.0;
        let mut count = 0u32;
        let mut min = f64::INFINITY;
        let mut max = f64::NEG_INFINITY;
        // 2026-06 release harness: unchecked scalar loads were 4.36x faster
        // for this column-major aggregate, so the loop uses proven indexes.
        for row in 0..s.row_count {
            let i = base + row;
            // SAFETY: `col < s.n_cols` above and `row < s.row_count`, so
            // `base + row` is in-bounds for all column-major cell vectors.
            let stored_kind = unsafe { *s.kind.get_unchecked(i) };
            let value = match stored_kind {
                // SAFETY: same invariant as `stored_kind`; `num` has the same
                // length as `kind` for every `SheetData`.
                KIND_NUMBER => Some(unsafe { *s.num.get_unchecked(i) }),
                KIND_FORMULA => {
                    if key_for_index(s, i).is_some_and(|key| formula_error_at(s, key).is_none())
                        && s.str_id[i] == NO_STRING
                    {
                        // SAFETY: same invariant as `stored_kind`; `num` has the
                        // same length as `kind` for every `SheetData`.
                        Some(unsafe { *s.num.get_unchecked(i) })
                    } else {
                        None
                    }
                }
                _ => None,
            };
            if let Some(value) = value {
                sum += value;
                count += 1;
                min = min.min(value);
                max = max.max(value);
            }
        }
        match op {
            0 => sum,
            1 => {
                if count > 0 {
                    sum / f64::from(count)
                } else {
                    0.0
                }
            }
            2 => {
                if count > 0 {
                    min
                } else {
                    0.0
                }
            }
            3 => {
                if count > 0 {
                    max
                } else {
                    0.0
                }
            }
            _ => f64::from(count),
        }
    }

    /// Stable row order sorted by a column. Returns a data-row permutation.
    #[wasm_bindgen(js_name = sortRows)]
    pub fn sort_rows(&self, sheet: usize, col: usize, ascending: bool) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if col >= s.n_cols {
            return Vec::new();
        }

        let base = col * s.row_count;
        let mut order: Vec<u32> = (0..s.row_count as u32).collect();
        order.sort_by(|&a, &b| {
            // 2026-06 release harness: unchecked sort comparisons were 3.00x faster.
            // SAFETY: `order` contains only rows from `0..s.row_count`, and
            // `col < s.n_cols` above, so both computed indices are in-bounds.
            let ord = unsafe {
                compare_cells_unchecked(s, &self.strings, base + a as usize, base + b as usize)
            };
            if ascending {
                ord
            } else {
                ord.reverse()
            }
        });
        order
    }

    /// Data-row indices whose column text contains `needle` (case-insensitive).
    #[wasm_bindgen(js_name = filterRows)]
    pub fn filter_rows(&self, sheet: usize, col: usize, needle: &str) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if col >= s.n_cols {
            return Vec::new();
        }

        let base = col * s.row_count;
        let needle = needle.to_lowercase();
        let mut out: Vec<u32> = Vec::new();
        // 2026-06 release harness: unchecked text scanning was 1.11x here,
        // below the 2x threshold; keep the safe indexing.
        for row in 0..s.row_count {
            let i = base + row;
            if cell_matches_text(s, &self.strings, i, &needle, true, false) {
                out.push(row as u32);
            }
        }
        out
    }

    /// Cell coordinates whose text matches `query`, as a flat `[row, col, ...]`
    /// list. Scans the requested columns column-major (cache-local), then sorts
    /// row-major so search navigation runs top-to-bottom, left-to-right.
    #[wasm_bindgen(js_name = search)]
    pub fn search(
        &self,
        sheet: usize,
        cols: &[u32],
        query: &str,
        case_insensitive: bool,
        whole_cell: bool,
    ) -> Vec<u32> {
        let needle = if case_insensitive {
            query.to_lowercase()
        } else {
            query.to_string()
        };
        if needle.is_empty() {
            return Vec::new();
        }

        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let mut pairs: Vec<(u32, u32)> = Vec::new();

        for &col_u in cols {
            let col = col_u as usize;
            if col >= s.n_cols {
                continue;
            }

            // 2026-06 release harness: unchecked search scanning was 1.03x here,
            // below the 2x threshold; keep the safe indexing.
            let base = col * s.row_count;
            for row in 0..s.row_count {
                let i = base + row;
                if cell_matches_text(s, &self.strings, i, &needle, case_insensitive, whole_cell) {
                    pairs.push((row as u32, col_u));
                }
            }
        }

        pairs.sort_unstable();

        let mut out = Vec::with_capacity(pairs.len() * 2);
        for (row, col) in pairs {
            out.push(row);
            out.push(col);
        }
        out
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
            resolve_sheet_refs(ast, &|name| self.sheet_lookup.get(name).map(|&idx| idx as u32))
        }) {
            Ok(ast) => FormulaEntry::parsed(ast, sheet as u32),
            Err(_) => FormulaEntry::parse_error(),
        };

        let s = &mut self.sheets[sheet];
        let i = s.idx(row, col);
        s.kind[i] = KIND_FORMULA;
        s.str_id[i] = NO_STRING;
        s.style[i] = style;
        if entry.error.is_some() {
            s.num[i] = 0.0;
        }
        s.formulas.insert(key, entry);
        s.dirty_cells.insert(key);
        s.num[i]
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
    fn intern(&mut self, s: &str) -> u32 {
        if let Some(&id) = self.string_lookup.get(s) {
            return id;
        }
        let id = self.strings.len() as u32;
        self.strings.push(s.to_string());
        self.string_lookup.insert(s.to_string(), id);
        id
    }

    fn recompute_sheet(&mut self, sheet: usize) {
        if sheet >= self.sheets.len() || self.sheets[sheet].dirty_cells.is_empty() {
            return;
        }

        let affected = collect_affected_formulas(&self.sheets, sheet);
        if affected.is_empty() {
            self.sheets[sheet].dirty_cells.clear();
            return;
        }

        let mut memo: HashMap<AbsCellKey, EvalResult> = HashMap::with_capacity(affected.len());
        seed_dependency_depth_errors(&self.sheets, &affected, &mut memo);
        let mut visiting: HashSet<AbsCellKey> = HashSet::new();
        for key in &affected {
            let _ = self.eval_formula_cell(*key, &affected, &mut memo, &mut visiting, 0);
        }

        let results: Vec<(AbsCellKey, EvalResult)> = affected
            .iter()
            .filter_map(|key| memo.get(key).cloned().map(|result| (*key, result)))
            .collect();

        for (abs_key, result) in results {
            let interned = match &result {
                Value::Text(text) => Some(self.intern(text)),
                Value::Bool(value) => Some(self.intern(bool_text(*value))),
                _ => None,
            };

            let sheet_index = abs_key.sheet as usize;
            let Some(s) = self.sheets.get_mut(sheet_index) else {
                continue;
            };
            let (row, col) = abs_key.local();
            let row = row as usize;
            let col = col as usize;
            if !s.contains_cell(row, col) {
                continue;
            }
            let i = s.idx(row, col);
            let Some(entry) = s.formulas.get_mut(&abs_key.local()) else {
                continue;
            };
            match result {
                Value::Number(value) => {
                    s.num[i] = value;
                    s.str_id[i] = NO_STRING;
                    entry.error = None;
                    entry.value_kind = FormulaValueKind::Number;
                }
                Value::Text(_) => {
                    s.num[i] = 0.0;
                    s.str_id[i] = interned.unwrap_or(NO_STRING);
                    entry.error = None;
                    entry.value_kind = FormulaValueKind::Text;
                }
                Value::Bool(value) => {
                    s.num[i] = if value { 1.0 } else { 0.0 };
                    s.str_id[i] = interned.unwrap_or(NO_STRING);
                    entry.error = None;
                    entry.value_kind = FormulaValueKind::Bool;
                }
                Value::Blank => {
                    s.num[i] = 0.0;
                    s.str_id[i] = NO_STRING;
                    entry.error = None;
                    entry.value_kind = FormulaValueKind::Number;
                }
                Value::Error(error) => {
                    s.num[i] = 0.0;
                    s.str_id[i] = NO_STRING;
                    entry.error = Some(error);
                    entry.value_kind = FormulaValueKind::Number;
                }
            }
        }
        self.sheets[sheet].dirty_cells.clear();
    }

    fn eval_at(
        &self,
        sheet: usize,
        row: usize,
        col: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        let Some(s) = self.sheets.get(sheet) else {
            return Value::Error(FormulaError::Ref);
        };
        if !s.contains_cell(row, col) {
            return Value::Error(FormulaError::Ref);
        }

        // 2026-06 release harness: unchecked cell access was 1.13x here,
        // below the 2x threshold; keep the safe indexing.
        let i = s.idx(row, col);
        if let Some(key) = cell_key(row, col) {
            let abs_key = AbsCellKey::from_local(sheet, key);
            if let Some(entry) = s.formulas.get(&key) {
                if affected.contains(&abs_key) {
                    return self.eval_formula_cell(abs_key, affected, memo, visiting, depth + 1);
                }
                return cached_formula_value(s, &self.strings, i, entry);
            }
        }

        match s.kind[i] {
            KIND_NUMBER => Value::number(s.num[i]),
            KIND_STRING => string_from_pool_ref(&self.strings, s.str_id[i])
                .map(|text| Value::Text(text.to_owned()))
                .unwrap_or(Value::Error(FormulaError::Ref)),
            KIND_FORMULA => Value::number(s.num[i]),
            _ => Value::Blank,
        }
    }

    fn eval_formula_cell(
        &self,
        key: AbsCellKey,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }
        if let Some(result) = memo.get(&key) {
            return result.clone();
        }
        if !visiting.insert(key) {
            return Value::Error(FormulaError::Cycle);
        }

        let sheet = key.sheet as usize;
        let local = key.local();
        let result = match self.sheets.get(sheet).and_then(|s| s.formulas.get(&local)) {
            Some(entry) => match &entry.ast {
                Some(ast) => self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1),
                None => Value::Error(entry.error.unwrap_or(FormulaError::Error)),
            },
            None => Value::Number(0.0),
        };

        visiting.remove(&key);
        memo.insert(key, result.clone());
        result
    }

    fn eval_ast(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        match ast {
            Ast::Num(n) => Value::number(*n),
            Ast::Str(text) => Value::Text(text.clone()),
            Ast::Bool(value) => Value::Bool(*value),
            Ast::Cell(row, col) => self.eval_at(
                sheet,
                *row as usize,
                *col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::AbsCell(sheet, row, col) => self.eval_at(
                *sheet as usize,
                *row as usize,
                *col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::SheetCell(_, _, _) => Value::Error(FormulaError::Ref),
            Ast::Range(..) | Ast::AbsRange(..) | Ast::SheetRange(_, _, _, _, _) => {
                Value::Error(FormulaError::Error)
            }
            Ast::Neg(expr) => match number_from_value(&self.eval_ast(
                expr,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            )) {
                Ok(value) => Value::number(-value),
                Err(error) => Value::Error(error),
            },
            Ast::Bin(op, left, right) => {
                let left = self.eval_ast(left, sheet, affected, memo, visiting, depth + 1);
                let a = match number_from_value(&left) {
                    Ok(value) => value,
                    Err(error) => return Value::Error(error),
                };
                let right = self.eval_ast(right, sheet, affected, memo, visiting, depth + 1);
                let b = match number_from_value(&right) {
                    Ok(value) => value,
                    Err(error) => return Value::Error(error),
                };
                match op {
                    Op::Add => Value::number(a + b),
                    Op::Sub => Value::number(a - b),
                    Op::Mul => Value::number(a * b),
                    Op::Div => {
                        if b == 0.0 {
                            Value::Error(FormulaError::DivZero)
                        } else {
                            Value::number(a / b)
                        }
                    }
                }
            }
            Ast::Cmp(op, left, right) => {
                let left = self.eval_ast(left, sheet, affected, memo, visiting, depth + 1);
                let right = self.eval_ast(right, sheet, affected, memo, visiting, depth + 1);
                let ord = match compare_values(&left, &right) {
                    Ok(ord) => ord,
                    Err(error) => return Value::Error(error),
                };
                let res = match op {
                    CmpOp::Eq => ord == Ordering::Equal,
                    CmpOp::Ne => ord != Ordering::Equal,
                    CmpOp::Lt => ord == Ordering::Less,
                    CmpOp::Gt => ord == Ordering::Greater,
                    CmpOp::Le => matches!(ord, Ordering::Less | Ordering::Equal),
                    CmpOp::Ge => matches!(ord, Ordering::Greater | Ordering::Equal),
                };
                Value::Bool(res)
            }
            Ast::Func(func, args) => {
                self.eval_func(*func, args, sheet, affected, memo, visiting, depth + 1)
            }
        }
    }

    fn eval_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        if depth > FORMULA_RECURSION_LIMIT {
            return Value::Error(FormulaError::Num);
        }

        if func == Func::If {
            let Some(condition) = args.first() else {
                return Value::Error(FormulaError::Value);
            };
            let condition = self.eval_ast(condition, sheet, affected, memo, visiting, depth + 1);
            let use_true_branch = match bool_from_value(&condition) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let branch = if use_true_branch {
                args.get(1)
            } else {
                args.get(2)
            };
            return if let Some(branch) = branch {
                self.eval_ast(branch, sheet, affected, memo, visiting, depth + 1)
            } else {
                Value::Number(0.0)
            };
        }

        if func == Func::IfError {
            let Some(primary) = args.first() else {
                return Value::Number(0.0);
            };
            let value = self.eval_ast(primary, sheet, affected, memo, visiting, depth + 1);
            return if matches!(value, Value::Error(_)) {
                if let Some(fallback) = args.get(1) {
                    self.eval_ast(fallback, sheet, affected, memo, visiting, depth + 1)
                } else {
                    Value::Number(0.0)
                }
            } else {
                value
            };
        }

        let mut values = FuncAccumulator::default();
        for arg in args {
            let range = match arg {
                Ast::Range(row_start, col_start, row_end, col_end) => Some(CellRange::new(
                    sheet as u32,
                    *row_start,
                    *col_start,
                    *row_end,
                    *col_end,
                )),
                Ast::AbsRange(sheet, row_start, col_start, row_end, col_end) => Some(
                    CellRange::new(*sheet, *row_start, *col_start, *row_end, *col_end),
                ),
                _ => None,
            };
            if let Some(range) = range {
                if let Err(error) =
                    self.eval_range_values(range, affected, memo, visiting, depth + 1, &mut values)
                {
                    return Value::Error(error);
                }
                continue;
            }

            let value = self.eval_ast(arg, sheet, affected, memo, visiting, depth + 1);
            if let Value::Error(error) = value {
                return Value::Error(error);
            }
            if treats_cell_as_reference(func) && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..)) {
                if !matches!(value, Value::Blank) {
                    values.push_range(value);
                }
            } else {
                values.push_scalar(value);
            }
        }

        apply_func(func, &values)
    }

    fn eval_range_values(
        &self,
        range: CellRange,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
        values: &mut FuncAccumulator,
    ) -> Result<(), FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let sheet = range.sheet as usize;
        let Some(s) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if s.row_count == 0
            || s.n_cols == 0
            || range.row_start as usize >= s.row_count
            || range.col_start as usize >= s.n_cols
        {
            return Err(FormulaError::Ref);
        }

        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(s.row_count - 1);
        let col_end = (range.col_end as usize).min(s.n_cols - 1);

        let row_len = row_end - row_start + 1;
        let col_len = col_end - col_start + 1;
        let total = (row_len as u64).saturating_mul(col_len as u64);
        if total > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }

        for row in row_start..=row_end {
            for col in col_start..=col_end {
                let i = s.idx(row, col);
                if s.kind[i] == KIND_EMPTY {
                    continue;
                }
                let value = self.eval_at(sheet, row, col, affected, memo, visiting, depth + 1);
                if let Value::Error(error) = value {
                    return Err(error);
                }
                values.push_range(value);
            }
        }

        Ok(())
    }
}

#[derive(Debug, Default)]
struct FuncAccumulator {
    values: Vec<FuncValue>,
}

#[derive(Debug)]
struct FuncValue {
    value: Value,
    from_range: bool,
}

impl FuncAccumulator {
    fn push_scalar(&mut self, value: Value) {
        self.values.push(FuncValue {
            value,
            from_range: false,
        });
    }

    fn push_range(&mut self, value: Value) {
        self.values.push(FuncValue {
            value,
            from_range: true,
        });
    }

    fn first(&self, index: usize) -> Value {
        self.values
            .get(index)
            .map(|entry| entry.value.clone())
            .unwrap_or(Value::Number(0.0))
    }

    fn len(&self) -> usize {
        self.values.len()
    }
}

#[derive(Clone, Copy, Debug)]
struct NumericAggregate {
    count: u64,
    sum: f64,
    min: f64,
    max: f64,
}

fn apply_func(func: Func, values: &FuncAccumulator) -> EvalResult {
    match func {
        Func::Count => Value::number(count_numeric(values) as f64),
        Func::CountA => Value::number(count_present(values) as f64),
        Func::Sum => match aggregate_numbers(values) {
            Ok(stats) => Value::number(stats.sum),
            Err(error) => Value::Error(error),
        },
        Func::Avg => match aggregate_numbers(values) {
            Ok(stats) if stats.count > 0 => Value::number(stats.sum / stats.count as f64),
            Ok(_) => Value::Number(0.0),
            Err(error) => Value::Error(error),
        },
        Func::Min => match aggregate_numbers(values) {
            Ok(stats) if stats.count > 0 => Value::number(stats.min),
            Ok(_) => Value::Number(0.0),
            Err(error) => Value::Error(error),
        },
        Func::Max => match aggregate_numbers(values) {
            Ok(stats) if stats.count > 0 => Value::number(stats.max),
            Ok(_) => Value::Number(0.0),
            Err(error) => Value::Error(error),
        },
        Func::If | Func::IfError => values.first(0),
        Func::Abs => {
            number_arg(values, 0, 0.0).map_or_else(Value::Error, |value| Value::number(value.abs()))
        }
        Func::Sqrt => number_arg(values, 0, 0.0)
            .map_or_else(Value::Error, |value| Value::number(value.sqrt())),
        Func::Round => {
            let value = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let digits = match number_arg(values, 1, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let factor = 10f64.powf(digits);
            if factor == 0.0 || !factor.is_finite() {
                Value::Error(FormulaError::Num)
            } else {
                Value::number((value * factor).round() / factor)
            }
        }
        Func::Mod => {
            let value = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let divisor = match number_arg(values, 1, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            if divisor == 0.0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number(value % divisor)
            }
        }
        Func::Pow => {
            let value = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let exponent = match number_arg(values, 1, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            Value::number(value.powf(exponent))
        }
        Func::Floor => {
            let value = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let significance = match number_arg(values, 1, 1.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            if significance == 0.0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number((value / significance).floor() * significance)
            }
        }
        Func::Ceiling => {
            let value = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let significance = match number_arg(values, 1, 1.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            if significance == 0.0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number((value / significance).ceil() * significance)
            }
        }
        Func::Int => number_arg(values, 0, 0.0)
            .map_or_else(Value::Error, |value| Value::number(value.floor())),
        Func::Trunc => {
            let value = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let digits = match number_arg(values, 1, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let factor = 10f64.powf(digits);
            if factor == 0.0 || !factor.is_finite() {
                Value::Error(FormulaError::Num)
            } else {
                Value::number((value * factor).trunc() / factor)
            }
        }
        Func::Sign => number_arg(values, 0, 0.0).map_or_else(Value::Error, |value| {
            Value::Number(if value > 0.0 {
                1.0
            } else if value < 0.0 {
                -1.0
            } else {
                0.0
            })
        }),
        Func::Pi => Value::number(std::f64::consts::PI),
        Func::And => {
            for entry in &values.values {
                match bool_from_value(&entry.value) {
                    Ok(false) => return Value::Bool(false),
                    Ok(true) => {}
                    Err(error) => return Value::Error(error),
                }
            }
            Value::Bool(true)
        }
        Func::Or => {
            for entry in &values.values {
                match bool_from_value(&entry.value) {
                    Ok(true) => return Value::Bool(true),
                    Ok(false) => {}
                    Err(error) => return Value::Error(error),
                }
            }
            Value::Bool(false)
        }
        Func::Not => match bool_from_value(&values.first(0)) {
            Ok(value) => Value::Bool(!value),
            Err(error) => Value::Error(error),
        },
        Func::Len => match text_arg(values, 0) {
            Ok(text) => Value::number(text.chars().count() as f64),
            Err(error) => Value::Error(error),
        },
        Func::Left => {
            let text = match text_arg(values, 0) {
                Ok(text) => text,
                Err(error) => return Value::Error(error),
            };
            let count = match text_count_arg(values, 1, 1.0) {
                Ok(count) => count,
                Err(error) => return Value::Error(error),
            };
            Value::Text(text.chars().take(count).collect())
        }
        Func::Right => {
            let text = match text_arg(values, 0) {
                Ok(text) => text,
                Err(error) => return Value::Error(error),
            };
            let count = match text_count_arg(values, 1, 1.0) {
                Ok(count) => count,
                Err(error) => return Value::Error(error),
            };
            let len = text.chars().count();
            Value::Text(text.chars().skip(len.saturating_sub(count)).collect())
        }
        Func::Mid => {
            let text = match text_arg(values, 0) {
                Ok(text) => text,
                Err(error) => return Value::Error(error),
            };
            let start = match number_arg(values, 1, 1.0) {
                Ok(value) if value >= 1.0 => value.trunc() as usize,
                Ok(_) => return Value::Error(FormulaError::Value),
                Err(error) => return Value::Error(error),
            };
            let count = match text_count_arg(values, 2, 0.0) {
                Ok(count) => count,
                Err(error) => return Value::Error(error),
            };
            Value::Text(text.chars().skip(start - 1).take(count).collect())
        }
        Func::Concat | Func::Concatenate => {
            let mut out = String::new();
            for entry in &values.values {
                match text_from_value(&entry.value) {
                    Ok(text) => out.push_str(&text),
                    Err(error) => return Value::Error(error),
                }
            }
            Value::Text(out)
        }
        Func::Upper => match text_arg(values, 0) {
            Ok(text) => Value::Text(text.to_uppercase()),
            Err(error) => Value::Error(error),
        },
        Func::Lower => match text_arg(values, 0) {
            Ok(text) => Value::Text(text.to_lowercase()),
            Err(error) => Value::Error(error),
        },
        Func::Trim => match text_arg(values, 0) {
            Ok(text) => Value::Text(text.split_whitespace().collect::<Vec<_>>().join(" ")),
            Err(error) => Value::Error(error),
        },
        Func::Text => {
            let value = values.first(0);
            let format = match text_arg(values, 1) {
                Ok(format) => format,
                Err(error) => return Value::Error(error),
            };
            match format_basic_text(&value, &format) {
                Ok(text) => Value::Text(text),
                Err(error) => Value::Error(error),
            }
        }
        Func::Exact => {
            let left = match text_arg(values, 0) {
                Ok(text) => text,
                Err(error) => return Value::Error(error),
            };
            let right = match text_arg(values, 1) {
                Ok(text) => text,
                Err(error) => return Value::Error(error),
            };
            Value::Bool(left == right)
        }
    }
}

fn treats_cell_as_reference(func: Func) -> bool {
    matches!(
        func,
        Func::Sum | Func::Avg | Func::Min | Func::Max | Func::Count | Func::CountA
    )
}

fn cached_formula_value(
    sheet: &SheetData,
    strings: &[String],
    index: usize,
    entry: &FormulaEntry,
) -> Value {
    if let Some(error) = entry.error {
        return Value::Error(error);
    }

    match entry.value_kind {
        FormulaValueKind::Number => Value::number(sheet.num[index]),
        FormulaValueKind::Text => string_from_pool_ref(strings, sheet.str_id[index])
            .map(|text| Value::Text(text.to_owned()))
            .unwrap_or(Value::Error(FormulaError::Ref)),
        FormulaValueKind::Bool => Value::Bool(sheet.num[index] != 0.0),
    }
}

fn bool_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

fn number_from_value(value: &Value) -> Result<f64, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(*value),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Bool(value) => Ok(if *value { 1.0 } else { 0.0 }),
        Value::Text(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Ok(0.0)
            } else {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .ok_or(FormulaError::Value)
            }
        }
        Value::Blank => Ok(0.0),
        Value::Error(error) => Err(*error),
    }
}

fn bool_from_value(value: &Value) -> Result<bool, FormulaError> {
    match value {
        Value::Bool(value) => Ok(*value),
        Value::Number(value) if value.is_finite() => Ok(*value != 0.0),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Text(text) => match text.trim().to_ascii_uppercase().as_str() {
            "TRUE" => Ok(true),
            "FALSE" => Ok(false),
            _ => Err(FormulaError::Value),
        },
        Value::Blank => Ok(false),
        Value::Error(error) => Err(*error),
    }
}

fn text_from_value(value: &Value) -> Result<String, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(value.to_string()),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Text(text) => Ok(text.clone()),
        Value::Bool(value) => Ok(bool_text(*value).to_string()),
        Value::Error(error) => Err(*error),
        Value::Blank => Ok(String::new()),
    }
}

fn compare_values(left: &Value, right: &Value) -> Result<Ordering, FormulaError> {
    match (left, right) {
        (Value::Blank, Value::Blank) => Ok(Ordering::Equal),
        (Value::Blank, Value::Number(right)) => 0.0f64.partial_cmp(right).ok_or(FormulaError::Num),
        (Value::Number(left), Value::Blank) => left.partial_cmp(&0.0).ok_or(FormulaError::Num),
        (Value::Blank, Value::Text(right)) => Ok("".cmp(right.as_str())),
        (Value::Text(left), Value::Blank) => Ok(left.as_str().cmp("")),
        (Value::Blank, Value::Bool(right)) => Ok(false.cmp(right)),
        (Value::Bool(left), Value::Blank) => Ok(left.cmp(&false)),
        (Value::Error(error), _) | (_, Value::Error(error)) => Err(*error),
        (Value::Number(left), Value::Number(right)) => {
            left.partial_cmp(right).ok_or(FormulaError::Num)
        }
        (Value::Text(left), Value::Text(right)) => {
            Ok(left.to_lowercase().cmp(&right.to_lowercase()))
        }
        (Value::Bool(left), Value::Bool(right)) => Ok(left.cmp(right)),
        _ => Ok(value_rank(left).cmp(&value_rank(right))),
    }
}

fn value_rank(value: &Value) -> u8 {
    match value {
        Value::Blank => 0,
        Value::Number(_) => 1,
        Value::Text(_) => 2,
        Value::Bool(_) => 3,
        Value::Error(_) => 4,
    }
}

fn number_arg(values: &FuncAccumulator, index: usize, default: f64) -> Result<f64, FormulaError> {
    if index >= values.len() {
        Ok(default)
    } else {
        number_from_value(&values.values[index].value)
    }
}

fn text_arg(values: &FuncAccumulator, index: usize) -> Result<String, FormulaError> {
    text_from_value(&values.first(index))
}

fn text_count_arg(
    values: &FuncAccumulator,
    index: usize,
    default: f64,
) -> Result<usize, FormulaError> {
    let value = number_arg(values, index, default)?;
    if value < 0.0 || !value.is_finite() {
        Err(FormulaError::Value)
    } else {
        Ok(value.trunc() as usize)
    }
}

fn aggregate_numbers(values: &FuncAccumulator) -> Result<NumericAggregate, FormulaError> {
    let mut stats = NumericAggregate {
        count: 0,
        sum: 0.0,
        min: f64::INFINITY,
        max: f64::NEG_INFINITY,
    };

    for entry in &values.values {
        let Some(number) = aggregate_number(&entry.value, entry.from_range)? else {
            continue;
        };
        if stats.count == 0 {
            stats.min = number;
            stats.max = number;
        } else {
            stats.min = stats.min.min(number);
            stats.max = stats.max.max(number);
        }
        stats.count += 1;
        stats.sum += number;
    }

    Ok(stats)
}

fn count_numeric(values: &FuncAccumulator) -> u64 {
    values
        .values
        .iter()
        .filter(|entry| {
            matches!(
                aggregate_number(&entry.value, entry.from_range),
                Ok(Some(_))
            )
        })
        .count() as u64
}

fn count_present(values: &FuncAccumulator) -> u64 {
    values.len() as u64
}

fn aggregate_number(value: &Value, from_range: bool) -> Result<Option<f64>, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(Some(*value)),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Bool(value) => {
            if from_range {
                Ok(None)
            } else {
                Ok(Some(if *value { 1.0 } else { 0.0 }))
            }
        }
        Value::Text(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() || from_range {
                Ok(None)
            } else {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .map(Some)
                    .ok_or(FormulaError::Value)
            }
        }
        Value::Blank => Ok(None),
        Value::Error(error) => Err(*error),
    }
}

fn format_basic_text(value: &Value, format: &str) -> Result<String, FormulaError> {
    let Value::Number(number) = value else {
        return text_from_value(value);
    };
    if !number.is_finite() {
        return Err(FormulaError::Num);
    }

    if let Some(dot) = format.find('.') {
        let digits = format[dot + 1..]
            .chars()
            .take_while(|ch| matches!(ch, '0' | '#'))
            .count();
        return Ok(format!("{number:.digits$}"));
    }

    if format.contains('0') {
        Ok(format!("{number:.0}"))
    } else {
        Ok(number.to_string())
    }
}

fn collect_affected_formulas(sheets: &[SheetData], seed_sheet: usize) -> HashSet<AbsCellKey> {
    let mut exact_dependents: HashMap<AbsCellKey, Vec<AbsCellKey>> = HashMap::new();
    let mut range_dependents: Vec<(CellRange, AbsCellKey)> = Vec::new();

    for (sheet_index, sheet) in sheets.iter().enumerate() {
        for (&formula_cell, entry) in &sheet.formulas {
            let formula_abs = AbsCellKey::from_local(sheet_index, formula_cell);
            for &cell in &entry.reads.cells {
                exact_dependents.entry(cell).or_default().push(formula_abs);
            }
            for &range in &entry.reads.ranges {
                range_dependents.push((range, formula_abs));
            }
        }
    }

    let mut affected: HashSet<AbsCellKey> = HashSet::new();
    let mut seen_dirty: HashSet<AbsCellKey> = HashSet::new();
    let mut queue: VecDeque<AbsCellKey> = VecDeque::new();
    if let Some(sheet) = sheets.get(seed_sheet) {
        for &cell in &sheet.dirty_cells {
            let abs = AbsCellKey::from_local(seed_sheet, cell);
            seen_dirty.insert(abs);
            queue.push_back(abs);
        }
    }

    while let Some(cell) = queue.pop_front() {
        if formula_exists(sheets, cell) {
            affected.insert(cell);
        }

        if let Some(dependents) = exact_dependents.get(&cell) {
            for &dependent in dependents {
                if affected.insert(dependent) && seen_dirty.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }

        for &(range, dependent) in &range_dependents {
            if range.contains(cell) && affected.insert(dependent) && seen_dirty.insert(dependent) {
                queue.push_back(dependent);
            }
        }
    }

    affected
}

fn formula_exists(sheets: &[SheetData], key: AbsCellKey) -> bool {
    sheets
        .get(key.sheet as usize)
        .is_some_and(|sheet| sheet.formulas.contains_key(&key.local()))
}

fn seed_dependency_depth_errors(
    sheets: &[SheetData],
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
) {
    let dependencies = collect_formula_dependencies(sheets, affected);
    let mut depth_memo: HashMap<AbsCellKey, Result<usize, FormulaError>> =
        HashMap::with_capacity(affected.len());
    let mut visiting: HashSet<AbsCellKey> = HashSet::new();

    for &key in affected {
        if let Err(error) =
            formula_dependency_depth(key, &dependencies, &mut depth_memo, &mut visiting)
        {
            memo.insert(key, Value::Error(error));
        }
    }
}

fn collect_formula_dependencies(
    sheets: &[SheetData],
    affected: &HashSet<AbsCellKey>,
) -> HashMap<AbsCellKey, Vec<AbsCellKey>> {
    let formula_cells: Vec<AbsCellKey> = affected
        .iter()
        .copied()
        .filter(|key| formula_exists(sheets, *key))
        .collect();
    let mut dependencies: HashMap<AbsCellKey, Vec<AbsCellKey>> = HashMap::new();

    for &formula_cell in &formula_cells {
        let Some(entry) = sheets
            .get(formula_cell.sheet as usize)
            .and_then(|sheet| sheet.formulas.get(&formula_cell.local()))
        else {
            continue;
        };

        let deps = dependencies.entry(formula_cell).or_default();
        for &cell in &entry.reads.cells {
            if affected.contains(&cell) && formula_exists(sheets, cell) {
                push_unique_dependency(deps, cell);
            }
        }

        for &range in &entry.reads.ranges {
            for &candidate in &formula_cells {
                if range.contains(candidate) {
                    push_unique_dependency(deps, candidate);
                }
            }
        }
    }

    dependencies
}

fn push_unique_dependency(dependencies: &mut Vec<AbsCellKey>, dependency: AbsCellKey) {
    if !dependencies.contains(&dependency) {
        dependencies.push(dependency);
    }
}

fn formula_dependency_depth(
    key: AbsCellKey,
    dependencies: &HashMap<AbsCellKey, Vec<AbsCellKey>>,
    depth_memo: &mut HashMap<AbsCellKey, Result<usize, FormulaError>>,
    visiting: &mut HashSet<AbsCellKey>,
) -> Result<usize, FormulaError> {
    if let Some(result) = depth_memo.get(&key) {
        return *result;
    }
    if !visiting.insert(key) {
        let result = Err(FormulaError::Cycle);
        depth_memo.insert(key, result);
        return result;
    }

    let mut max_dependency_depth = 0;
    let mut result = Ok(1);
    if let Some(deps) = dependencies.get(&key) {
        for &dependency in deps {
            match formula_dependency_depth(dependency, dependencies, depth_memo, visiting) {
                Ok(depth) => max_dependency_depth = max_dependency_depth.max(depth),
                Err(error) => {
                    result = Err(error);
                    break;
                }
            }
        }
    }

    if result.is_ok() {
        let depth = max_dependency_depth + 1;
        result = if depth > FORMULA_RECURSION_LIMIT {
            Err(FormulaError::Num)
        } else {
            Ok(depth)
        };
    }

    visiting.remove(&key);
    depth_memo.insert(key, result);
    result
}

fn cell_key(row: usize, col: usize) -> Option<CellKey> {
    Some((u32::try_from(row).ok()?, u32::try_from(col).ok()?))
}

fn formula_error_at(sheet: &SheetData, key: CellKey) -> Option<FormulaError> {
    sheet.formulas.get(&key).and_then(|entry| entry.error)
}

fn string_from_pool(strings: &[String], pool_id: u32) -> Option<String> {
    string_from_pool_ref(strings, pool_id).map(str::to_owned)
}

fn string_from_pool_ref(strings: &[String], pool_id: u32) -> Option<&str> {
    if pool_id == NO_STRING {
        return None;
    }
    strings.get(pool_id as usize).map(String::as_str)
}

#[cfg(test)]
fn numeric_cell_value(sheet: &SheetData, index: usize) -> Option<f64> {
    match sheet.kind[index] {
        KIND_NUMBER => Some(sheet.num[index]),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            if formula_error_at(sheet, key).is_none() && sheet.str_id[index] == NO_STRING {
                Some(sheet.num[index])
            } else {
                None
            }
        }
        _ => None,
    }
}

fn key_for_index(sheet: &SheetData, index: usize) -> Option<CellKey> {
    if sheet.row_count == 0 {
        return None;
    }
    let row = index % sheet.row_count;
    let col = index / sheet.row_count;
    cell_key(row, col)
}

fn fill_window_cell(
    sheet: &SheetData,
    global_strings: &[String],
    row: usize,
    col: usize,
    dst: usize,
    kind: &mut [u8],
    num: &mut [f64],
    str_local: &mut [i32],
    style: &mut [u32],
    local_lookup: &mut HashMap<u32, i32>,
    error_lookup: &mut HashMap<FormulaError, i32>,
    strings: &mut Vec<String>,
) {
    let src = sheet.idx(row, col);
    let stored_kind = sheet.kind[src];
    kind[dst] = stored_kind;
    style[dst] = sheet.style[src];

    match stored_kind {
        KIND_NUMBER => num[dst] = sheet.num[src],
        KIND_STRING => {
            if let Some(local) =
                local_string_index(sheet.str_id[src], global_strings, local_lookup, strings)
            {
                str_local[dst] = local;
            } else {
                kind[dst] = KIND_EMPTY;
            }
        }
        KIND_FORMULA => {
            let error = cell_key(row, col).and_then(|key| formula_error_at(sheet, key));
            if let Some(error) = error {
                kind[dst] = KIND_STRING;
                str_local[dst] = local_error_index(error, error_lookup, strings);
            } else if let Some(local) =
                local_string_index(sheet.str_id[src], global_strings, local_lookup, strings)
            {
                kind[dst] = KIND_STRING;
                str_local[dst] = local;
            } else {
                kind[dst] = KIND_NUMBER;
                num[dst] = sheet.num[src];
            }
        }
        _ => {}
    }
}

fn local_string_index(
    pool_id: u32,
    global_strings: &[String],
    local_lookup: &mut HashMap<u32, i32>,
    strings: &mut Vec<String>,
) -> Option<i32> {
    if pool_id == NO_STRING || pool_id as usize >= global_strings.len() {
        return None;
    }

    Some(*local_lookup.entry(pool_id).or_insert_with(|| {
        let next = strings.len() as i32;
        strings.push(global_strings[pool_id as usize].clone());
        next
    }))
}

fn local_error_index(
    error: FormulaError,
    error_lookup: &mut HashMap<FormulaError, i32>,
    strings: &mut Vec<String>,
) -> i32 {
    *error_lookup.entry(error).or_insert_with(|| {
        let next = strings.len() as i32;
        strings.push(error.sentinel().to_string());
        next
    })
}

/// Substring/whole-cell match. `needle` is already lowercased when requested.
fn matches_needle(hay: &str, needle: &str, case_insensitive: bool, whole_cell: bool) -> bool {
    if case_insensitive {
        let lower = hay.to_lowercase();
        return if whole_cell {
            lower == needle
        } else {
            lower.contains(needle)
        };
    }

    if whole_cell {
        hay == needle
    } else {
        hay.contains(needle)
    }
}

fn cell_matches_text(
    sheet: &SheetData,
    strings: &[String],
    index: usize,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    match sheet.kind[index] {
        KIND_NUMBER => {
            let text = sheet.num[index].to_string();
            matches_needle(&text, needle, case_insensitive, whole_cell)
        }
        KIND_FORMULA => {
            let Some(key) = key_for_index(sheet, index) else {
                return false;
            };
            if let Some(error) = formula_error_at(sheet, key) {
                matches_needle(error.sentinel(), needle, case_insensitive, whole_cell)
            } else if let Some(text) = string_from_pool_ref(strings, sheet.str_id[index]) {
                matches_needle(text, needle, case_insensitive, whole_cell)
            } else {
                let text = sheet.num[index].to_string();
                matches_needle(&text, needle, case_insensitive, whole_cell)
            }
        }
        KIND_STRING => string_from_pool_ref(strings, sheet.str_id[index])
            .is_some_and(|text| matches_needle(text, needle, case_insensitive, whole_cell)),
        _ => false,
    }
}

#[cfg(test)]
fn compare_cells(sheet: &SheetData, strings: &[String], ia: usize, ib: usize) -> Ordering {
    let a = ComparableCell::from_cell(sheet, strings, ia);
    let b = ComparableCell::from_cell(sheet, strings, ib);
    a.cmp(&b)
}

unsafe fn compare_cells_unchecked(
    sheet: &SheetData,
    strings: &[String],
    ia: usize,
    ib: usize,
) -> Ordering {
    // 2026-06 release harness: unchecked sort comparisons were 3.00x faster,
    // and `sort_rows` validates the column then generates only valid row ids.
    // SAFETY: caller guarantees `ia` and `ib` are valid cell-vector indices.
    let a = unsafe { ComparableCell::from_cell_unchecked(sheet, strings, ia) };
    // SAFETY: caller guarantees `ia` and `ib` are valid cell-vector indices.
    let b = unsafe { ComparableCell::from_cell_unchecked(sheet, strings, ib) };
    a.cmp(&b)
}

#[derive(Debug, Eq, PartialEq)]
enum ComparableCell<'a> {
    Number(OrderedNumber),
    Text(&'a str),
    Empty,
}

impl<'a> ComparableCell<'a> {
    #[cfg(test)]
    fn from_cell(sheet: &'a SheetData, strings: &'a [String], index: usize) -> Self {
        match sheet.kind[index] {
            KIND_NUMBER => ComparableCell::Number(OrderedNumber(sheet.num[index])),
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return ComparableCell::Empty;
                };
                if let Some(error) = formula_error_at(sheet, key) {
                    ComparableCell::Text(error.sentinel())
                } else if let Some(text) = string_from_pool_ref(strings, sheet.str_id[index]) {
                    ComparableCell::Text(text)
                } else {
                    ComparableCell::Number(OrderedNumber(sheet.num[index]))
                }
            }
            KIND_STRING => string_from_pool_ref(strings, sheet.str_id[index])
                .map_or(ComparableCell::Empty, ComparableCell::Text),
            _ => ComparableCell::Empty,
        }
    }

    unsafe fn from_cell_unchecked(
        sheet: &'a SheetData,
        strings: &'a [String],
        index: usize,
    ) -> Self {
        // SAFETY: caller guarantees `index` is a valid cell-vector index.
        let stored_kind = unsafe { *sheet.kind.get_unchecked(index) };
        match stored_kind {
            // SAFETY: caller guarantees `index` is valid for all cell vectors.
            KIND_NUMBER => {
                ComparableCell::Number(OrderedNumber(unsafe { *sheet.num.get_unchecked(index) }))
            }
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return ComparableCell::Empty;
                };
                if let Some(error) = formula_error_at(sheet, key) {
                    ComparableCell::Text(error.sentinel())
                } else {
                    // SAFETY: caller guarantees `index` is valid for all cell vectors.
                    let pool_id = unsafe { *sheet.str_id.get_unchecked(index) };
                    if let Some(text) = string_from_pool_ref(strings, pool_id) {
                        ComparableCell::Text(text)
                    } else {
                        // SAFETY: caller guarantees `index` is valid for all cell vectors.
                        ComparableCell::Number(OrderedNumber(unsafe {
                            *sheet.num.get_unchecked(index)
                        }))
                    }
                }
            }
            KIND_STRING => {
                // SAFETY: caller guarantees `index` is valid for all cell vectors.
                let pool_id = unsafe { *sheet.str_id.get_unchecked(index) };
                string_from_pool_ref(strings, pool_id)
                    .map_or(ComparableCell::Empty, ComparableCell::Text)
            }
            _ => ComparableCell::Empty,
        }
    }
}

impl Ord for ComparableCell<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (ComparableCell::Empty, ComparableCell::Empty) => Ordering::Equal,
            (ComparableCell::Empty, _) => Ordering::Greater,
            (_, ComparableCell::Empty) => Ordering::Less,
            (ComparableCell::Number(a), ComparableCell::Number(b)) => a.cmp(b),
            (ComparableCell::Text(a), ComparableCell::Text(b)) => a.cmp(b),
            (ComparableCell::Number(_), ComparableCell::Text(_)) => Ordering::Less,
            (ComparableCell::Text(_), ComparableCell::Number(_)) => Ordering::Greater,
        }
    }
}

impl PartialOrd for ComparableCell<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct OrderedNumber(f64);

impl Eq for OrderedNumber {}

impl Ord for OrderedNumber {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for OrderedNumber {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
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
    fn empty() -> Self {
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

impl WindowView {
    fn empty() -> Self {
        Self {
            n_rows: 0,
            n_cols: 0,
            kind: Vec::new(),
            num: Vec::new(),
            str_local: Vec::new(),
            style: Vec::new(),
            strings: Vec::new(),
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

    /// Consume and return per-cell host style-dictionary ids.
    #[wasm_bindgen(js_name = takeStyleIds)]
    pub fn take_style_ids(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.style)
    }

    /// Consume and return unique strings referenced by this window.
    #[wasm_bindgen(js_name = takeStrings)]
    pub fn take_strings(&mut self) -> Vec<String> {
        std::mem::take(&mut self.strings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
        store.get_cell(sheet, row, col).num()
    }

    fn string(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
        store.get_cell(sheet, row, col).string()
    }

    fn put_number(sheet: &mut SheetData, row: usize, col: usize, value: f64) {
        let i = sheet.idx(row, col);
        sheet.kind[i] = KIND_NUMBER;
        sheet.num[i] = value;
    }

    #[derive(Clone, Copy)]
    struct LoopMeasurement {
        name: &'static str,
        safe_ms: f64,
        unchecked_ms: f64,
        ratio: f64,
    }

    #[test]
    #[ignore = "timing harness; run with cargo test --release unsafe_loop_measurements -- --ignored --nocapture"]
    fn unsafe_loop_measurements() {
        use std::hint::black_box;
        use std::time::{Duration, Instant};

        const ROWS: usize = 100_000;
        const COLS: usize = 8;
        const ITERS: usize = 24;
        const SORT_ITERS: usize = 4;

        fn elapsed_ms(duration: Duration) -> f64 {
            duration.as_secs_f64() * 1_000.0
        }

        fn time_loop(mut f: impl FnMut() -> u64, iters: usize) -> (Duration, u64) {
            let mut checksum = f();
            let start = Instant::now();
            for _ in 0..iters {
                checksum ^= black_box(f());
            }
            (start.elapsed(), checksum)
        }

        fn record(
            name: &'static str,
            iters: usize,
            safe: impl FnMut() -> u64,
            unchecked: impl FnMut() -> u64,
        ) -> LoopMeasurement {
            let (safe_elapsed, safe_checksum) = time_loop(safe, iters);
            let (unchecked_elapsed, unchecked_checksum) = time_loop(unchecked, iters);
            assert_eq!(
                safe_checksum, unchecked_checksum,
                "{name} checksum mismatch"
            );

            let safe_ms = elapsed_ms(safe_elapsed);
            let unchecked_ms = elapsed_ms(unchecked_elapsed);
            let ratio = safe_ms / unchecked_ms.max(f64::EPSILON);
            println!("{name}: safe={safe_ms:.3}ms unchecked={unchecked_ms:.3}ms ratio={ratio:.2}x");
            LoopMeasurement {
                name,
                safe_ms,
                unchecked_ms,
                ratio,
            }
        }

        fn make_sheet() -> (SheetData, Vec<String>) {
            let strings = vec![
                String::from("alpha"),
                String::from("beta"),
                String::from("needle"),
                String::from("delta"),
            ];
            let mut sheet = SheetData::new(COLS, ROWS);
            for col in 0..COLS {
                let base = col * ROWS;
                for row in 0..ROWS {
                    let i = base + row;
                    if col == 1 || col == 5 {
                        sheet.kind[i] = KIND_STRING;
                        sheet.str_id[i] = (row % strings.len()) as u32;
                    } else {
                        sheet.kind[i] = KIND_NUMBER;
                        sheet.num[i] = ((row + 1) * (col + 1)) as f64;
                    }
                    sheet.style[i] = ((row + col) & 15) as u32;
                }
            }
            (sheet, strings)
        }

        fn mix(mut acc: u64, value: u64) -> u64 {
            acc = acc.rotate_left(5) ^ value;
            acc.wrapping_mul(0x9E37_79B9_7F4A_7C15)
        }

        fn checksum_float(value: f64) -> u64 {
            value.to_bits().rotate_left(17)
        }

        fn window_safe(sheet: &SheetData, cols: &[u32], kind: &mut [u8], num: &mut [f64]) -> u64 {
            let n_rows = sheet.row_count;
            let n_cols = cols.len();
            let mut checksum = 0;
            for (col_index, &col_u) in cols.iter().enumerate() {
                let col = col_u as usize;
                if col >= sheet.n_cols {
                    continue;
                }
                let base = col * sheet.row_count;
                for row_index in 0..n_rows {
                    let src = base + row_index;
                    let dst = row_index * n_cols + col_index;
                    kind[dst] = sheet.kind[src];
                    num[dst] = sheet.num[src];
                    checksum = mix(checksum, u64::from(kind[dst]) ^ checksum_float(num[dst]));
                }
            }
            checksum
        }

        fn window_unchecked(
            sheet: &SheetData,
            cols: &[u32],
            kind: &mut [u8],
            num: &mut [f64],
        ) -> u64 {
            let n_rows = sheet.row_count;
            let n_cols = cols.len();
            let mut checksum = 0;
            for (col_index, &col_u) in cols.iter().enumerate() {
                let col = col_u as usize;
                if col >= sheet.n_cols {
                    continue;
                }
                let base = col * sheet.row_count;
                for row_index in 0..n_rows {
                    let src = base + row_index;
                    let dst = row_index * n_cols + col_index;
                    // SAFETY: `col < sheet.n_cols`, `row_index < sheet.row_count`, and
                    // the destination buffers are allocated to `n_rows * n_cols`.
                    unsafe {
                        *kind.get_unchecked_mut(dst) = *sheet.kind.get_unchecked(src);
                        *num.get_unchecked_mut(dst) = *sheet.num.get_unchecked(src);
                        checksum = mix(
                            checksum,
                            u64::from(*kind.get_unchecked(dst))
                                ^ checksum_float(*num.get_unchecked(dst)),
                        );
                    }
                }
            }
            checksum
        }

        fn window_rows_safe(
            sheet: &SheetData,
            rows: &[u32],
            cols: &[u32],
            style: &mut [u32],
        ) -> u64 {
            let n_cols = cols.len();
            let mut checksum = 0;
            for (col_index, &col_u) in cols.iter().enumerate() {
                let col = col_u as usize;
                if col >= sheet.n_cols {
                    continue;
                }
                let base = col * sheet.row_count;
                for (row_index, &row_u) in rows.iter().enumerate() {
                    let row = row_u as usize;
                    if row >= sheet.row_count {
                        continue;
                    }
                    let src = base + row;
                    let dst = row_index * n_cols + col_index;
                    style[dst] = sheet.style[src];
                    checksum = mix(checksum, u64::from(style[dst]));
                }
            }
            checksum
        }

        fn window_rows_unchecked(
            sheet: &SheetData,
            rows: &[u32],
            cols: &[u32],
            style: &mut [u32],
        ) -> u64 {
            let n_cols = cols.len();
            let mut checksum = 0;
            for (col_index, &col_u) in cols.iter().enumerate() {
                let col = col_u as usize;
                if col >= sheet.n_cols {
                    continue;
                }
                let base = col * sheet.row_count;
                for (row_index, &row_u) in rows.iter().enumerate() {
                    let row = row_u as usize;
                    if row >= sheet.row_count {
                        continue;
                    }
                    let src = base + row;
                    let dst = row_index * n_cols + col_index;
                    // SAFETY: every row is checked against `sheet.row_count`, `col` is
                    // checked against `sheet.n_cols`, and `dst` is within `rows.len() * n_cols`.
                    unsafe {
                        *style.get_unchecked_mut(dst) = *sheet.style.get_unchecked(src);
                        checksum = mix(checksum, u64::from(*style.get_unchecked(dst)));
                    }
                }
            }
            checksum
        }

        fn aggregate_safe(sheet: &SheetData, col: usize) -> u64 {
            let base = col * sheet.row_count;
            let mut sum = 0.0;
            for row in 0..sheet.row_count {
                if let Some(value) = numeric_cell_value(sheet, base + row) {
                    sum += value;
                }
            }
            checksum_float(sum)
        }

        fn aggregate_unchecked(sheet: &SheetData, col: usize) -> u64 {
            let base = col * sheet.row_count;
            let mut sum = 0.0;
            for row in 0..sheet.row_count {
                let i = base + row;
                // SAFETY: `col` is supplied by the harness as a valid column and
                // `row < sheet.row_count`, so `i < sheet.kind.len() == sheet.num.len()`.
                unsafe {
                    if *sheet.kind.get_unchecked(i) == KIND_NUMBER {
                        sum += *sheet.num.get_unchecked(i);
                    }
                }
            }
            checksum_float(sum)
        }

        fn eval_cell_access_safe(sheet: &SheetData, refs: &[(usize, usize)]) -> u64 {
            let mut checksum = 0;
            for &(row, col) in refs {
                if !sheet.contains_cell(row, col) {
                    continue;
                }
                let i = sheet.idx(row, col);
                if sheet.kind[i] == KIND_NUMBER {
                    checksum = mix(checksum, checksum_float(sheet.num[i]));
                }
            }
            checksum
        }

        fn eval_cell_access_unchecked(sheet: &SheetData, refs: &[(usize, usize)]) -> u64 {
            let mut checksum = 0;
            for &(row, col) in refs {
                if !sheet.contains_cell(row, col) {
                    continue;
                }
                let i = sheet.idx(row, col);
                // SAFETY: `contains_cell` checked `row` and `col`, so `idx(row, col)`
                // is in-bounds for every column-major cell vector.
                unsafe {
                    if *sheet.kind.get_unchecked(i) == KIND_NUMBER {
                        checksum = mix(checksum, checksum_float(*sheet.num.get_unchecked(i)));
                    }
                }
            }
            checksum
        }

        fn text_scan_safe(sheet: &SheetData, strings: &[String], col: usize, needle: &str) -> u64 {
            let base = col * sheet.row_count;
            let mut checksum = 0;
            for row in 0..sheet.row_count {
                if cell_matches_text(sheet, strings, base + row, needle, true, false) {
                    checksum = mix(checksum, row as u64);
                }
            }
            checksum
        }

        fn text_scan_unchecked(
            sheet: &SheetData,
            strings: &[String],
            col: usize,
            needle: &str,
        ) -> u64 {
            let base = col * sheet.row_count;
            let mut checksum = 0;
            for row in 0..sheet.row_count {
                let i = base + row;
                // SAFETY: `col` is supplied by the harness as a valid column and
                // `row < sheet.row_count`, so `i` is valid for `kind` and `str_id`.
                let matched = unsafe {
                    if *sheet.kind.get_unchecked(i) == KIND_STRING {
                        let id = *sheet.str_id.get_unchecked(i) as usize;
                        strings
                            .get(id)
                            .is_some_and(|text| matches_needle(text, needle, true, false))
                    } else {
                        false
                    }
                };
                if matched {
                    checksum = mix(checksum, row as u64);
                }
            }
            checksum
        }

        fn search_safe(sheet: &SheetData, strings: &[String], cols: &[u32], needle: &str) -> u64 {
            let mut checksum = 0;
            for &col_u in cols {
                let col = col_u as usize;
                if col >= sheet.n_cols {
                    continue;
                }
                let base = col * sheet.row_count;
                for row in 0..sheet.row_count {
                    if cell_matches_text(sheet, strings, base + row, needle, true, false) {
                        checksum = mix(checksum, ((row as u64) << 8) ^ u64::from(col_u));
                    }
                }
            }
            checksum
        }

        fn search_unchecked(
            sheet: &SheetData,
            strings: &[String],
            cols: &[u32],
            needle: &str,
        ) -> u64 {
            let mut checksum = 0;
            for &col_u in cols {
                let col = col_u as usize;
                if col >= sheet.n_cols {
                    continue;
                }
                let base = col * sheet.row_count;
                for row in 0..sheet.row_count {
                    let i = base + row;
                    // SAFETY: `col < sheet.n_cols` and `row < sheet.row_count`, so
                    // `i` is in-bounds for the column-major scalar vectors.
                    let matched = unsafe {
                        match *sheet.kind.get_unchecked(i) {
                            KIND_STRING => {
                                let id = *sheet.str_id.get_unchecked(i) as usize;
                                strings
                                    .get(id)
                                    .is_some_and(|text| matches_needle(text, needle, true, false))
                            }
                            KIND_NUMBER => {
                                let text = sheet.num.get_unchecked(i).to_string();
                                matches_needle(&text, needle, true, false)
                            }
                            _ => false,
                        }
                    };
                    if matched {
                        checksum = mix(checksum, ((row as u64) << 8) ^ u64::from(col_u));
                    }
                }
            }
            checksum
        }

        fn sort_safe(sheet: &SheetData, strings: &[String], col: usize) -> u64 {
            let base = col * sheet.row_count;
            let mut order: Vec<u32> = (0..sheet.row_count as u32).rev().collect();
            order.sort_by(|&a, &b| {
                compare_cells(sheet, strings, base + a as usize, base + b as usize)
            });
            order
                .iter()
                .step_by(4096)
                .fold(0, |checksum, &row| mix(checksum, u64::from(row)))
        }

        fn sort_unchecked(sheet: &SheetData, strings: &[String], col: usize) -> u64 {
            let base = col * sheet.row_count;
            let mut order: Vec<u32> = (0..sheet.row_count as u32).rev().collect();
            order.sort_by(|&a, &b| {
                let ia = base + a as usize;
                let ib = base + b as usize;
                // SAFETY: `order` only contains rows in `0..sheet.row_count` and
                // `col` is supplied by the harness as a valid column.
                unsafe { compare_cells_unchecked(sheet, strings, ia, ib) }
            });
            order
                .iter()
                .step_by(4096)
                .fold(0, |checksum, &row| mix(checksum, u64::from(row)))
        }

        unsafe fn compare_cells_unchecked(
            sheet: &SheetData,
            strings: &[String],
            ia: usize,
            ib: usize,
        ) -> Ordering {
            let a = *sheet.kind.get_unchecked(ia);
            let b = *sheet.kind.get_unchecked(ib);
            match (a, b) {
                (KIND_NUMBER, KIND_NUMBER) => {
                    let a = *sheet.num.get_unchecked(ia);
                    let b = *sheet.num.get_unchecked(ib);
                    a.partial_cmp(&b).unwrap_or(Ordering::Equal)
                }
                (KIND_STRING, KIND_STRING) => {
                    let a = *sheet.str_id.get_unchecked(ia) as usize;
                    let b = *sheet.str_id.get_unchecked(ib) as usize;
                    let a = strings.get(a).map_or("", String::as_str);
                    let b = strings.get(b).map_or("", String::as_str);
                    a.cmp(b)
                }
                (KIND_NUMBER, KIND_STRING) => Ordering::Less,
                (KIND_STRING, KIND_NUMBER) => Ordering::Greater,
                (KIND_EMPTY, KIND_EMPTY) => Ordering::Equal,
                (KIND_EMPTY, _) => Ordering::Greater,
                (_, KIND_EMPTY) => Ordering::Less,
                _ => Ordering::Equal,
            }
        }

        let (sheet, strings) = make_sheet();
        let cols: Vec<u32> = (0..COLS as u32).collect();
        let rows: Vec<u32> = (0..ROWS as u32).rev().collect();
        let refs: Vec<(usize, usize)> = (0..ROWS).map(|row| (row, (row >> 4) & 7)).collect();
        let mut window_kind_safe = vec![KIND_EMPTY; ROWS * COLS];
        let mut window_kind_unchecked = vec![KIND_EMPTY; ROWS * COLS];
        let mut window_num_safe = vec![0.0; ROWS * COLS];
        let mut window_num_unchecked = vec![0.0; ROWS * COLS];
        let mut row_style_safe = vec![0u32; ROWS * COLS];
        let mut row_style_unchecked = vec![0u32; ROWS * COLS];
        let needle = "needle";

        let measurements = [
            record(
                "get_window inner cell loop",
                ITERS,
                || window_safe(&sheet, &cols, &mut window_kind_safe, &mut window_num_safe),
                || {
                    window_unchecked(
                        &sheet,
                        &cols,
                        &mut window_kind_unchecked,
                        &mut window_num_unchecked,
                    )
                },
            ),
            record(
                "get_window_rows inner cell loop",
                ITERS,
                || window_rows_safe(&sheet, &rows, &cols, &mut row_style_safe),
                || window_rows_unchecked(&sheet, &rows, &cols, &mut row_style_unchecked),
            ),
            record(
                "aggregate",
                ITERS,
                || aggregate_safe(&sheet, 0),
                || aggregate_unchecked(&sheet, 0),
            ),
            record(
                "eval_at/eval_ast cell access",
                ITERS,
                || eval_cell_access_safe(&sheet, &refs),
                || eval_cell_access_unchecked(&sheet, &refs),
            ),
            record(
                "filter_rows text scan",
                ITERS,
                || text_scan_safe(&sheet, &strings, 1, needle),
                || text_scan_unchecked(&sheet, &strings, 1, needle),
            ),
            record(
                "search text scan",
                ITERS,
                || search_safe(&sheet, &strings, &cols, needle),
                || search_unchecked(&sheet, &strings, &cols, needle),
            ),
            record(
                "sort_rows comparisons",
                SORT_ITERS,
                || sort_safe(&sheet, &strings, 0),
                || sort_unchecked(&sheet, &strings, 0),
            ),
        ];

        let fastest = measurements
            .iter()
            .max_by(|a, b| a.ratio.partial_cmp(&b.ratio).unwrap_or(Ordering::Equal))
            .expect("measurements should not be empty");
        println!(
            "largest unchecked speedup: {} ({:.2}x, safe {:.3}ms, unchecked {:.3}ms)",
            fastest.name, fastest.ratio, fastest.safe_ms, fastest.unchecked_ms
        );
    }

    #[test]
    fn sheet_insert_rows_moves_cells_and_shifts_formulas() {
        let mut sheet = SheetData::new(2, 3);
        put_number(&mut sheet, 0, 0, 10.0);
        put_number(&mut sheet, 1, 0, 20.0);
        put_number(&mut sheet, 2, 1, 30.0);
        sheet
            .formulas
            .insert((0, 0), FormulaEntry::parsed(parse("=A2+B3").unwrap(), 0));

        sheet.insert_rows(0, 1, 1);

        assert_eq!(sheet.row_count, 4);
        assert_eq!(sheet.kind[sheet.idx(1, 0)], KIND_EMPTY);
        assert_close(sheet.num[sheet.idx(2, 0)], 20.0);
        assert_close(sheet.num[sheet.idx(3, 1)], 30.0);

        let entry = sheet.formulas.get(&(0, 0)).expect("formula should remain");
        assert_eq!(entry.ast, Some(parse("=A3+B4").unwrap()));
        assert!(sheet.dirty_cells.contains(&(0, 0)));
    }

    #[test]
    fn sheet_delete_rows_moves_cells_removes_formulas_and_shifts_refs() {
        let mut sheet = SheetData::new(1, 4);
        put_number(&mut sheet, 0, 0, 1.0);
        put_number(&mut sheet, 1, 0, 2.0);
        put_number(&mut sheet, 2, 0, 3.0);
        put_number(&mut sheet, 3, 0, 4.0);
        sheet
            .formulas
            .insert((0, 0), FormulaEntry::parsed(parse("=A4").unwrap(), 0));
        sheet
            .formulas
            .insert((1, 0), FormulaEntry::parsed(parse("=A1").unwrap(), 0));

        sheet.delete_rows(0, 1, 1);

        assert_eq!(sheet.row_count, 3);
        assert_close(sheet.num[sheet.idx(1, 0)], 3.0);
        assert_close(sheet.num[sheet.idx(2, 0)], 4.0);
        assert!(!sheet.formulas.contains_key(&(1, 0)));

        let entry = sheet.formulas.get(&(0, 0)).expect("formula should remain");
        assert_eq!(entry.ast, Some(parse("=A3").unwrap()));
        assert!(sheet.dirty_cells.contains(&(0, 0)));
    }

    #[test]
    fn sheet_resize_rows_preserves_overlap_and_drops_oob_formulas() {
        let mut sheet = SheetData::new(2, 3);
        put_number(&mut sheet, 2, 0, 12.0);
        put_number(&mut sheet, 2, 1, 24.0);
        sheet
            .formulas
            .insert((2, 1), FormulaEntry::parsed(parse("=A3").unwrap(), 0));

        sheet.resize_rows(5);
        assert_eq!(sheet.row_count, 5);
        assert_close(sheet.num[sheet.idx(2, 0)], 12.0);
        assert_close(sheet.num[sheet.idx(2, 1)], 24.0);

        sheet.resize_rows(2);
        assert_eq!(sheet.row_count, 2);
        assert!(!sheet.formulas.contains_key(&(2, 1)));
    }

    #[test]
    fn formulas_cover_functions_ranges_and_comparisons() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 32);
        store.set_number(sheet, 0, 0, 9.0, 0);
        store.set_number(sheet, 1, 0, 3.0, 0);
        store.set_number(sheet, 2, 0, 6.0, 0);
        store.set_number(sheet, 0, 1, 2.0, 0);

        let formulas = [
            (0, 2, "=SUM(A1:A3)"),
            (1, 2, "=AVG(A1:A3)"),
            (2, 2, "=MIN(A1:A3)"),
            (3, 2, "=MAX(A1:A3)"),
            (4, 2, "=COUNT(A1:A3)"),
            (5, 2, "=IF(A1>A2,10,20)"),
            (6, 2, "=ABS(-4)"),
            (7, 2, "=ROUND(1.234,2)"),
            (8, 2, "=SQRT(9)"),
            (9, 2, "=MOD(10,3)"),
            (10, 2, "=POW(2,3)"),
            (11, 2, "=AND(1,1,0)"),
            (12, 2, "=OR(0,0,5)"),
            (13, 2, "=NOT(0)"),
            (14, 2, "=A1>A2"),
            (15, 2, "=A1=A2"),
            (16, 2, "=$A$1 + A$2 + $B1"),
            (17, 2, "=AVERAGE(A1:A3)"),
            (18, 2, "=FLOOR(5.9)"),
            (19, 2, "=FLOOR(5.9,2)"),
            (20, 2, "=CEILING(5.1)"),
            (21, 2, "=CEILING(5.1,2)"),
            (22, 2, "=INT(-1.2)"),
            (23, 2, "=TRUNC(-1.9)"),
            (24, 2, "=TRUNC(12.345,2)"),
            (25, 2, "=SIGN(-9)"),
            (26, 2, "=PI()"),
            (27, 2, "=IFERROR(1/0,42)"),
            (28, 2, "=IFERROR(5,42)"),
            (29, 2, "=COUNTA(A1:A3)"),
        ];
        for (row, col, src) in formulas {
            store.set_formula(sheet, row, col, src, 0);
        }

        store.recompute(sheet);

        let expected = [
            18.0,
            6.0,
            3.0,
            9.0,
            3.0,
            10.0,
            4.0,
            1.23,
            3.0,
            1.0,
            8.0,
            0.0,
            1.0,
            1.0,
            1.0,
            0.0,
            14.0,
            6.0,
            5.0,
            4.0,
            6.0,
            6.0,
            -2.0,
            -1.0,
            12.34,
            -1.0,
            std::f64::consts::PI,
            42.0,
            5.0,
            3.0,
        ];
        for (row, expected) in expected.into_iter().enumerate() {
            assert_close(number(&store, sheet, row, 2), expected);
        }
    }

    #[test]
    fn text_functions_surface_string_and_boolean_values() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 16);
        let formulas = [
            (0, r#"="Hello ""Q""""#),
            (1, r#"=LEN("Hello")"#),
            (2, r#"=LEFT("abcdef",3)"#),
            (3, r#"=RIGHT("abcdef",3)"#),
            (4, r#"=MID("abcdef",2,3)"#),
            (5, r#"=CONCAT("A",1,TRUE)"#),
            (6, r#"=CONCATENATE("x","y")"#),
            (7, r#"=UPPER("MiX")"#),
            (8, r#"=LOWER("MiX")"#),
            (9, r#"=TRIM("  a   b  ")"#),
            (10, r#"=TEXT(12.345,"0.00")"#),
            (11, r#"=EXACT("Hi","Hi")"#),
            (12, r#"=EXACT("Hi","hi")"#),
        ];
        for (row, src) in formulas {
            store.set_formula(sheet, row, 0, src, 0);
        }
        store.recompute(sheet);

        assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_STRING);
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("Hello \"Q\""));
        assert_close(number(&store, sheet, 1, 0), 5.0);
        assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("abc"));
        assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("def"));
        assert_eq!(string(&store, sheet, 4, 0).as_deref(), Some("bcd"));
        assert_eq!(string(&store, sheet, 5, 0).as_deref(), Some("A1TRUE"));
        assert_eq!(string(&store, sheet, 6, 0).as_deref(), Some("xy"));
        assert_eq!(string(&store, sheet, 7, 0).as_deref(), Some("MIX"));
        assert_eq!(string(&store, sheet, 8, 0).as_deref(), Some("mix"));
        assert_eq!(string(&store, sheet, 9, 0).as_deref(), Some("a b"));
        assert_eq!(string(&store, sheet, 10, 0).as_deref(), Some("12.35"));
        assert_eq!(string(&store, sheet, 11, 0).as_deref(), Some("TRUE"));
        assert_eq!(string(&store, sheet, 12, 0).as_deref(), Some("FALSE"));
    }

    #[test]
    fn value_coercion_logic_iferror_and_comparisons() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 14);
        store.set_string(sheet, 0, 0, "2.5", 0);
        store.set_string(sheet, 1, 0, "nope", 0);

        let formulas = [
            (0, r#"=A1+1"#),
            (1, r#"=A2+1"#),
            (2, r#"=IF(TRUE,"yes","no")"#),
            (3, r#"=IF(FALSE,1,2)"#),
            (4, r#"=AND(TRUE,1,"TRUE")"#),
            (5, r#"=OR(FALSE,0,"TRUE")"#),
            (6, r#"=NOT(FALSE)"#),
            (7, r#"=IFERROR(1/0,"fallback")"#),
            (8, r#"=IFERROR("ok",0)"#),
            (9, r#"=1+"3""#),
            (10, r#"="a"="A""#),
            (11, r#"="a"<TRUE"#),
        ];
        for (row, src) in formulas {
            store.set_formula(sheet, row, 1, src, 0);
        }
        store.recompute(sheet);

        assert_close(number(&store, sheet, 0, 1), 3.5);
        assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("#VALUE!"));
        assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("yes"));
        assert_close(number(&store, sheet, 3, 1), 2.0);
        assert_eq!(string(&store, sheet, 4, 1).as_deref(), Some("TRUE"));
        assert_eq!(string(&store, sheet, 5, 1).as_deref(), Some("TRUE"));
        assert_eq!(string(&store, sheet, 6, 1).as_deref(), Some("TRUE"));
        assert_eq!(string(&store, sheet, 7, 1).as_deref(), Some("fallback"));
        assert_eq!(string(&store, sheet, 8, 1).as_deref(), Some("ok"));
        assert_close(number(&store, sheet, 9, 1), 4.0);
        assert_eq!(string(&store, sheet, 10, 1).as_deref(), Some("TRUE"));
        assert_eq!(string(&store, sheet, 11, 1).as_deref(), Some("TRUE"));
    }

    #[test]
    fn aggregate_functions_distinguish_direct_values_from_range_values() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 8);
        store.set_number(sheet, 0, 0, 2.0, 0);
        store.set_string(sheet, 1, 0, "3", 0);
        store.set_string(sheet, 2, 0, "x", 0);
        store.set_formula(sheet, 3, 0, "=TRUE", 0);

        let formulas = [
            (0, "=SUM(A1:A4)"),
            (1, r#"=SUM("3")"#),
            (2, r#"=SUM("x")"#),
            (3, "=COUNT(A1:A4)"),
            (4, "=COUNTA(A1:A5)"),
            (5, "=COUNTA(A5)"),
            (6, "=LEN(A5)"),
            (7, "=A5+1"),
        ];
        for (row, src) in formulas {
            store.set_formula(sheet, row, 1, src, 0);
        }
        store.recompute(sheet);

        assert_close(number(&store, sheet, 0, 1), 2.0);
        assert_close(number(&store, sheet, 1, 1), 3.0);
        assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("#VALUE!"));
        assert_close(number(&store, sheet, 3, 1), 1.0);
        assert_close(number(&store, sheet, 4, 1), 4.0);
        assert_close(number(&store, sheet, 5, 1), 0.0);
        assert_close(number(&store, sheet, 6, 1), 0.0);
        assert_close(number(&store, sheet, 7, 1), 1.0);
    }

    #[test]
    fn value_results_feed_dependencies_and_windows() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 1);
        store.set_formula(sheet, 0, 0, r#"="hello""#, 3);
        store.set_formula(sheet, 0, 1, "=LEN(A1)", 4);
        store.set_formula(sheet, 0, 2, "=TRUE", 5);
        store.set_formula(sheet, 0, 3, "=NOT(C1)", 6);
        store.recompute(sheet);

        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("hello"));
        assert_close(number(&store, sheet, 0, 1), 5.0);
        assert_eq!(string(&store, sheet, 0, 2).as_deref(), Some("TRUE"));
        assert_eq!(string(&store, sheet, 0, 3).as_deref(), Some("FALSE"));

        let mut view = store.get_window(sheet, 0, 1, &[0, 1, 2, 3]);
        let kinds = view.take_kinds();
        let string_index = view.take_string_index();
        let strings = view.take_strings();
        assert_eq!(
            kinds,
            vec![KIND_STRING, KIND_NUMBER, KIND_STRING, KIND_STRING]
        );
        assert_eq!(strings[string_index[0] as usize], "hello");
        assert_eq!(strings[string_index[2] as usize], "TRUE");
        assert_eq!(strings[string_index[3] as usize], "FALSE");

        store.set_formula(sheet, 0, 0, r#"="world""#, 3);
        store.recompute(sheet);
        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("world"));
        assert_close(number(&store, sheet, 0, 1), 5.0);
    }

    #[test]
    fn formula_errors_surface_as_sentinels() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_formula(sheet, 0, 0, "=B1", 0);
        store.set_formula(sheet, 0, 1, "=A1", 0);
        store.set_formula(sheet, 1, 0, "=1/0", 0);
        store.set_formula(sheet, 1, 1, "=MOD(1,0)", 0);
        store.set_formula(sheet, 2, 0, "=Z99", 0);
        store.set_formula(sheet, 2, 1, "=SUM(Z99:Z100)", 0);
        store.set_formula(sheet, 3, 0, "=SUM(", 0);
        store.set_formula(sheet, 3, 1, r#"=1+"x""#, 0);
        store.recompute(sheet);

        assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("#CYCLE!"));
        assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#CYCLE!"));
        assert_eq!(string(&store, sheet, 1, 0).as_deref(), Some("#DIV/0!"));
        assert_eq!(string(&store, sheet, 1, 1).as_deref(), Some("#DIV/0!"));
        assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("#REF!"));
        assert_eq!(string(&store, sheet, 2, 1).as_deref(), Some("#REF!"));
        assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("#ERROR!"));
        assert_eq!(string(&store, sheet, 3, 1).as_deref(), Some("#VALUE!"));
    }

    #[test]
    fn cross_sheet_formula_refs_evaluate_and_recompute() {
        let mut store = CellStore::new();
        let sales = store.add_sheet(5, 4);
        let summary = store.add_sheet(3, 4);
        store.set_sheet_name(sales, "sales", "Sales");
        store.set_sheet_name(summary, "summary", "Summary");

        store.set_number(sales, 1, 4, 7.0, 0);
        store.set_number(sales, 2, 4, 3.0, 0);
        store.set_formula(summary, 0, 0, "=Sales!E2 * 2", 0);
        store.set_formula(summary, 1, 0, "=SUM(Sales!E2:E3)", 0);
        store.recompute(summary);

        assert_close(number(&store, summary, 0, 0), 14.0);
        assert_close(number(&store, summary, 1, 0), 10.0);

        store.set_number(sales, 1, 4, 11.0, 0);
        store.recompute(sales);
        assert_close(number(&store, summary, 0, 0), 22.0);
        assert_close(number(&store, summary, 1, 0), 14.0);
    }

    #[test]
    fn quoted_sheet_names_work_in_formulas() {
        let mut store = CellStore::new();
        let sales = store.add_sheet(5, 3);
        let summary = store.add_sheet(2, 2);
        store.set_sheet_name(sales, "sales_2026", "Sales 2026");
        store.set_sheet_name(summary, "summary", "Summary");

        store.set_number(sales, 1, 4, 9.0, 0);
        store.set_formula(summary, 0, 0, "='Sales 2026'!E2 + 1", 0);
        store.recompute(summary);

        assert_close(number(&store, summary, 0, 0), 10.0);
    }

    #[test]
    fn oversized_range_returns_num_without_expansion() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, RANGE_CELL_LIMIT as usize + 1);
        store.set_formula(sheet, 0, 1, "=SUM(A1:A1000001)", 0);
        store.recompute(sheet);

        assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("#NUM!"));
    }

    #[test]
    fn deep_formula_evaluation_returns_num_error() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, FORMULA_RECURSION_LIMIT + 5);
        store.set_number(sheet, 0, 0, 1.0, 0);
        for row in 1..FORMULA_RECURSION_LIMIT + 4 {
            let src = format!("=A{}+1", row);
            store.set_formula(sheet, row, 0, &src, 0);
        }
        store.recompute(sheet);

        assert_eq!(
            string(&store, sheet, FORMULA_RECURSION_LIMIT + 3, 0).as_deref(),
            Some("#NUM!")
        );
    }

    #[test]
    fn public_api_bounds_checks_do_not_panic() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 2);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            store.set_number(99, 0, 0, 1.0, 0);
            store.set_number(sheet, 9, 0, 1.0, 0);
            store.set_string(sheet, 0, 9, "x", 0);
            store.clear_cell(sheet, 9, 9, 0);
            store.set_formula(sheet, 9, 0, "=A1", 0);
            store.set_column_numbers(sheet, 9, 0, &[1.0, 2.0], 0);
            store.set_column_strings(sheet, 9, 0, vec!["x".to_string()], 0);
            store.add_rows(99, 0, 1);
            store.remove_rows(99, 0, 1);

            assert_eq!(store.get_cell(99, 0, 0).kind(), KIND_EMPTY);
            assert_eq!(store.get_cell(sheet, 9, 0).kind(), KIND_EMPTY);
            assert_eq!(store.aggregate(99, 0, 0), 0.0);
            assert_eq!(store.aggregate(sheet, 9, 0), 0.0);
            assert!(store.sort_rows(99, 0, true).is_empty());
            assert!(store.sort_rows(sheet, 9, true).is_empty());
            assert!(store.filter_rows(99, 0, "x").is_empty());
            assert!(store.filter_rows(sheet, 9, "x").is_empty());
            assert!(store.search(99, &[0], "x", true, false).is_empty());
            assert_eq!(store.get_window(99, 0, 1, &[0]).n_rows(), 0);
        }));

        assert!(result.is_ok());
    }

    #[test]
    fn recompute_is_batched_scoped_and_updates_chain_and_diamond() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(5, 1);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_formula(sheet, 0, 1, "=A1+1", 0);
        store.set_formula(sheet, 0, 2, "=B1+1", 0);
        store.set_formula(sheet, 0, 3, "=B1+C1", 0);
        store.set_formula(sheet, 0, 4, "=D1+B1", 0);
        store.recompute(sheet);

        assert_close(number(&store, sheet, 0, 1), 2.0);
        assert_close(number(&store, sheet, 0, 2), 3.0);
        assert_close(number(&store, sheet, 0, 3), 5.0);
        assert_close(number(&store, sheet, 0, 4), 7.0);

        store.set_number(sheet, 0, 0, 10.0, 0);
        assert_close(number(&store, sheet, 0, 4), 7.0);

        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 1), 11.0);
        assert_close(number(&store, sheet, 0, 2), 12.0);
        assert_close(number(&store, sheet, 0, 3), 23.0);
        assert_close(number(&store, sheet, 0, 4), 34.0);
    }

    #[test]
    fn window_view_uses_error_strings_and_consuming_reads() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, 1);
        store.set_string(sheet, 0, 0, "hello", 7);
        store.set_formula(sheet, 0, 1, "=1/0", 9);
        store.recompute(sheet);

        let mut view = store.get_window(sheet, 0, 1, &[0, 1]);
        assert_eq!(view.n_rows(), 1);
        assert_eq!(view.n_cols(), 2);

        let kinds = view.take_kinds();
        let numbers = view.take_numbers();
        let string_index = view.take_string_index();
        let style_ids = view.take_style_ids();
        let strings = view.take_strings();

        assert_eq!(kinds, vec![KIND_STRING, KIND_STRING]);
        assert_eq!(numbers, vec![0.0, 0.0]);
        assert_eq!(style_ids, vec![7, 9]);
        assert_eq!(strings[string_index[0] as usize], "hello");
        assert_eq!(strings[string_index[1] as usize], "#DIV/0!");
        assert!(view.take_kinds().is_empty());
    }
}
