//! Bounded dynamic-array evaluation for FILTER, SORT, UNIQUE, and direct ranges.

use std::cmp::Ordering;
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::mem::size_of;

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

use super::lookup::integer_arg;
use super::matrix::{
    optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_CELLS, SPILL_MAX_RECOMPUTE_CELLS,
};
use super::value::{bool_from_value, compare_values, number_from_value};
use super::expand_let_ast;

fn static_integer(ast: Option<&Ast>) -> Option<i64> {
    match ast? {
        Ast::Num(value)
            if value.is_finite()
                && *value >= i64::MIN as f64
                && *value <= i64::MAX as f64 =>
        {
            Some(value.trunc() as i64)
        }
        Ast::Neg(inner) => static_integer(Some(inner)).and_then(i64::checked_neg),
        Ast::Pos(inner) => static_integer(Some(inner)),
        _ => None,
    }
}

fn sequence_shape(args: &[Ast]) -> Result<(usize, usize, usize), FormulaError> {
    if args.is_empty() || args.len() > 4 {
        return Err(FormulaError::Value);
    }
    let rows = static_integer(optional_ast(args, 0)).ok_or(FormulaError::Value)?;
    let cols = static_integer(optional_ast(args, 1)).unwrap_or(1);
    if rows <= 0 || cols <= 0 {
        return Err(FormulaError::Value);
    }
    let rows = usize::try_from(rows).map_err(|_| FormulaError::Num)?;
    let cols = usize::try_from(cols).map_err(|_| FormulaError::Num)?;
    let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
    Ok((rows, cols, cells))
}

fn transformed_axis_bound(
    size: usize,
    requested: i64,
    drop: bool,
) -> Result<usize, FormulaError> {
    if requested == 0 {
        return Err(FormulaError::Calc);
    }
    let magnitude = usize::try_from(requested.unsigned_abs()).unwrap_or(usize::MAX);
    let selected = magnitude.min(size);
    let output = if drop {
        size.saturating_sub(selected)
    } else {
        selected
    };
    if output == 0 {
        Err(FormulaError::Calc)
    } else {
        Ok(output)
    }
}

impl CellStore {
    pub(super) fn dynamic_array_bound(
        &self,
        ast: &Ast,
        formula_sheet: usize,
    ) -> Option<Result<usize, FormulaError>> {
        match ast {
            Ast::Range(..) | Ast::AbsRange(..) | Ast::NamedRange(..) => Some(
                self.matrix_shape(ast, formula_sheet)
                    .map(|(_, _, cells)| cells),
            ),
            Ast::Func(Func::Let, args) => Some(
                expand_let_ast(args)
                    .and_then(|expanded| {
                        self.dynamic_array_bound(&expanded, formula_sheet)
                            .unwrap_or(Err(FormulaError::Value))
                    }),
            ),
            Ast::Func(
                Func::Filter
                | Func::Sort
                | Func::Unique
                | Func::Transpose
                | Func::Take
                | Func::Drop
                | Func::ChooseCols
                | Func::ChooseRows,
                args,
            ) => {
                let Some(source) = args.first() else {
                    return Some(Err(FormulaError::Value));
                };
                Some(
                    self.matrix_shape(source, formula_sheet)
                        .map(|(_, _, cells)| cells),
                )
            }
            Ast::Func(Func::Sequence, args) => Some(if args.is_empty() || args.len() > 4 {
                Err(FormulaError::Value)
            } else if static_integer(optional_ast(args, 0)).is_none()
                || (optional_ast(args, 1).is_some()
                    && static_integer(optional_ast(args, 1)).is_none())
            {
                Ok(SPILL_MAX_CELLS)
            } else {
                sequence_shape(args).map(|shape| shape.2)
            }),
            Ast::Func(Func::Choose, args) => {
                if args.len() < 2 {
                    return Some(Err(FormulaError::Value));
                }
                if let Some(index) = static_integer(args.first()) {
                    if index <= 0 || index as usize >= args.len() {
                        return Some(Err(FormulaError::Value));
                    }
                    return self.dynamic_array_bound(&args[index as usize], formula_sheet);
                }
                let mut bound = None;
                for choice in &args[1..] {
                    if let Some(Ok(cells)) = self.dynamic_array_bound(choice, formula_sheet) {
                        bound = Some(bound.map_or(cells, |current: usize| current.max(cells)));
                    }
                }
                bound.map(Ok)
            }
            _ => None,
        }
    }

    pub(super) fn eval_dynamic_array(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Option<Result<EvalMatrix, FormulaError>> {
        let result = match ast {
            Ast::Range(..) | Ast::AbsRange(..) | Ast::NamedRange(..) => {
                self.eval_matrix_arg(ast, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Let, args) => expand_let_ast(args).and_then(|expanded| {
                self.eval_dynamic_array(
                    &expanded,
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                )
                .unwrap_or(Err(FormulaError::Value))
            }),
            Ast::Func(Func::Filter, args) => {
                self.eval_filter(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Sort, args) => {
                self.eval_sort(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Unique, args) => {
                self.eval_unique(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Transpose, args) => {
                self.eval_transpose(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Sequence, args) => {
                self.eval_sequence(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Take, args) => {
                self.eval_take_drop(args, false, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Drop, args) => {
                self.eval_take_drop(args, true, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::ChooseCols, args) => {
                self.eval_choose_axis(args, false, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::ChooseRows, args) => {
                self.eval_choose_axis(args, true, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Choose, args) => {
                self.eval_choose(args, sheet, affected, memo, visiting, depth + 1)
            }
            _ => return None,
        };
        Some(result.and_then(|matrix| {
            matrix.validate_bytes()?;
            Ok(matrix)
        }))
    }
    fn eval_array_matrix_arg(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if let Some(result) =
            self.eval_dynamic_array(ast, sheet, affected, memo, visiting, depth + 1)
        {
            result
        } else {
            Err(FormulaError::Value)
        }
    }

    pub(super) fn matrix_shape(
        &self,
        ast: &Ast,
        formula_sheet: usize,
    ) -> Result<(usize, usize, usize), FormulaError> {
        match ast {
            Ast::Func(Func::Let, args) => {
                return self.matrix_shape(&expand_let_ast(args)?, formula_sheet);
            }
            Ast::Func(Func::Filter | Func::Sort | Func::Unique, args) => {
                return self.matrix_shape(args.first().ok_or(FormulaError::Value)?, formula_sheet);
            }
            Ast::Func(Func::Transpose, args) => {
                let (rows, cols, cells) =
                    self.matrix_shape(args.first().ok_or(FormulaError::Value)?, formula_sheet)?;
                return Ok((cols, rows, cells));
            }
            Ast::Func(Func::Sequence, args) => return sequence_shape(args),
            Ast::Func(Func::Take | Func::Drop, args) => {
                let source = args.first().ok_or(FormulaError::Value)?;
                let (rows, cols, _) = self.matrix_shape(source, formula_sheet)?;
                let requested_rows = static_integer(optional_ast(args, 1)).unwrap_or(rows as i64);
                let requested_cols = static_integer(optional_ast(args, 2)).unwrap_or(cols as i64);
                let output_rows = transformed_axis_bound(rows, requested_rows, matches!(ast, Ast::Func(Func::Drop, _)))?;
                let output_cols = transformed_axis_bound(cols, requested_cols, matches!(ast, Ast::Func(Func::Drop, _)))?;
                let cells = EvalMatrix::validate_shape(output_rows, output_cols, 1, 0)?;
                return Ok((output_rows, output_cols, cells));
            }
            Ast::Func(Func::ChooseCols | Func::ChooseRows, args) => {
                let source = args.first().ok_or(FormulaError::Value)?;
                let (rows, cols, _) = self.matrix_shape(source, formula_sheet)?;
                if args.len() < 2 {
                    return Err(FormulaError::Value);
                }
                let (output_rows, output_cols) = if matches!(ast, Ast::Func(Func::ChooseRows, _)) {
                    (args.len() - 1, cols)
                } else {
                    (rows, args.len() - 1)
                };
                let cells = EvalMatrix::validate_shape(output_rows, output_cols, 1, 0)?;
                return Ok((output_rows, output_cols, cells));
            }
            _ => {}
        }
        let range = range_from_ast(ast, formula_sheet).ok_or(FormulaError::Value)?;
        let data = self
            .sheets
            .get(range.sheet as usize)
            .ok_or(FormulaError::Ref)?;
        if data.row_count == 0
            || data.n_cols == 0
            || range.row_start as usize >= data.row_count
            || range.col_start as usize >= data.n_cols
        {
            return Err(FormulaError::Ref);
        }
        let row_end = (range.row_end as usize).min(data.row_count - 1);
        let col_end = (range.col_end as usize).min(data.n_cols - 1);
        let rows = row_end - range.row_start as usize + 1;
        let cols = col_end - range.col_start as usize + 1;
        let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        Ok((rows, cols, cells))
    }

    fn scalar_array_arg(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Value {
        self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1)
    }

    fn optional_bool_array_arg(
        &self,
        args: &[Ast],
        index: usize,
        default: bool,
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<bool, FormulaError> {
        let Some(ast) = optional_ast(args, index) else {
            return Ok(default);
        };
        bool_from_value(&self.scalar_array_arg(ast, sheet, affected, memo, visiting, depth + 1))
    }

    fn eval_filter(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if !(2..=3).contains(&args.len()) {
            return Err(FormulaError::Value);
        }
        let (array_rows, array_cols, array_cells) = self.matrix_shape(&args[0], sheet)?;
        let (_, _, include_cells) = self.matrix_shape(&args[1], sheet)?;
        let selected_bound = array_rows.max(array_cols);
        let extra = include_cells
            .checked_mul(size_of::<Value>())
            .and_then(|bytes| {
                selected_bound
                    .checked_mul(size_of::<usize>())
                    .and_then(|selected| bytes.checked_add(selected))
            })
            .ok_or(FormulaError::Num)?;
        EvalMatrix::validate_shape(array_rows, array_cols, 2, extra)?;
        if array_cells
            .checked_add(include_cells)
            .is_none_or(|work| work > SPILL_MAX_RECOMPUTE_CELLS)
        {
            return Err(FormulaError::Num);
        }
        let array =
            self.eval_array_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)?;
        let include =
            self.eval_array_matrix_arg(&args[1], sheet, affected, memo, visiting, depth + 1)?;
        array.validate_copies(2)?;
        debug_assert_eq!(array.values.len(), array_cells);

        let filter_rows = include.rows == array.rows && include.cols == 1;
        let filter_cols = include.rows == 1 && include.cols == array.cols;
        if !filter_rows && !filter_cols {
            return Err(FormulaError::Value);
        }

        let mut selected = Vec::with_capacity(if filter_rows { array.rows } else { array.cols });
        for (index, value) in include.values.iter().enumerate() {
            if bool_from_value(value)? {
                selected.push(index);
            }
        }
        if selected.is_empty() {
            let Some(empty) = optional_ast(args, 2) else {
                return Err(FormulaError::Calc);
            };
            return Ok(EvalMatrix::new(
                1,
                1,
                vec![self.scalar_array_arg(empty, sheet, affected, memo, visiting, depth + 1)],
            ));
        }

        let (rows, cols) = if filter_rows {
            (selected.len(), array.cols)
        } else {
            (array.rows, selected.len())
        };
        let cells = rows.checked_mul(cols).ok_or(FormulaError::Num)?;
        let mut values = Vec::with_capacity(cells);
        if filter_rows {
            for row in selected {
                let start = row * array.cols;
                values.extend_from_slice(&array.values[start..start + array.cols]);
            }
        } else {
            for row in 0..array.rows {
                for &col in &selected {
                    values.push(array.values[row * array.cols + col].clone());
                }
            }
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }

    fn eval_sort(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.is_empty() || args.len() > 4 {
            return Err(FormulaError::Value);
        }
        let by_col = self.optional_bool_array_arg(
            args,
            3,
            false,
            sheet,
            affected,
            memo,
            visiting,
            depth + 1,
        )?;
        let (array_rows, array_cols, _) = self.matrix_shape(&args[0], sheet)?;
        let item_count = if by_col { array_cols } else { array_rows };
        let extra = item_count
            .checked_mul(size_of::<usize>())
            .ok_or(FormulaError::Num)?;
        EvalMatrix::validate_shape(array_rows, array_cols, 2, extra)?;
        let comparisons = if item_count < 2 {
            0
        } else {
            let log = usize::BITS as usize - item_count.leading_zeros() as usize;
            item_count.checked_mul(log).ok_or(FormulaError::Num)?
        };
        if comparisons > SPILL_MAX_RECOMPUTE_CELLS {
            return Err(FormulaError::Num);
        }
        let array =
            self.eval_array_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)?;
        array.validate_copies(2)?;
        let dimension = if by_col { array.rows } else { array.cols };
        let sort_index = match optional_ast(args, 1) {
            Some(ast) => integer_arg(&self.scalar_array_arg(
                ast,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            ))?,
            None => 1,
        };
        if sort_index <= 0 || sort_index as usize > dimension {
            return Err(FormulaError::Value);
        }
        let order = match optional_ast(args, 2) {
            Some(ast) => integer_arg(&self.scalar_array_arg(
                ast,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            ))?,
            None => 1,
        };
        if !matches!(order, -1 | 1) {
            return Err(FormulaError::Value);
        }

        debug_assert_eq!(item_count, if by_col { array.cols } else { array.rows });
        let key = sort_index as usize - 1;
        let mut indices: Vec<usize> = (0..item_count).collect();
        let mut error = None;
        indices.sort_by(|left, right| {
            if error.is_some() {
                return Ordering::Equal;
            }
            let left_value = if by_col {
                array.get(key, *left)
            } else {
                array.get(*left, key)
            };
            let right_value = if by_col {
                array.get(key, *right)
            } else {
                array.get(*right, key)
            };
            let compared = match (left_value, right_value) {
                (Some(left), Some(right)) => compare_values(left, right),
                _ => Err(FormulaError::Ref),
            };
            match compared {
                Ok(value) if order == -1 => value.reverse(),
                Ok(value) => value,
                Err(found) => {
                    error = Some(found);
                    Ordering::Equal
                }
            }
        });
        if let Some(error) = error {
            return Err(error);
        }

        let mut values = Vec::with_capacity(array.values.len());
        if by_col {
            for row in 0..array.rows {
                for &col in &indices {
                    values.push(array.values[row * array.cols + col].clone());
                }
            }
        } else {
            for row in indices {
                let start = row * array.cols;
                values.extend_from_slice(&array.values[start..start + array.cols]);
            }
        }
        Ok(EvalMatrix::new(array.rows, array.cols, values))
    }

    fn eval_unique(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.is_empty() || args.len() > 3 {
            return Err(FormulaError::Value);
        }
        let by_col = self.optional_bool_array_arg(
            args,
            1,
            false,
            sheet,
            affected,
            memo,
            visiting,
            depth + 1,
        )?;
        let (array_rows, array_cols, _) = self.matrix_shape(&args[0], sheet)?;
        let item_count = if by_col { array_cols } else { array_rows };
        const UNIQUE_ITEM_BYTES: usize = 64;
        let extra = item_count
            .checked_mul(UNIQUE_ITEM_BYTES)
            .ok_or(FormulaError::Num)?;
        EvalMatrix::validate_shape(array_rows, array_cols, 2, extra)?;
        let array =
            self.eval_array_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)?;
        array.validate_copies(2)?;
        let exactly_once = self.optional_bool_array_arg(
            args,
            2,
            false,
            sheet,
            affected,
            memo,
            visiting,
            depth + 1,
        )?;
        debug_assert_eq!(item_count, if by_col { array.cols } else { array.rows });

        let mut buckets: HashMap<u64, Vec<(usize, usize)>> = HashMap::new();
        let mut order = Vec::with_capacity(item_count);
        let mut comparisons = 0usize;
        for item in 0..item_count {
            let hash = matrix_item_hash(&array, item, by_col);
            let bucket = buckets.entry(hash).or_default();
            let mut found = None;
            for (position, (representative, _)) in bucket.iter().enumerate() {
                comparisons = comparisons.checked_add(1).ok_or(FormulaError::Num)?;
                if comparisons > SPILL_MAX_RECOMPUTE_CELLS {
                    return Err(FormulaError::Num);
                }
                if matrix_items_equal(&array, *representative, item, by_col)? {
                    found = Some(position);
                    break;
                }
            }
            if let Some(position) = found {
                bucket[position].1 += 1;
            } else {
                bucket.push((item, 1));
                order.push((hash, item));
            }
        }

        let retained: Vec<usize> = order
            .into_iter()
            .filter_map(|(hash, item)| {
                let count = buckets
                    .get(&hash)?
                    .iter()
                    .find(|(representative, _)| *representative == item)?
                    .1;
                (!exactly_once || count == 1).then_some(item)
            })
            .collect();
        if retained.is_empty() {
            return Err(FormulaError::Calc);
        }
        let (rows, cols) = if by_col {
            (array.rows, retained.len())
        } else {
            (retained.len(), array.cols)
        };
        let cells = rows.checked_mul(cols).ok_or(FormulaError::Num)?;
        let mut values = Vec::with_capacity(cells);
        if by_col {
            for row in 0..array.rows {
                for &col in &retained {
                    values.push(array.values[row * array.cols + col].clone());
                }
            }
        } else {
            for row in retained {
                let start = row * array.cols;
                values.extend_from_slice(&array.values[start..start + array.cols]);
            }
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }
    fn eval_transpose(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.len() != 1 {
            return Err(FormulaError::Value);
        }
        let (source_rows, source_cols, _) = self.matrix_shape(&args[0], sheet)?;
        EvalMatrix::validate_shape(source_cols, source_rows, 2, 0)?;
        let source =
            self.eval_array_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)?;
        source.validate_copies(2)?;
        let mut values = Vec::new();
        values
            .try_reserve_exact(source.values.len())
            .map_err(|_| FormulaError::Num)?;
        for row in 0..source.cols {
            for col in 0..source.rows {
                values.push(source.values[col * source.cols + row].clone());
            }
        }
        Ok(EvalMatrix::new(source.cols, source.rows, values))
    }

    fn eval_sequence(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.is_empty() || args.len() > 4 {
            return Err(FormulaError::Value);
        }
        let scalar = |index: usize,
                      default: Value,
                      memo: &mut HashMap<AbsCellKey, EvalResult>,
                      visiting: &mut std::collections::HashSet<AbsCellKey>| {
            optional_ast(args, index).map_or(default, |ast| {
                self.scalar_array_arg(ast, sheet, affected, memo, visiting, depth + 1)
            })
        };
        let rows = integer_arg(&scalar(0, Value::Number(1.0), memo, visiting))?;
        let cols = integer_arg(&scalar(1, Value::Number(1.0), memo, visiting))?;
        if rows <= 0 || cols <= 0 {
            return Err(FormulaError::Value);
        }
        let rows = usize::try_from(rows).map_err(|_| FormulaError::Num)?;
        let cols = usize::try_from(cols).map_err(|_| FormulaError::Num)?;
        let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        let start = number_from_value(&scalar(2, Value::Number(1.0), memo, visiting))?;
        let step = number_from_value(&scalar(3, Value::Number(1.0), memo, visiting))?;
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for index in 0..cells {
            let value = start + step * index as f64;
            if !value.is_finite() {
                return Err(FormulaError::Num);
            }
            values.push(Value::Number(value));
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }

    fn eval_take_drop(
        &self,
        args: &[Ast],
        drop: bool,
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if !(2..=3).contains(&args.len()) {
            return Err(FormulaError::Value);
        }
        let (source_rows, source_cols, _) = self.matrix_shape(&args[0], sheet)?;
        let rows = integer_arg(&self.scalar_array_arg(
            &args[1],
            sheet,
            affected,
            memo,
            visiting,
            depth + 1,
        ))? as i64;
        let cols = match optional_ast(args, 2) {
            Some(ast) => integer_arg(&self.scalar_array_arg(
                ast,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            ))? as i64,
            None => source_cols as i64,
        };
        let output_rows = transformed_axis_bound(source_rows, rows, drop)?;
        let output_cols = transformed_axis_bound(source_cols, cols, drop)?;
        let cells = EvalMatrix::validate_shape(output_rows, output_cols, 2, 0)?;
        let source =
            self.eval_array_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)?;
        source.validate_copies(2)?;
        let row_magnitude = usize::try_from(rows.unsigned_abs())
            .unwrap_or(usize::MAX)
            .min(source.rows);
        let col_magnitude = usize::try_from(cols.unsigned_abs())
            .unwrap_or(usize::MAX)
            .min(source.cols);
        let row_start = if drop {
            if rows > 0 { row_magnitude } else { 0 }
        } else if rows < 0 {
            source.rows - row_magnitude
        } else {
            0
        };
        let col_start = if drop {
            if cols > 0 { col_magnitude } else { 0 }
        } else if cols < 0 {
            source.cols - col_magnitude
        } else {
            0
        };
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for row in row_start..row_start + output_rows {
            for col in col_start..col_start + output_cols {
                values.push(source.values[row * source.cols + col].clone());
            }
        }
        Ok(EvalMatrix::new(output_rows, output_cols, values))
    }

    fn eval_choose_axis(
        &self,
        args: &[Ast],
        rows_axis: bool,
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.len() < 2 {
            return Err(FormulaError::Value);
        }
        let (source_rows, source_cols, _) = self.matrix_shape(&args[0], sheet)?;
        let dimension = if rows_axis { source_rows } else { source_cols };
        let index_bytes = (args.len() - 1)
            .checked_mul(size_of::<usize>())
            .ok_or(FormulaError::Num)?;
        let (output_rows, output_cols) = if rows_axis {
            (args.len() - 1, source_cols)
        } else {
            (source_rows, args.len() - 1)
        };
        let cells = EvalMatrix::validate_shape(output_rows, output_cols, 2, index_bytes)?;
        let mut indices = Vec::new();
        indices
            .try_reserve_exact(args.len() - 1)
            .map_err(|_| FormulaError::Num)?;
        for ast in &args[1..] {
            let index = integer_arg(&self.scalar_array_arg(
                ast,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            ))?;
            let normalized = if index > 0 {
                index as usize - 1
            } else if index < 0 {
                dimension
                    .checked_sub(index.unsigned_abs() as usize)
                    .ok_or(FormulaError::Value)?
            } else {
                return Err(FormulaError::Value);
            };
            if normalized >= dimension {
                return Err(FormulaError::Value);
            }
            indices.push(normalized);
        }
        let source =
            self.eval_array_matrix_arg(&args[0], sheet, affected, memo, visiting, depth + 1)?;
        source.validate_copies(2)?;
        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        if rows_axis {
            for row in indices {
                let start = row * source.cols;
                values.extend_from_slice(&source.values[start..start + source.cols]);
            }
        } else {
            for row in 0..source.rows {
                for &col in &indices {
                    values.push(source.values[row * source.cols + col].clone());
                }
            }
        }
        Ok(EvalMatrix::new(output_rows, output_cols, values))
    }

    fn eval_choose(
        &self,
        args: &[Ast],
        sheet: usize,
        affected: &std::collections::HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut std::collections::HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        if args.len() < 2 {
            return Err(FormulaError::Value);
        }
        let index = integer_arg(&self.scalar_array_arg(
            &args[0],
            sheet,
            affected,
            memo,
            visiting,
            depth + 1,
        ))?;
        if index <= 0 || index as usize >= args.len() {
            return Err(FormulaError::Value);
        }
        let selected = &args[index as usize];
        if let Some(result) =
            self.eval_dynamic_array(selected, sheet, affected, memo, visiting, depth + 1)
        {
            return result;
        }
        EvalMatrix::validate_shape(1, 1, 1, 0)?;
        Ok(EvalMatrix::new(
            1,
            1,
            vec![self.scalar_array_arg(
                selected,
                sheet,
                affected,
                memo,
                visiting,
                depth + 1,
            )],
        ))
    }

}

pub(super) fn dynamic_recompute_within_limit(total: usize, next: usize) -> Option<usize> {
    total
        .checked_add(next)
        .filter(|sum| *sum <= SPILL_MAX_RECOMPUTE_CELLS)
}

fn matrix_item_hash(matrix: &EvalMatrix, item: usize, by_col: bool) -> u64 {
    let mut hasher = DefaultHasher::new();
    let count = if by_col { matrix.rows } else { matrix.cols };
    for offset in 0..count {
        let value = if by_col {
            matrix.get(offset, item)
        } else {
            matrix.get(item, offset)
        };
        match value {
            Some(Value::Number(number)) => {
                0u8.hash(&mut hasher);
                let bits = if *number == 0.0 { 0 } else { number.to_bits() };
                bits.hash(&mut hasher);
            }
            Some(Value::Text(text)) => {
                1u8.hash(&mut hasher);
                for character in text.chars().flat_map(char::to_lowercase) {
                    character.hash(&mut hasher);
                }
            }
            Some(Value::Bool(value)) => {
                2u8.hash(&mut hasher);
                value.hash(&mut hasher);
            }
            Some(Value::Blank) => 3u8.hash(&mut hasher),
            Some(Value::Error(error)) => {
                4u8.hash(&mut hasher);
                error.slot().hash(&mut hasher);
            }
            None => 5u8.hash(&mut hasher),
        }
    }
    hasher.finish()
}

fn matrix_items_equal(
    matrix: &EvalMatrix,
    left: usize,
    right: usize,
    by_col: bool,
) -> Result<bool, FormulaError> {
    let count = if by_col { matrix.rows } else { matrix.cols };
    for offset in 0..count {
        let left = if by_col {
            matrix.get(offset, left)
        } else {
            matrix.get(left, offset)
        }
        .ok_or(FormulaError::Ref)?;
        let right = if by_col {
            matrix.get(offset, right)
        } else {
            matrix.get(right, offset)
        }
        .ok_or(FormulaError::Ref)?;
        let equal = match (left, right) {
            (Value::Error(left), Value::Error(right)) => left == right,
            (Value::Error(_), _) | (_, Value::Error(_)) => false,
            _ => compare_values(left, right)? == Ordering::Equal,
        };
        if !equal {
            return Ok(false);
        }
    }
    Ok(true)
}
