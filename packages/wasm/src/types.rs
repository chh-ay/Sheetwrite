//! Shared value model: cell tags, keys, formula errors/values, read-sets.

use crate::calc::{
    invalidate_sheet_refs, rename_sheet_refs, serialize, shift_cols, shift_rows, Ast,
};
use std::rc::Rc;

pub(crate) const KIND_EMPTY: u8 = 0;
pub(crate) const KIND_NUMBER: u8 = 1;
pub(crate) const KIND_STRING: u8 = 2;
pub(crate) const KIND_FORMULA: u8 = 4;

pub(crate) const NO_STRING: u32 = u32::MAX;
pub(crate) const FORMULA_RECURSION_LIMIT: usize = 256;
pub(crate) const RANGE_CELL_LIMIT: u64 = 1_000_000;

pub(crate) type CellKey = (u32, u32);

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) struct AbsCellKey {
    pub(crate) sheet: u32,
    pub(crate) row: u32,
    pub(crate) col: u32,
}

impl AbsCellKey {
    pub(crate) fn new(sheet: usize, row: u32, col: u32) -> Self {
        Self {
            sheet: sheet as u32,
            row,
            col,
        }
    }

    pub(crate) fn from_local(sheet: usize, (row, col): CellKey) -> Self {
        Self::new(sheet, row, col)
    }

    pub(crate) fn local(self) -> CellKey {
        (self.row, self.col)
    }
}
pub(crate) type EvalResult = Value;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum FormulaError {
    Cycle,
    DivZero,
    Ref,
    Num,
    Value,
    Error,
}

impl FormulaError {
    pub(crate) fn sentinel(self) -> &'static str {
        match self {
            FormulaError::Cycle => "#CYCLE!",
            FormulaError::DivZero => "#DIV/0!",
            FormulaError::Ref => "#REF!",
            FormulaError::Num => "#NUM!",
            FormulaError::Value => "#VALUE!",
            FormulaError::Error => "#ERROR!",
        }
    }

    /// Dense slot index for per-window scratch tables (6 variants).
    pub(crate) fn slot(self) -> usize {
        match self {
            FormulaError::Cycle => 0,
            FormulaError::DivZero => 1,
            FormulaError::Ref => 2,
            FormulaError::Num => 3,
            FormulaError::Value => 4,
            FormulaError::Error => 5,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Value {
    Number(f64),
    Text(Rc<str>),
    Bool(bool),
    Blank,
    Error(FormulaError),
}

impl Value {
    pub(crate) fn number(value: f64) -> Self {
        if value.is_finite() {
            Value::Number(value)
        } else {
            Value::Error(FormulaError::Num)
        }
    }

    pub(crate) fn text(text: impl Into<Rc<str>>) -> Self {
        Value::Text(text.into())
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) struct CellRange {
    pub(crate) sheet: u32,
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
}

impl CellRange {
    pub(crate) fn new(
        sheet: u32,
        row_start: u32,
        col_start: u32,
        row_end: u32,
        col_end: u32,
    ) -> Self {
        Self {
            sheet,
            row_start,
            col_start,
            row_end,
            col_end,
        }
    }

    pub(crate) fn contains(self, cell: AbsCellKey) -> bool {
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
pub(crate) struct ReadSet {
    pub(crate) cells: Vec<AbsCellKey>,
    pub(crate) ranges: Vec<CellRange>,
}

impl ReadSet {
    pub(crate) fn from_ast(ast: &Ast, formula_sheet: u32) -> Self {
        let mut out = Self::default();
        out.collect(ast, formula_sheet);
        out
    }

    pub(crate) fn collect(&mut self, ast: &Ast, formula_sheet: u32) {
        match ast {
            Ast::Cell(row, col, _) => self.push_cell(AbsCellKey {
                sheet: formula_sheet,
                row: *row,
                col: *col,
            }),
            Ast::AbsCell(sheet, row, col, _) => self.push_cell(AbsCellKey {
                sheet: sheet.handle,
                row: *row,
                col: *col,
            }),
            Ast::Range(row_start, col_start, row_end, col_end, _) => self.push_range(
                CellRange::new(formula_sheet, *row_start, *col_start, *row_end, *col_end),
            ),
            Ast::AbsRange(sheet, row_start, col_start, row_end, col_end, _) => self.push_range(
                CellRange::new(sheet.handle, *row_start, *col_start, *row_end, *col_end),
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
            Ast::SheetCell(..)
            | Ast::SheetRange(..)
            | Ast::InvalidRef
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Num(_) => {}
        }
    }

    pub(crate) fn push_cell(&mut self, cell: AbsCellKey) {
        if !self.cells.contains(&cell) {
            self.cells.push(cell);
        }
    }

    pub(crate) fn push_range(&mut self, range: CellRange) {
        if !self.ranges.contains(&range) {
            self.ranges.push(range);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FormulaValueKind {
    Number,
    Text,
    Bool,
}

/// Stored formula metadata: parsed AST, precomputed read-set, and last error.
#[derive(Clone, Debug)]
pub(crate) struct FormulaEntry {
    pub(crate) ast: Option<Ast>,
    pub(crate) source: String,
    pub(crate) reads: ReadSet,
    pub(crate) error: Option<FormulaError>,
    pub(crate) value_kind: FormulaValueKind,
}

impl FormulaEntry {
    pub(crate) fn parsed(ast: Ast, sheet: u32) -> Self {
        let source = serialize(&ast);
        let reads = ReadSet::from_ast(&ast, sheet);
        Self {
            ast: Some(ast),
            source,
            reads,
            error: None,
            value_kind: FormulaValueKind::Number,
        }
    }

    pub(crate) fn parse_error(source: &str) -> Self {
        Self {
            ast: None,
            source: source.to_string(),
            reads: ReadSet::default(),
            error: Some(FormulaError::Error),
            value_kind: FormulaValueKind::Number,
        }
    }

    pub(crate) fn shift_rows(
        &mut self,
        at: u32,
        delta: i64,
        formula_sheet: u32,
        edited_sheet: u32,
    ) {
        if let Some(ast) = &mut self.ast {
            shift_rows(ast, at, delta, formula_sheet, edited_sheet);
            self.source = serialize(ast);
            self.reads = ReadSet::from_ast(ast, formula_sheet);
        }
    }

    pub(crate) fn shift_cols(
        &mut self,
        at: u32,
        delta: i64,
        formula_sheet: u32,
        edited_sheet: u32,
    ) {
        if let Some(ast) = &mut self.ast {
            shift_cols(ast, at, delta, formula_sheet, edited_sheet);
            self.source = serialize(ast);
            self.reads = ReadSet::from_ast(ast, formula_sheet);
        }
    }

    pub(crate) fn rename_sheet(&mut self, handle: u32, name: &str, formula_sheet: u32) -> bool {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !rename_sheet_refs(ast, handle, name) {
            return false;
        }
        self.source = serialize(ast);
        self.reads = ReadSet::from_ast(ast, formula_sheet);
        true
    }

    pub(crate) fn invalidate_sheet(&mut self, handle: u32, formula_sheet: u32) -> bool {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !invalidate_sheet_refs(ast, handle) {
            return false;
        }
        self.source = serialize(ast);
        self.reads = ReadSet::from_ast(ast, formula_sheet);
        true
    }
}

pub(crate) fn cell_key(row: usize, col: usize) -> Option<CellKey> {
    Some((u32::try_from(row).ok()?, u32::try_from(col).ok()?))
}

// ── String pool ──────────────────────────────────────────────────────────────

/// Dictionary-encoded string pool backed by one contiguous UTF-8 arena.
///
/// `Vec<String>` costs a 12-byte header plus a separate heap allocation per
/// entry on wasm32; at a million distinct strings that is tens of megabytes of
/// headers and allocator slack. The arena stores every string back to back in
/// one buffer with an 8-byte `(offset, len)` span per id, keeps pool text
/// cache-contiguous for filter/search scans, and frees in two deallocations.
pub(crate) struct StringPool {
    bytes: Vec<u8>,
    spans: Vec<PoolSpan>,
}

#[derive(Clone, Copy)]
struct PoolSpan {
    offset: u32,
    len: u32,
}

impl StringPool {
    pub(crate) fn new() -> Self {
        Self {
            bytes: Vec::new(),
            spans: Vec::new(),
        }
    }

    /// Interned-string count; only test assertions read it today.
    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.spans.len()
    }

    /// Text for a pool id; `None` when out of range. O(1), allocation-free.
    pub(crate) fn get(&self, id: u32) -> Option<&str> {
        let span = self.spans.get(id as usize)?;
        let start = span.offset as usize;
        let bytes = &self.bytes[start..start + span.len as usize];
        // SAFETY: `push` only appends whole valid UTF-8 strings, and every
        // span covers exactly one pushed string.
        Some(unsafe { std::str::from_utf8_unchecked(bytes) })
    }

    /// Append a string and return its id. Dedup is the interner's job; the
    /// pool itself is append-only.
    pub(crate) fn push(&mut self, s: &str) -> u32 {
        let id = self.spans.len() as u32;
        let offset = self.bytes.len() as u32;
        self.bytes.extend_from_slice(s.as_bytes());
        self.spans.push(PoolSpan {
            offset,
            len: s.len() as u32,
        });
        id
    }
}

pub(crate) fn string_from_pool(strings: &StringPool, pool_id: u32) -> Option<String> {
    string_from_pool_ref(strings, pool_id).map(str::to_owned)
}

pub(crate) fn string_from_pool_ref(strings: &StringPool, pool_id: u32) -> Option<&str> {
    if pool_id == NO_STRING {
        return None;
    }
    strings.get(pool_id)
}
