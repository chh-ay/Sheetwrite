//! Matrix values and AST-to-range conversion helpers.

use crate::calc::Ast;
use crate::types::{CellRange, Value};
use std::cell::Cell;
use std::mem::size_of;

thread_local! {
    /// `[current matrix bytes, peak matrix bytes, matrix allocations]`.
    static MATRIX_RESOURCE_STATS: Cell<[u64; 3]> = const { Cell::new([0, 0, 0]) };
}

pub(crate) fn matrix_resource_stats() -> [u64; 3] {
    MATRIX_RESOURCE_STATS.with(Cell::get)
}

pub(crate) fn reset_matrix_resource_stats() {
    MATRIX_RESOURCE_STATS.with(|stats| {
        let current = stats.get()[0];
        stats.set([current, current, 0]);
    });
}
pub(super) const SPILL_MAX_ROWS: usize = 1_048_576;
pub(super) const SPILL_MAX_COLS: usize = 16_384;
pub(super) const SPILL_MAX_CELLS: usize = 1_000_000;
pub(super) const SPILL_MAX_BYTES: usize = 64 * 1024 * 1024;
pub(super) const SPILL_MAX_RECOMPUTE_CELLS: usize = 2_000_000;

#[derive(Debug)]
pub(super) struct EvalMatrix {
    pub(super) rows: usize,
    pub(super) cols: usize,
    pub(super) values: Vec<Value>,
    accounted_bytes: u64,
}

impl EvalMatrix {
    pub(super) fn new(rows: usize, cols: usize, values: Vec<Value>) -> Self {
        let bytes = values.capacity().saturating_mul(size_of::<Value>()) as u64;
        MATRIX_RESOURCE_STATS.with(|stats| {
            let [current, peak, allocations] = stats.get();
            let current = current.saturating_add(bytes);
            stats.set([current, peak.max(current), allocations.saturating_add(1)]);
        });
        Self {
            rows,
            cols,
            values,
            accounted_bytes: bytes,
        }
    }

    pub(super) fn into_first(mut self) -> Value {
        std::mem::take(&mut self.values)
            .into_iter()
            .next()
            .unwrap_or(Value::Blank)
    }
}

impl Drop for EvalMatrix {
    fn drop(&mut self) {
        MATRIX_RESOURCE_STATS.with(|stats| {
            let [current, peak, allocations] = stats.get();
            stats.set([
                current.saturating_sub(self.accounted_bytes),
                peak,
                allocations,
            ]);
        });
    }
}

impl EvalMatrix {
    pub(super) fn validate_shape(
        rows: usize,
        cols: usize,
        value_buffers: usize,
        extra_bytes: usize,
    ) -> Result<usize, crate::types::FormulaError> {
        if rows == 0 || cols == 0 || rows > SPILL_MAX_ROWS || cols > SPILL_MAX_COLS {
            return Err(crate::types::FormulaError::Num);
        }
        let cells = rows
            .checked_mul(cols)
            .filter(|cells| *cells <= SPILL_MAX_CELLS)
            .ok_or(crate::types::FormulaError::Num)?;
        let value_bytes = cells
            .checked_mul(size_of::<Value>())
            .and_then(|bytes| bytes.checked_mul(value_buffers))
            .and_then(|bytes| bytes.checked_add(extra_bytes))
            .ok_or(crate::types::FormulaError::Num)?;
        if value_bytes > SPILL_MAX_BYTES {
            return Err(crate::types::FormulaError::Num);
        }
        Ok(cells)
    }
    pub(super) fn validate_bytes(&self) -> Result<(), crate::types::FormulaError> {
        self.validate_copies(1)
    }

    pub(super) fn validate_copies(&self, copies: usize) -> Result<(), crate::types::FormulaError> {
        let base = self
            .values
            .capacity()
            .checked_mul(size_of::<Value>())
            .ok_or(crate::types::FormulaError::Num)?;
        let bytes = self.values.iter().try_fold(base, |total, value| {
            let payload = match value {
                Value::Text(text) => text.len(),
                _ => 0,
            };
            total.checked_add(payload)
        });
        if bytes
            .and_then(|bytes| bytes.checked_mul(copies))
            .is_none_or(|bytes| bytes > SPILL_MAX_BYTES)
        {
            return Err(crate::types::FormulaError::Num);
        }
        Ok(())
    }

    pub(super) fn get(&self, row: usize, col: usize) -> Option<&Value> {
        (row < self.rows && col < self.cols)
            .then(|| self.values.get(row * self.cols + col))
            .flatten()
    }

    pub(super) fn same_shape(&self, other: &Self) -> bool {
        self.rows == other.rows && self.cols == other.cols
    }
}

pub(super) fn optional_ast(args: &[Ast], index: usize) -> Option<&Ast> {
    match args.get(index) {
        Some(Ast::Missing) | None => None,
        value => value,
    }
}

pub(super) fn range_from_ast(ast: &Ast, formula_sheet: usize) -> Option<CellRange> {
    match ast {
        Ast::Cell(row, col, _) => {
            Some(CellRange::new(formula_sheet as u32, *row, *col, *row, *col))
        }
        Ast::AbsCell(sheet, row, col, _) => {
            Some(CellRange::new(sheet.handle, *row, *col, *row, *col))
        }
        Ast::Range(r0, c0, r1, c1, _) => {
            Some(CellRange::new(formula_sheet as u32, *r0, *c0, *r1, *c1))
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) => {
            Some(CellRange::new(sheet.handle, *r0, *c0, *r1, *c1))
        }
        Ast::NamedRange(named) => Some(CellRange::new(
            named.sheet,
            named.row_start,
            named.col_start,
            named.row_end,
            named.col_end,
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{matrix_resource_stats, range_from_ast, reset_matrix_resource_stats, EvalMatrix};
    use crate::calc::{Ast, NamedRangeRef, RangeFlags, RefFlags, SheetRef};
    use crate::types::{CellRange, Value};

    #[test]
    fn converts_local_absolute_and_named_references_to_ranges() {
        let flags = RefFlags::default();
        assert_eq!(
            range_from_ast(&Ast::Cell(2, 3, flags), 7),
            Some(CellRange::new(7, 2, 3, 2, 3))
        );
        let sheet = SheetRef {
            handle: 11,
            name: "Data".to_string(),
            quoted: false,
        };
        assert_eq!(
            range_from_ast(&Ast::AbsCell(sheet.clone(), 4, 5, flags), 7),
            Some(CellRange::new(11, 4, 5, 4, 5))
        );
        assert_eq!(
            range_from_ast(&Ast::AbsRange(sheet, 1, 2, 6, 8, RangeFlags::default()), 7),
            Some(CellRange::new(11, 1, 2, 6, 8))
        );
        assert_eq!(
            range_from_ast(
                &Ast::NamedRange(NamedRangeRef {
                    name: "Input".to_string(),
                    scope: None,
                    sheet: 13,
                    row_start: 1,
                    col_start: 2,
                    row_end: 3,
                    col_end: 4,
                }),
                7,
            ),
            Some(CellRange::new(13, 1, 2, 3, 4))
        );
    }

    #[test]
    fn matrix_resource_stats_track_concurrent_peak_and_release() {
        reset_matrix_resource_stats();
        let first = EvalMatrix::new(1, 2, vec![Value::Number(1.0), Value::Number(2.0)]);
        let first_bytes = matrix_resource_stats()[0];
        assert!(first_bytes > 0);
        {
            let second = EvalMatrix::new(1, 1, vec![Value::Blank]);
            let [current, peak, allocations] = matrix_resource_stats();
            assert_eq!(current, peak);
            assert!(current > first_bytes);
            assert_eq!(allocations, 2);
            drop(second);
        }
        assert_eq!(matrix_resource_stats()[0], first_bytes);
        drop(first);
        let [current, peak, allocations] = matrix_resource_stats();
        assert_eq!(current, 0);
        assert!(peak > first_bytes);
        assert_eq!(allocations, 2);
    }
}
