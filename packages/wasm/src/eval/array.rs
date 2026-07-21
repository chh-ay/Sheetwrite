//! Bounded dynamic-array evaluation for FILTER, SORT, UNIQUE, and direct ranges.

use std::cmp::Ordering;
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::mem::size_of;

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

use super::lookup::integer_arg;
use super::matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_RECOMPUTE_CELLS};
use super::value::{bool_from_value, compare_values};

impl CellStore {
    pub(super) fn dynamic_array_bound(
        &self,
        ast: &Ast,
        formula_sheet: usize,
    ) -> Option<Result<usize, FormulaError>> {
        let source = match ast {
            Ast::Range(..) | Ast::AbsRange(..) | Ast::NamedRange(..) => ast,
            Ast::Func(Func::Filter | Func::Sort | Func::Unique, args) => {
                let Some(source) = args.first() else {
                    return Some(Err(FormulaError::Value));
                };
                source
            }
            _ => return None,
        };
        Some(
            self.matrix_shape(source, formula_sheet)
                .map(|(_, _, cells)| cells),
        )
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
            Ast::Func(Func::Filter, args) => {
                self.eval_filter(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Sort, args) => {
                self.eval_sort(args, sheet, affected, memo, visiting, depth + 1)
            }
            Ast::Func(Func::Unique, args) => {
                self.eval_unique(args, sheet, affected, memo, visiting, depth + 1)
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

    fn matrix_shape(
        &self,
        ast: &Ast,
        formula_sheet: usize,
    ) -> Result<(usize, usize, usize), FormulaError> {
        if let Ast::Func(Func::Filter | Func::Sort | Func::Unique, args) = ast {
            let source = args.first().ok_or(FormulaError::Value)?;
            return self.matrix_shape(source, formula_sheet);
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
