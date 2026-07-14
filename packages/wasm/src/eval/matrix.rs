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
