//! Matrix values and AST-to-range conversion helpers.

use crate::calc::Ast;
use crate::types::{CellRange, Value};

#[derive(Debug)]
pub(super) struct EvalMatrix {
    pub(super) rows: usize,
    pub(super) cols: usize,
    pub(super) values: Vec<Value>,
}

impl EvalMatrix {
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
    use super::range_from_ast;
    use crate::calc::{Ast, NamedRangeRef, RangeFlags, RefFlags, SheetRef};
    use crate::types::CellRange;

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
}
