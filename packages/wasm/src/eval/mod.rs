//! Formula recompute: dependency index, affected-set growth, evaluation.

mod array;
mod criteria;
mod date;
mod dependency;
mod functions;
mod lookup;
mod matrix;
mod value;

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use crate::calc::{Ast, CmpOp, Func, Op};
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, AbsCellKey, CellRange, EvalResult, FormulaError,
    FormulaValueKind, Value, FORMULA_RECURSION_LIMIT, KIND_BOOL, KIND_EMPTY, KIND_FORMULA,
    KIND_NUMBER, KIND_STRING, RANGE_CELL_LIMIT,
};

use criteria::{aggregate_if, Criterion};
pub(crate) use dependency::DepIndex;
use dependency::{build_dep_index, collect_affected_formulas, seed_dependency_depth_errors};
use functions::{apply_func, treats_cell_as_reference, FuncAccumulator};
use lookup::{find_match_index, integer_arg, positive_index};
use array::dynamic_recompute_within_limit;
use matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_BYTES};
pub(crate) use matrix::{matrix_resource_stats, reset_matrix_resource_stats};
use value::{
    bool_from_value, cached_formula_value, compare_values, number_from_value, text_from_value,
};

impl CellStore {
    pub(crate) fn recompute_sheet(&mut self, sheet: usize) {
        self.recompute_seed_sheets(&[sheet]);
    }

    pub(crate) fn recompute_changed(&mut self) {
        let seeds: Vec<usize> = self
            .sheets
            .iter()
            .enumerate()
            .filter_map(|(sheet, data)| {
                (!data.dirty_cells.is_empty() || data.all_dirty).then_some(sheet)
            })
            .collect();
        self.recompute_seed_sheets(&seeds);
    }

    fn recompute_seed_sheets(&mut self, seeds: &[usize]) {
        if seeds.is_empty() {
            return;
        }
        if self.sheets.iter().all(|sheet| sheet.formulas.is_empty()) {
            for &sheet in seeds {
                if let Some(data) = self.sheets.get_mut(sheet) {
                    data.clear_dirty();
                }
            }
            return;
        }

        let dep_index_stale = match &self.dep_index {
            Some(index) => index.epoch != self.formula_epoch,
            None => true,
        };
        if dep_index_stale {
            self.dep_index = Some(build_dep_index(&self.sheets, self.formula_epoch));
        }
        let Some(index) = self.dep_index.as_ref() else {
            return;
        };

        let mut affected = HashSet::new();
        for &sheet in seeds {
            affected.extend(collect_affected_formulas(&self.sheets, sheet, index));
        }
        if affected.is_empty() {
            for &sheet in seeds {
                if let Some(data) = self.sheets.get_mut(sheet) {
                    data.clear_dirty();
                }
            }
            return;
        }

        let mut memo: HashMap<AbsCellKey, EvalResult> = HashMap::with_capacity(affected.len());
        seed_dependency_depth_errors(&self.sheets, &affected, index, &mut memo);
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
                _ => None,
            };
            let sheet_index = abs_key.sheet as usize;
            let Some(data) = self.sheets.get_mut(sheet_index) else {
                continue;
            };
            let (row, col) = abs_key.local();
            let (row, col) = (row as usize, col as usize);
            if !data.contains_cell(row, col) {
                continue;
            }
            let index = data.idx(row, col);
            {
                let Some(entry) = data.formulas.get_mut(&abs_key.local()) else {
                    continue;
                };
                match &result {
                    Value::Number(_) => {
                        entry.error = None;
                        entry.value_kind = FormulaValueKind::Number;
                    }
                    Value::Text(_) => {
                        entry.error = None;
                        entry.value_kind = FormulaValueKind::Text;
                    }
                    Value::Bool(_) => {
                        entry.error = None;
                        entry.value_kind = FormulaValueKind::Bool;
                    }
                    Value::Blank => {
                        entry.error = None;
                        entry.value_kind = if entry.is_reference() {
                            FormulaValueKind::Blank
                        } else {
                            FormulaValueKind::Number
                        };
                    }
                    Value::Error(error) => {
                        entry.error = Some(*error);
                        entry.value_kind = FormulaValueKind::Number;
                    }
                }
            }
            match result {
                Value::Number(value) => data.set_num(index, value),
                Value::Text(_) => match interned {
                    Some(id) => data.set_str(index, id),
                    None => data.clear_payload(index),
                },
                Value::Bool(value) => data.set_num(index, f64::from(value)),
                Value::Blank | Value::Error(_) => data.clear_payload(index),
            }
        }
        for &sheet in seeds {
            if let Some(data) = self.sheets.get_mut(sheet) {
                data.clear_dirty();
            }
        }
    }

    pub(crate) fn eval_at(
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
        if !s.is_loaded(row, col) {
            return Value::Error(FormulaError::Loading);
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

        match s.kind_at(i) {
            KIND_NUMBER => Value::number(s.num_at(i)),
            KIND_STRING => string_from_pool_ref(&self.strings, s.str_id_at(i))
                .map(Value::text)
                .unwrap_or(Value::Error(FormulaError::Ref)),
            KIND_BOOL => Value::Bool(s.num_at(i) != 0.0),
            KIND_FORMULA => Value::number(s.num_at(i)),
            _ => Value::Blank,
        }
    }

    pub(crate) fn eval_formula_cell(
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
                None => Value::Error(entry.error.unwrap_or(FormulaError::Value)),
            },
            None => Value::Number(0.0),
        };

        visiting.remove(&key);
        memo.insert(key, result.clone());
        result
    }

    pub(crate) fn eval_ast(
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
            Ast::Str(text) => Value::text(text.as_str()),
            Ast::Bool(value) => Value::Bool(*value),
            Ast::Missing => Value::Blank,
            Ast::Cell(row, col, _) => self.eval_at(
                sheet,
                *row as usize,
                *col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::AbsCell(sheet_ref, row, col, _) => self.eval_at(
                sheet_ref.handle as usize,
                *row as usize,
                *col as usize,
                affected,
                memo,
                visiting,
                depth + 1,
            ),
            Ast::SheetCell(..) | Ast::InvalidRef => Value::Error(FormulaError::Ref),
            Ast::Name(_) | Ast::UnknownFunc(..) => Value::Error(FormulaError::Name),
            Ast::NamedRange(named)
                if named.row_start == named.row_end && named.col_start == named.col_end =>
            {
                self.eval_at(
                    named.sheet as usize,
                    named.row_start as usize,
                    named.col_start as usize,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                )
            }
            Ast::NamedRange(_) | Ast::Range(..) | Ast::AbsRange(..) | Ast::SheetRange(..) => {
                Value::Error(FormulaError::Value)
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
            Ast::Func(Func::Filter | Func::Sort | Func::Unique, _) => {
                match self
                    .eval_dynamic_array(ast, sheet, affected, memo, visiting, depth + 1)
                    .unwrap_or(Err(FormulaError::Value))
                {
                    Ok(matrix) => matrix.into_first(),
                    Err(error) => Value::Error(error),
                }
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

        if matches!(func, Func::Today | Func::Now) {
            if !args.is_empty() {
                return Value::Error(FormulaError::Value);
            }
            return Value::number(if func == Func::Today {
                self.volatile_serial.floor()
            } else {
                self.volatile_serial
            });
        }

        if matches!(
            func,
            Func::CountIf
                | Func::CountIfs
                | Func::SumIf
                | Func::SumIfs
                | Func::AverageIf
                | Func::AverageIfs
        ) {
            return self.eval_criteria_func(func, args, sheet, affected, memo, visiting, depth + 1);
        }

        if matches!(
            func,
            Func::Index | Func::Match | Func::VLookup | Func::HLookup | Func::XLookup
        ) {
            return self.eval_lookup_func(func, args, sheet, affected, memo, visiting, depth + 1);
        }

        let mut values = FuncAccumulator::default();
        for arg in args {
            let range = match arg {
                Ast::Range(row_start, col_start, row_end, col_end, _) => Some(CellRange::new(
                    sheet as u32,
                    *row_start,
                    *col_start,
                    *row_end,
                    *col_end,
                )),
                Ast::AbsRange(sheet_ref, row_start, col_start, row_end, col_end, _) => Some(
                    CellRange::new(sheet_ref.handle, *row_start, *col_start, *row_end, *col_end),
                ),
                Ast::NamedRange(named) => Some(CellRange::new(
                    named.sheet,
                    named.row_start,
                    named.col_start,
                    named.row_end,
                    named.col_end,
                )),
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

    fn eval_matrix_arg(
        &self,
        ast: &Ast,
        formula_sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let range = range_from_ast(ast, formula_sheet).ok_or(FormulaError::Value)?;
        let sheet = range.sheet as usize;
        let Some(data) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if data.row_count == 0
            || data.n_cols == 0
            || range.row_start as usize >= data.row_count
            || range.col_start as usize >= data.n_cols
        {
            return Err(FormulaError::Ref);
        }
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.row_count - 1);
        let col_end = (range.col_end as usize).min(data.n_cols - 1);
        let rows = row_end - row_start + 1;
        let cols = col_end - col_start + 1;
        let total = (rows as u64).saturating_mul(cols as u64);
        if total > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        let mut values = Vec::with_capacity(total as usize);
        for row in row_start..=row_end {
            for col in col_start..=col_end {
                if !data.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }
                values.push(self.eval_at(sheet, row, col, affected, memo, visiting, depth + 1));
            }
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }

    fn eval_criterion(
        &self,
        ast: &Ast,
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> Result<Criterion, FormulaError> {
        let value = self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        Ok(Criterion::parse(value))
    }

    fn eval_criteria_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        let result = match func {
            Func::CountIf => {
                if args.len() != 2 {
                    return Value::Error(FormulaError::Value);
                }
                let range = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion =
                    match self.eval_criterion(&args[1], sheet, affected, memo, visiting, depth + 1)
                    {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                Ok((
                    range
                        .values
                        .iter()
                        .filter(|value| criterion.matches(value))
                        .count() as f64,
                    0,
                ))
            }
            Func::CountIfs => {
                if args.is_empty() || args.len() % 2 != 0 {
                    return Value::Error(FormulaError::Value);
                }
                let mut ranges = Vec::with_capacity(args.len() / 2);
                let mut criteria = Vec::with_capacity(args.len() / 2);
                for pair in args.chunks_exact(2) {
                    let range = match self.eval_matrix_arg(
                        &pair[0],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if ranges
                        .first()
                        .is_some_and(|first: &EvalMatrix| !first.same_shape(&range))
                    {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(
                        &pair[1],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let count = (0..ranges[0].values.len())
                    .filter(|&index| {
                        ranges
                            .iter()
                            .zip(&criteria)
                            .all(|(range, criterion)| criterion.matches(&range.values[index]))
                    })
                    .count();
                Ok((count as f64, 0))
            }
            Func::SumIf | Func::AverageIf => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let criteria_range = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion =
                    match self.eval_criterion(&args[1], sheet, affected, memo, visiting, depth + 1)
                    {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                let sum_range = if let Some(ast) = args.get(2) {
                    match self.eval_matrix_arg(ast, sheet, affected, memo, visiting, depth + 1) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    }
                } else {
                    EvalMatrix::new(
                        criteria_range.rows,
                        criteria_range.cols,
                        criteria_range.values.clone(),
                    )
                };
                if !criteria_range.same_shape(&sum_range) {
                    return Value::Error(FormulaError::Value);
                }
                aggregate_if(&sum_range, &[(&criteria_range, &criterion)])
            }
            Func::SumIfs | Func::AverageIfs => {
                if args.len() < 3 || args.len() % 2 == 0 {
                    return Value::Error(FormulaError::Value);
                }
                let sum_range = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let mut ranges = Vec::with_capacity((args.len() - 1) / 2);
                let mut criteria = Vec::with_capacity((args.len() - 1) / 2);
                for pair in args[1..].chunks_exact(2) {
                    let range = match self.eval_matrix_arg(
                        &pair[0],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if !sum_range.same_shape(&range) {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(
                        &pair[1],
                        sheet,
                        affected,
                        memo,
                        visiting,
                        depth + 1,
                    ) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let pairs: Vec<_> = ranges.iter().zip(&criteria).collect();
                aggregate_if(&sum_range, &pairs)
            }
            _ => return Value::Error(FormulaError::Value),
        };
        match result {
            Ok((sum_or_count, numeric_count)) => {
                if matches!(func, Func::AverageIf | Func::AverageIfs) {
                    if numeric_count == 0 {
                        Value::Error(FormulaError::DivZero)
                    } else {
                        Value::number(sum_or_count / numeric_count as f64)
                    }
                } else {
                    Value::number(sum_or_count)
                }
            }
            Err(error) => Value::Error(error),
        }
    }

    fn eval_lookup_func(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        affected: &HashSet<AbsCellKey>,
        memo: &mut HashMap<AbsCellKey, EvalResult>,
        visiting: &mut HashSet<AbsCellKey>,
        depth: usize,
    ) -> EvalResult {
        let scalar = |ast: &Ast,
                      memo: &mut HashMap<AbsCellKey, EvalResult>,
                      visiting: &mut HashSet<AbsCellKey>| {
            self.eval_ast(ast, sheet, affected, memo, visiting, depth + 1)
        };
        match func {
            Func::Index => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let matrix = match self.eval_matrix_arg(
                    &args[0],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                };
                let first = scalar(&args[1], memo, visiting);
                let first = match positive_index(&first) {
                    Ok(index) => index,
                    Err(error) => return Value::Error(error),
                };
                let (row, col) = if matrix.rows == 1 && args.len() == 2 {
                    (0, first)
                } else if matrix.cols == 1 && args.len() == 2 {
                    (first, 0)
                } else {
                    let Some(col_arg) = args.get(2) else {
                        return Value::Error(FormulaError::Value);
                    };
                    let col = scalar(col_arg, memo, visiting);
                    let col = match positive_index(&col) {
                        Ok(index) => index,
                        Err(error) => return Value::Error(error),
                    };
                    (first, col)
                };
                matrix
                    .get(row, col)
                    .cloned()
                    .unwrap_or(Value::Error(FormulaError::Ref))
            }
            Func::Match => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let matrix = match self.eval_matrix_arg(
                    &args[1],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                };
                if matrix.rows != 1 && matrix.cols != 1 {
                    return Value::Error(FormulaError::Na);
                }
                let mode = optional_ast(args, 2)
                    .map(|arg| scalar(arg, memo, visiting))
                    .map_or(Ok(1), |value| integer_arg(&value));
                let mode = match mode {
                    Ok(mode @ (-1..=1)) => mode,
                    _ => return Value::Error(FormulaError::Value),
                };
                let (match_mode, search_mode) = match mode {
                    1 => (-1, 2),
                    -1 => (1, -2),
                    _ => (0, 1),
                };
                match find_match_index(&matrix.values, &key, match_mode, search_mode) {
                    Ok(Some(index)) => Value::number((index + 1) as f64),
                    Ok(None) => Value::Error(FormulaError::Na),
                    Err(error) => Value::Error(error),
                }
            }
            Func::VLookup | Func::HLookup => {
                if !(3..=4).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let matrix = match self.eval_matrix_arg(
                    &args[1],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                };
                let result_index = match positive_index(&scalar(&args[2], memo, visiting)) {
                    Ok(index) => index,
                    Err(error) => return Value::Error(error),
                };
                let sorted = match optional_ast(args, 3) {
                    Some(arg) => match bool_from_value(&scalar(arg, memo, visiting)) {
                        Ok(value) => value,
                        Err(error) => return Value::Error(error),
                    },
                    None => true,
                };
                let lookup_values: Vec<_> = if func == Func::VLookup {
                    (0..matrix.rows)
                        .filter_map(|row| matrix.get(row, 0).cloned())
                        .collect()
                } else {
                    (0..matrix.cols)
                        .filter_map(|col| matrix.get(0, col).cloned())
                        .collect()
                };
                let found = match find_match_index(
                    &lookup_values,
                    &key,
                    if sorted { -1 } else { 0 },
                    if sorted { 2 } else { 1 },
                ) {
                    Ok(Some(index)) => index,
                    Ok(None) => return Value::Error(FormulaError::Na),
                    Err(error) => return Value::Error(error),
                };
                let value = if func == Func::VLookup {
                    matrix.get(found, result_index)
                } else {
                    matrix.get(result_index, found)
                };
                value.cloned().unwrap_or(Value::Error(FormulaError::Ref))
            }
            Func::XLookup => {
                if !(3..=6).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let key = scalar(&args[0], memo, visiting);
                if let Value::Error(error) = key {
                    return Value::Error(error);
                }
                let lookup = match self.eval_matrix_arg(
                    &args[1],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                };
                let result = match self.eval_matrix_arg(
                    &args[2],
                    sheet,
                    affected,
                    memo,
                    visiting,
                    depth + 1,
                ) {
                    Ok(matrix) => matrix,
                    Err(error) => return Value::Error(error),
                };
                if lookup.values.len() != result.values.len()
                    || (lookup.rows != 1 && lookup.cols != 1)
                {
                    return Value::Error(FormulaError::Value);
                }
                let match_mode = match optional_ast(args, 4) {
                    Some(arg) => match integer_arg(&scalar(arg, memo, visiting)) {
                        Ok(mode @ (-1..=2)) => mode,
                        _ => return Value::Error(FormulaError::Value),
                    },
                    None => 0,
                };
                let search_mode = match optional_ast(args, 5) {
                    Some(arg) => match integer_arg(&scalar(arg, memo, visiting)) {
                        Ok(mode @ (-2 | -1 | 1 | 2)) => mode,
                        _ => return Value::Error(FormulaError::Value),
                    },
                    None => 1,
                };
                match find_match_index(&lookup.values, &key, match_mode, search_mode) {
                    Ok(Some(index)) => result.values[index].clone(),
                    Ok(None) => optional_ast(args, 3)
                        .map_or(Value::Error(FormulaError::Na), |arg| {
                            scalar(arg, memo, visiting)
                        }),
                    Err(error) => Value::Error(error),
                }
            }
            _ => Value::Error(FormulaError::Value),
        }
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
                if !s.is_loaded(row, col) {
                    return Err(FormulaError::Loading);
                }
                let i = s.idx(row, col);
                if s.kind_at(i) == KIND_EMPTY {
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
