//! Formula recompute: dependency index, affected-set growth, evaluation.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet, VecDeque};

use crate::calc::{Ast, CmpOp, Func, Op};
use crate::sheet::SheetData;
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, AbsCellKey, CellRange, EvalResult, FormulaEntry, FormulaError,
    FormulaValueKind, StringPool, Value, FORMULA_RECURSION_LIMIT, KIND_BOOL, KIND_EMPTY,
    KIND_FORMULA, KIND_NUMBER, KIND_STRING, RANGE_CELL_LIMIT,
};

pub(crate) struct DepIndex {
    pub(crate) exact_dependents: HashMap<AbsCellKey, Vec<AbsCellKey>>,
    pub(crate) range_groups: Vec<RangeGroup>,
    pub(crate) range_sheets: Vec<RangeSheetIndex>,
    pub(crate) epoch: u64,
}

impl DepIndex {
    pub(crate) fn collect_matching_range_groups(
        &self,
        cell: AbsCellKey,
        matches: &mut Vec<usize>,
        row_matches: &mut Vec<usize>,
        marks: &mut [u32],
        stamp: &mut u32,
    ) {
        matches.clear();
        row_matches.clear();

        let Some(sheet) = self.range_sheets.get(cell.sheet as usize) else {
            return;
        };

        collect_interval_matches(&sheet.col_intervals, cell.col, matches);
        if matches.is_empty() {
            return;
        }

        collect_interval_matches(&sheet.row_intervals, cell.row, row_matches);
        if row_matches.is_empty() {
            matches.clear();
            return;
        }

        let current = next_match_stamp(marks, stamp);
        if matches.len() <= row_matches.len() {
            for &group in matches.iter() {
                marks[group] = current;
            }
            matches.clear();
            for &group in row_matches.iter() {
                if marks[group] == current {
                    matches.push(group);
                }
            }
        } else {
            for &group in row_matches.iter() {
                marks[group] = current;
            }
            matches.retain(|group| marks[*group] == current);
        }
    }
}

pub(crate) struct RangeGroup {
    pub(crate) range: CellRange,
    pub(crate) dependents: Vec<AbsCellKey>,
}

#[derive(Default)]
pub(crate) struct RangeSheetIndex {
    pub(crate) row_intervals: Vec<RangeInterval>,
    pub(crate) col_intervals: Vec<RangeInterval>,
}

impl RangeSheetIndex {
    pub(crate) fn finish(&mut self) {
        prepare_interval_index(&mut self.row_intervals);
        prepare_interval_index(&mut self.col_intervals);
    }
}

#[derive(Clone, Copy)]
pub(crate) struct RangeInterval {
    pub(crate) start: u32,
    pub(crate) end: u32,
    pub(crate) group: usize,
    pub(crate) max_end: u32,
}

impl RangeInterval {
    pub(crate) fn new(start: u32, end: u32, group: usize) -> Self {
        Self {
            start,
            end,
            group,
            max_end: end,
        }
    }
}

impl CellStore {
    pub(crate) fn recompute_sheet(&mut self, sheet: usize) {
        let Some(s) = self.sheets.get(sheet) else {
            return;
        };
        if s.dirty_cells.is_empty() && !s.all_dirty {
            return;
        }

        if self.sheets.iter().all(|s| s.formulas.is_empty()) {
            self.sheets[sheet].clear_dirty();
            return;
        }

        let dep_index_stale = match &self.dep_index {
            Some(index) => index.epoch != self.formula_epoch,
            None => true,
        };
        if dep_index_stale {
            let index = build_dep_index(&self.sheets, self.formula_epoch);
            self.dep_index = Some(index);
        }
        let Some(index) = self.dep_index.as_ref() else {
            return;
        };

        let affected = collect_affected_formulas(&self.sheets, sheet, index);
        if affected.is_empty() {
            self.sheets[sheet].clear_dirty();
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
            let Some(s) = self.sheets.get_mut(sheet_index) else {
                continue;
            };
            let (row, col) = abs_key.local();
            let (row, col) = (row as usize, col as usize);
            if !s.contains_cell(row, col) {
                continue;
            }
            let i = s.idx(row, col);
            {
                let Some(entry) = s.formulas.get_mut(&abs_key.local()) else {
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
                        entry.value_kind = FormulaValueKind::Number;
                    }
                    Value::Error(error) => {
                        entry.error = Some(*error);
                        entry.value_kind = FormulaValueKind::Number;
                    }
                }
            }
            match result {
                Value::Number(value) => s.set_num(i, value),
                Value::Text(_) => match interned {
                    Some(id) => s.set_str(i, id),
                    None => s.clear_payload(i),
                },
                Value::Bool(value) => s.set_num(i, f64::from(value)),
                Value::Blank | Value::Error(_) => s.clear_payload(i),
            }
        }
        self.sheets[sheet].clear_dirty();
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
        Ok(EvalMatrix { rows, cols, values })
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
                    EvalMatrix {
                        rows: criteria_range.rows,
                        cols: criteria_range.cols,
                        values: criteria_range.values.clone(),
                    }
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

#[derive(Debug, Default)]
struct FuncAccumulator {
    values: Vec<FuncValue>,
}

#[derive(Debug)]
struct FuncValue {
    value: Value,
    from_range: bool,
}

#[derive(Debug)]
struct EvalMatrix {
    rows: usize,
    cols: usize,
    values: Vec<Value>,
}

impl EvalMatrix {
    fn get(&self, row: usize, col: usize) -> Option<&Value> {
        (row < self.rows && col < self.cols)
            .then(|| self.values.get(row * self.cols + col))
            .flatten()
    }

    fn same_shape(&self, other: &Self) -> bool {
        self.rows == other.rows && self.cols == other.cols
    }
}

fn optional_ast(args: &[Ast], index: usize) -> Option<&Ast> {
    match args.get(index) {
        Some(Ast::Missing) | None => None,
        value => value,
    }
}

fn range_from_ast(ast: &Ast, formula_sheet: usize) -> Option<CellRange> {
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

#[derive(Debug)]
enum WildcardToken {
    Literal(char),
    AnyOne,
    AnyMany,
}

#[derive(Debug)]
struct Criterion {
    op: CmpOp,
    operand: Value,
    wildcard: Option<Vec<WildcardToken>>,
}

impl Criterion {
    fn parse(value: Value) -> Self {
        let Value::Text(text) = value else {
            return Self {
                op: CmpOp::Eq,
                operand: value,
                wildcard: None,
            };
        };
        let raw = text.trim();
        let (op, operand) = if let Some(rest) = raw.strip_prefix("<>") {
            (CmpOp::Ne, rest)
        } else if let Some(rest) = raw.strip_prefix("<=") {
            (CmpOp::Le, rest)
        } else if let Some(rest) = raw.strip_prefix(">=") {
            (CmpOp::Ge, rest)
        } else if let Some(rest) = raw.strip_prefix('<') {
            (CmpOp::Lt, rest)
        } else if let Some(rest) = raw.strip_prefix('>') {
            (CmpOp::Gt, rest)
        } else if let Some(rest) = raw.strip_prefix('=') {
            (CmpOp::Eq, rest)
        } else {
            (CmpOp::Eq, raw)
        };
        let operand = operand.trim();
        let parsed_operand = if operand.eq_ignore_ascii_case("TRUE") {
            Value::Bool(true)
        } else if operand.eq_ignore_ascii_case("FALSE") {
            Value::Bool(false)
        } else if let Ok(number) = operand.parse::<f64>() {
            Value::number(number)
        } else {
            Value::text(operand)
        };
        let wildcard = if matches!(op, CmpOp::Eq | CmpOp::Ne) {
            wildcard_tokens(operand)
        } else {
            None
        };
        Self {
            op,
            operand: parsed_operand,
            wildcard,
        }
    }

    fn matches(&self, candidate: &Value) -> bool {
        let ordering = if let Some(pattern) = &self.wildcard {
            let text = criterion_text(candidate);
            let matched = text.is_some_and(|text| wildcard_matches(pattern, &text));
            return if self.op == CmpOp::Ne {
                !matched
            } else {
                matched
            };
        } else {
            criterion_compare(candidate, &self.operand)
        };
        ordering.is_some_and(|ordering| ordering_matches(ordering, self.op))
    }
}

fn wildcard_tokens(pattern: &str) -> Option<Vec<WildcardToken>> {
    let mut tokens = Vec::new();
    let normalized = pattern.to_lowercase();
    let mut chars = normalized.chars().peekable();
    let mut has_pattern_syntax = false;
    while let Some(ch) = chars.next() {
        match ch {
            '~' => match chars.peek().copied() {
                Some(literal @ ('*' | '?' | '~')) => {
                    has_pattern_syntax = true;
                    chars.next();
                    tokens.push(WildcardToken::Literal(literal));
                }
                _ => tokens.push(WildcardToken::Literal('~')),
            },
            '*' => {
                has_pattern_syntax = true;
                if !matches!(tokens.last(), Some(WildcardToken::AnyMany)) {
                    tokens.push(WildcardToken::AnyMany);
                }
            }
            '?' => {
                has_pattern_syntax = true;
                tokens.push(WildcardToken::AnyOne);
            }
            literal => tokens.push(WildcardToken::Literal(literal)),
        }
    }
    has_pattern_syntax.then_some(tokens)
}

fn wildcard_matches(pattern: &[WildcardToken], value: &str) -> bool {
    let text: Vec<char> = value.to_lowercase().chars().collect();
    let (mut pattern_index, mut text_index) = (0usize, 0usize);
    let (mut star_index, mut star_text) = (None, 0usize);
    while text_index < text.len() {
        match pattern.get(pattern_index) {
            Some(WildcardToken::Literal(expected)) if *expected == text[text_index] => {
                pattern_index += 1;
                text_index += 1;
            }
            Some(WildcardToken::AnyOne) => {
                pattern_index += 1;
                text_index += 1;
            }
            Some(WildcardToken::AnyMany) => {
                star_index = Some(pattern_index);
                pattern_index += 1;
                star_text = text_index;
            }
            _ => {
                let Some(star) = star_index else {
                    return false;
                };
                star_text += 1;
                text_index = star_text;
                pattern_index = star + 1;
            }
        }
    }
    while matches!(pattern.get(pattern_index), Some(WildcardToken::AnyMany)) {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}

fn criterion_text(value: &Value) -> Option<String> {
    match value {
        Value::Text(text) => Some(text.to_string()),
        Value::Blank => Some(String::new()),
        Value::Error(error) => Some(error.sentinel().to_string()),
        _ => None,
    }
}

fn criterion_compare(left: &Value, right: &Value) -> Option<Ordering> {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => left.partial_cmp(right),
        (Value::Bool(left), Value::Bool(right)) => Some(left.cmp(right)),
        (Value::Text(left), Value::Text(right)) => {
            Some(left.to_lowercase().cmp(&right.to_lowercase()))
        }
        (Value::Blank, Value::Blank) => Some(Ordering::Equal),
        (Value::Blank, Value::Text(right)) if right.is_empty() => Some(Ordering::Equal),
        (Value::Text(left), Value::Blank) if left.is_empty() => Some(Ordering::Equal),
        (Value::Error(left), Value::Text(right)) => {
            Some(left.sentinel().to_lowercase().cmp(&right.to_lowercase()))
        }
        _ => None,
    }
}

fn ordering_matches(ordering: Ordering, op: CmpOp) -> bool {
    match op {
        CmpOp::Eq => ordering == Ordering::Equal,
        CmpOp::Ne => ordering != Ordering::Equal,
        CmpOp::Lt => ordering == Ordering::Less,
        CmpOp::Gt => ordering == Ordering::Greater,
        CmpOp::Le => matches!(ordering, Ordering::Less | Ordering::Equal),
        CmpOp::Ge => matches!(ordering, Ordering::Greater | Ordering::Equal),
    }
}

fn aggregate_if(
    sum_range: &EvalMatrix,
    criteria: &[(&EvalMatrix, &Criterion)],
) -> Result<(f64, u64), FormulaError> {
    let mut sum = 0.0;
    let mut count = 0;
    for (index, value) in sum_range.values.iter().enumerate() {
        if !criteria
            .iter()
            .all(|(range, criterion)| criterion.matches(&range.values[index]))
        {
            continue;
        }
        match value {
            Value::Number(value) => {
                sum += value;
                count += 1;
            }
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
    }
    Ok((sum, count))
}

fn integer_arg(value: &Value) -> Result<i32, FormulaError> {
    let number = number_from_value(value)?;
    if !number.is_finite()
        || number.fract() != 0.0
        || number < i32::MIN as f64
        || number > i32::MAX as f64
    {
        return Err(FormulaError::Value);
    }
    Ok(number as i32)
}

fn positive_index(value: &Value) -> Result<usize, FormulaError> {
    let index = integer_arg(value)?;
    if index <= 0 {
        return Err(FormulaError::Value);
    }
    Ok(index as usize - 1)
}

fn lookup_compare(left: &Value, right: &Value) -> Result<Ordering, FormulaError> {
    match (left, right) {
        (Value::Text(left), Value::Text(right)) => {
            Ok(left.to_lowercase().cmp(&right.to_lowercase()))
        }
        (Value::Error(error), _) | (_, Value::Error(error)) => Err(*error),
        _ => compare_values(left, right),
    }
}

fn find_match_index(
    values: &[Value],
    key: &Value,
    match_mode: i32,
    search_mode: i32,
) -> Result<Option<usize>, FormulaError> {
    if values.is_empty() {
        return Ok(None);
    }
    if search_mode.abs() == 2 {
        let ascending = search_mode == 2;
        for pair in values.windows(2) {
            let ordering = lookup_compare(&pair[0], &pair[1])?;
            if (ascending && ordering == Ordering::Greater)
                || (!ascending && ordering == Ordering::Less)
            {
                return Ok(None);
            }
        }
    }
    let reverse = search_mode < 0;
    let inspect = |index: usize| -> Result<bool, FormulaError> {
        if match_mode == 2 {
            let Value::Text(pattern) = key else {
                return Ok(false);
            };
            let criterion = Criterion::parse(Value::text(pattern.as_ref()));
            return Ok(criterion.matches(&values[index]));
        }
        Ok(lookup_compare(&values[index], key)? == Ordering::Equal)
    };
    if reverse {
        for index in (0..values.len()).rev() {
            if inspect(index)? {
                return Ok(Some(index));
            }
        }
    } else {
        for index in 0..values.len() {
            if inspect(index)? {
                return Ok(Some(index));
            }
        }
    }
    if !matches!(match_mode, -1 | 1) {
        return Ok(None);
    }
    let mut best: Option<(usize, Value)> = None;
    for (index, candidate) in values.iter().enumerate() {
        let ordering = lookup_compare(candidate, key)?;
        let eligible = if match_mode == -1 {
            ordering == Ordering::Less
        } else {
            ordering == Ordering::Greater
        };
        if !eligible {
            continue;
        }
        let replace = match &best {
            None => true,
            Some((_, current)) => {
                let ordering = lookup_compare(candidate, current)?;
                if match_mode == -1 {
                    ordering == Ordering::Greater
                } else {
                    ordering == Ordering::Less
                }
            }
        };
        if replace {
            best = Some((index, candidate.clone()));
        }
    }
    Ok(best.map(|(index, _)| index))
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
            Value::text(text.chars().take(count).collect::<String>())
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
            Value::text(
                text.chars()
                    .skip(len.saturating_sub(count))
                    .collect::<String>(),
            )
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
            Value::text(text.chars().skip(start - 1).take(count).collect::<String>())
        }
        Func::Concat | Func::Concatenate => {
            let mut out = String::new();
            for entry in &values.values {
                match text_from_value(&entry.value) {
                    Ok(text) => out.push_str(&text),
                    Err(error) => return Value::Error(error),
                }
            }
            Value::text(out)
        }
        Func::Upper => match text_arg(values, 0) {
            Ok(text) => Value::text(text.to_uppercase()),
            Err(error) => Value::Error(error),
        },
        Func::Lower => match text_arg(values, 0) {
            Ok(text) => Value::text(text.to_lowercase()),
            Err(error) => Value::Error(error),
        },
        Func::Trim => match text_arg(values, 0) {
            Ok(text) => Value::text(text.split_whitespace().collect::<Vec<_>>().join(" ")),
            Err(error) => Value::Error(error),
        },
        Func::Text => {
            let value = values.first(0);
            let format = match text_arg(values, 1) {
                Ok(format) => format,
                Err(error) => return Value::Error(error),
            };
            match format_basic_text(&value, &format) {
                Ok(text) => Value::text(text),
                Err(error) => Value::Error(error),
            }
        }
        Func::Date => {
            let year = match number_arg(values, 0, 0.0) {
                Ok(value) => value.trunc() as i64,
                Err(error) => return Value::Error(error),
            };
            let month = match number_arg(values, 1, 1.0) {
                Ok(value) => value.trunc() as i64,
                Err(error) => return Value::Error(error),
            };
            let day = match number_arg(values, 2, 1.0) {
                Ok(value) => value.trunc() as i64,
                Err(error) => return Value::Error(error),
            };
            date_serial(year, month, day).map_or_else(Value::Error, Value::number)
        }
        Func::DateValue => match text_arg(values, 0)
            .and_then(|text| parse_date_value(&text).ok_or(FormulaError::Value))
        {
            Ok(value) => Value::number(value),
            Err(error) => Value::Error(error),
        },
        Func::Day | Func::Month | Func::Year => {
            let serial = match number_arg(values, 0, 0.0) {
                Ok(value) => value,
                Err(error) => return Value::Error(error),
            };
            let Some((year, month, day)) = date_parts(serial) else {
                return Value::Error(FormulaError::Num);
            };
            Value::number(match func {
                Func::Day => day as f64,
                Func::Month => month as f64,
                Func::Year => year as f64,
                _ => unreachable!(),
            })
        }
        Func::Na => Value::Error(FormulaError::Na),
        Func::Today
        | Func::Now
        | Func::CountIf
        | Func::CountIfs
        | Func::SumIf
        | Func::SumIfs
        | Func::AverageIf
        | Func::AverageIfs
        | Func::Index
        | Func::Match
        | Func::VLookup
        | Func::HLookup
        | Func::XLookup => Value::Error(FormulaError::Value),
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
pub(crate) fn cached_formula_value(
    sheet: &SheetData,
    strings: &StringPool,
    index: usize,
    entry: &FormulaEntry,
) -> Value {
    if let Some(error) = entry.error {
        return Value::Error(error);
    }

    match entry.value_kind {
        FormulaValueKind::Number => Value::number(sheet.num_at(index)),
        FormulaValueKind::Text => string_from_pool_ref(strings, sheet.str_id_at(index))
            .map(Value::text)
            .unwrap_or(Value::Error(FormulaError::Ref)),
        FormulaValueKind::Bool => Value::Bool(sheet.num_at(index) != 0.0),
    }
}

pub(crate) fn bool_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

pub(crate) fn number_from_value(value: &Value) -> Result<f64, FormulaError> {
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

pub(crate) fn bool_from_value(value: &Value) -> Result<bool, FormulaError> {
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

pub(crate) fn text_from_value(value: &Value) -> Result<String, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(value.to_string()),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Text(text) => Ok(text.to_string()),
        Value::Bool(value) => Ok(bool_text(*value).to_string()),
        Value::Error(error) => Err(*error),
        Value::Blank => Ok(String::new()),
    }
}

pub(crate) fn compare_values(left: &Value, right: &Value) -> Result<Ordering, FormulaError> {
    match (left, right) {
        (Value::Blank, Value::Blank) => Ok(Ordering::Equal),
        (Value::Blank, Value::Number(right)) => 0.0f64.partial_cmp(right).ok_or(FormulaError::Num),
        (Value::Number(left), Value::Blank) => left.partial_cmp(&0.0).ok_or(FormulaError::Num),
        (Value::Blank, Value::Text(right)) => Ok("".cmp(right.as_ref())),
        (Value::Text(left), Value::Blank) => Ok(left.as_ref().cmp("")),
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

pub(crate) fn value_rank(value: &Value) -> u8 {
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

const UNIX_EPOCH_SERIAL: i64 = 25_569;

fn days_from_civil(mut year: i64, month: i64, day: i64) -> i64 {
    year -= i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = shifted_month + if shifted_month < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year, month, day)
}

fn date_serial(mut year: i64, month: i64, day: i64) -> Result<f64, FormulaError> {
    if (0..=1899).contains(&year) {
        year += 1900;
    }
    let total_months = year
        .checked_mul(12)
        .and_then(|value| value.checked_add(month - 1))
        .ok_or(FormulaError::Num)?;
    let normalized_year = total_months.div_euclid(12);
    let normalized_month = total_months.rem_euclid(12) + 1;
    let first_day = days_from_civil(normalized_year, normalized_month, 1);
    let mut first_serial = first_day + UNIX_EPOCH_SERIAL;
    if (normalized_year, normalized_month) <= (1900, 2) {
        first_serial -= 1;
    }
    let serial = first_serial.checked_add(day - 1).ok_or(FormulaError::Num)?;
    let (result_year, _, _) = date_parts(serial as f64).ok_or(FormulaError::Num)?;
    if !(0..=9999).contains(&result_year) {
        return Err(FormulaError::Num);
    }
    Ok(serial as f64)
}

fn date_parts(serial: f64) -> Option<(i64, i64, i64)> {
    if !serial.is_finite() {
        return None;
    }
    let days = serial.floor();
    if days < i64::MIN as f64 || days > i64::MAX as f64 {
        return None;
    }
    if days == 60.0 {
        return Some((1900, 2, 29));
    }
    let offset = if days < 60.0 {
        UNIX_EPOCH_SERIAL - 1
    } else {
        UNIX_EPOCH_SERIAL
    };
    let parts = civil_from_days(days as i64 - offset);
    (0..=9999).contains(&parts.0).then_some(parts)
}

fn exact_date(year: i64, month: i64, day: i64) -> Option<f64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let serial = date_serial(year, month, day).ok()?;
    (date_parts(serial) == Some((year, month, day))).then_some(serial)
}

fn parse_date_value(text: &str) -> Option<f64> {
    let date = text.trim().split(['T', ' ']).next()?;
    if let Some((year, rest)) = date.split_once('-') {
        let (month, day) = rest.split_once('-')?;
        return exact_date(year.parse().ok()?, month.parse().ok()?, day.parse().ok()?);
    }
    let mut parts = date.split('/');
    let first: i64 = parts.next()?.parse().ok()?;
    let second: i64 = parts.next()?.parse().ok()?;
    let year: i64 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let (month, day) = if first > 12 && second <= 12 {
        (second, first)
    } else if first <= 12 {
        (first, second)
    } else {
        return None;
    };
    exact_date(year, month, day)
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

pub(crate) fn aggregate_number(
    value: &Value,
    from_range: bool,
) -> Result<Option<f64>, FormulaError> {
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

fn format_date_serial(serial: f64, format: &str) -> Option<String> {
    let (year, month, day) = date_parts(serial)?;
    let total_seconds = ((serial.rem_euclid(1.0) * 86_400.0).round() as u32) % 86_400;
    let hour = total_seconds / 3_600;
    let minute = total_seconds % 3_600 / 60;
    let second = total_seconds % 60;
    match format.to_ascii_lowercase().as_str() {
        "yyyy-mm-dd" => Some(format!("{year:04}-{month:02}-{day:02}")),
        "yyyy/mm/dd" => Some(format!("{year:04}/{month:02}/{day:02}")),
        "mm/dd/yyyy" => Some(format!("{month:02}/{day:02}/{year:04}")),
        "dd/mm/yyyy" => Some(format!("{day:02}/{month:02}/{year:04}")),
        "m/d/yyyy" => Some(format!("{month}/{day}/{year:04}")),
        "yyyy-mm-dd hh:mm" => Some(format!(
            "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}"
        )),
        "yyyy-mm-dd hh:mm:ss" => Some(format!(
            "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"
        )),
        "hh:mm" => Some(format!("{hour:02}:{minute:02}")),
        "hh:mm:ss" => Some(format!("{hour:02}:{minute:02}:{second:02}")),
        _ => None,
    }
}

pub(crate) fn format_basic_text(value: &Value, format: &str) -> Result<String, FormulaError> {
    let Value::Number(number) = value else {
        return text_from_value(value);
    };
    if !number.is_finite() {
        return Err(FormulaError::Num);
    }

    if let Some(formatted) = format_date_serial(*number, format) {
        return Ok(formatted);
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

pub(crate) fn build_dep_index(sheets: &[SheetData], epoch: u64) -> DepIndex {
    let mut exact_dependents: HashMap<AbsCellKey, Vec<AbsCellKey>> = HashMap::new();
    let mut range_dependents: HashMap<CellRange, Vec<AbsCellKey>> = HashMap::new();

    for (sheet_index, sheet) in sheets.iter().enumerate() {
        for (&formula_cell, entry) in &sheet.formulas {
            let formula_abs = AbsCellKey::from_local(sheet_index, formula_cell);
            for &cell in &entry.reads.cells {
                exact_dependents.entry(cell).or_default().push(formula_abs);
            }
            for &range in &entry.reads.ranges {
                range_dependents.entry(range).or_default().push(formula_abs);
            }
        }
    }

    let mut range_groups = Vec::with_capacity(range_dependents.len());
    let mut range_sheets: Vec<RangeSheetIndex> = (0..sheets.len())
        .map(|_| RangeSheetIndex::default())
        .collect();
    for (range, dependents) in range_dependents {
        let group = range_groups.len();
        range_groups.push(RangeGroup { range, dependents });
        if let Some(sheet) = range_sheets.get_mut(range.sheet as usize) {
            sheet
                .row_intervals
                .push(RangeInterval::new(range.row_start, range.row_end, group));
            sheet
                .col_intervals
                .push(RangeInterval::new(range.col_start, range.col_end, group));
        }
    }
    for sheet in &mut range_sheets {
        sheet.finish();
    }

    DepIndex {
        exact_dependents,
        range_groups,
        range_sheets,
        epoch,
    }
}

pub(crate) fn prepare_interval_index(intervals: &mut [RangeInterval]) {
    intervals.sort_unstable_by(|a, b| {
        a.start
            .cmp(&b.start)
            .then_with(|| a.end.cmp(&b.end))
            .then_with(|| a.group.cmp(&b.group))
    });
    let mut max_end = 0;
    for interval in intervals {
        max_end = max_end.max(interval.end);
        interval.max_end = max_end;
    }
}

pub(crate) fn collect_interval_matches(
    intervals: &[RangeInterval],
    point: u32,
    out: &mut Vec<usize>,
) {
    out.clear();
    let mut cursor = intervals.partition_point(|interval| interval.start <= point);
    while cursor > 0 {
        cursor -= 1;
        let interval = intervals[cursor];
        if interval.max_end < point {
            break;
        }
        if interval.end >= point {
            out.push(interval.group);
        }
    }
}

pub(crate) fn next_match_stamp(marks: &mut [u32], stamp: &mut u32) -> u32 {
    if *stamp == u32::MAX {
        marks.fill(0);
        *stamp = 1;
    }
    let current = *stamp;
    *stamp += 1;
    current
}

pub(crate) fn collect_affected_formulas(
    sheets: &[SheetData],
    seed_sheet: usize,
    index: &DepIndex,
) -> HashSet<AbsCellKey> {
    let mut affected: HashSet<AbsCellKey> = HashSet::new();
    let mut seen_dirty: HashSet<AbsCellKey> = HashSet::new();
    let mut queue: VecDeque<AbsCellKey> = VecDeque::new();
    let mut range_matches: Vec<usize> = Vec::new();
    let mut row_matches: Vec<usize> = Vec::new();
    let mut range_marks = vec![0; index.range_groups.len()];
    let mut range_stamp = 1;
    if let Some(sheet) = sheets.get(seed_sheet) {
        if sheet.all_dirty {
            // A bulk load or structural rewrite touched (potentially) every
            // cell on this sheet. Seed every formula on the sheet plus every
            // formula registered as reading any of its cells or ranges; the
            // BFS below grows transitive dependents as usual. This is bounded
            // by formula/read-set counts, never by row count.
            let seed = seed_sheet as u32;
            for &cell in sheet.formulas.keys() {
                let abs = AbsCellKey::from_local(seed_sheet, cell);
                if seen_dirty.insert(abs) {
                    queue.push_back(abs);
                }
            }
            for (&cell, dependents) in &index.exact_dependents {
                if cell.sheet != seed {
                    continue;
                }
                for &dependent in dependents {
                    if affected.insert(dependent) && seen_dirty.insert(dependent) {
                        queue.push_back(dependent);
                    }
                }
            }
            for group in &index.range_groups {
                if group.range.sheet != seed {
                    continue;
                }
                for &dependent in &group.dependents {
                    if affected.insert(dependent) && seen_dirty.insert(dependent) {
                        queue.push_back(dependent);
                    }
                }
            }
        }
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

        if let Some(dependents) = index.exact_dependents.get(&cell) {
            for &dependent in dependents {
                if affected.insert(dependent) && seen_dirty.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }

        index.collect_matching_range_groups(
            cell,
            &mut range_matches,
            &mut row_matches,
            &mut range_marks,
            &mut range_stamp,
        );
        for &group in &range_matches {
            let range_group = &index.range_groups[group];
            debug_assert!(range_group.range.contains(cell));
            for &dependent in &range_group.dependents {
                if affected.insert(dependent) && seen_dirty.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }
    }

    affected
}

pub(crate) fn formula_exists(sheets: &[SheetData], key: AbsCellKey) -> bool {
    sheets
        .get(key.sheet as usize)
        .is_some_and(|sheet| sheet.formulas.contains_key(&key.local()))
}

pub(crate) fn seed_dependency_depth_errors(
    sheets: &[SheetData],
    affected: &HashSet<AbsCellKey>,
    index: &DepIndex,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
) {
    let dependencies = collect_formula_dependencies(sheets, affected, index);
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

pub(crate) fn collect_formula_dependencies(
    sheets: &[SheetData],
    affected: &HashSet<AbsCellKey>,
    index: &DepIndex,
) -> HashMap<AbsCellKey, Vec<AbsCellKey>> {
    let formula_cells: Vec<AbsCellKey> = affected
        .iter()
        .copied()
        .filter(|key| formula_exists(sheets, *key))
        .collect();
    let formula_set: HashSet<AbsCellKey> = formula_cells.iter().copied().collect();
    let mut dependencies: HashMap<AbsCellKey, Vec<AbsCellKey>> =
        HashMap::with_capacity(formula_cells.len());
    let mut seen_dependencies: HashMap<AbsCellKey, HashSet<AbsCellKey>> =
        HashMap::with_capacity(formula_cells.len());

    for &formula_cell in &formula_cells {
        dependencies.entry(formula_cell).or_default();
        seen_dependencies.entry(formula_cell).or_default();
    }

    for &formula_cell in &formula_cells {
        let Some(entry) = sheets
            .get(formula_cell.sheet as usize)
            .and_then(|sheet| sheet.formulas.get(&formula_cell.local()))
        else {
            continue;
        };

        for &cell in &entry.reads.cells {
            if formula_set.contains(&cell) {
                push_unique_dependency(
                    &mut dependencies,
                    &mut seen_dependencies,
                    formula_cell,
                    cell,
                );
            }
        }
    }

    let mut range_matches: Vec<usize> = Vec::new();
    let mut row_matches: Vec<usize> = Vec::new();
    let mut range_marks = vec![0; index.range_groups.len()];
    let mut range_stamp = 1;
    for &dependency in &formula_cells {
        index.collect_matching_range_groups(
            dependency,
            &mut range_matches,
            &mut row_matches,
            &mut range_marks,
            &mut range_stamp,
        );
        for &group in &range_matches {
            let range_group = &index.range_groups[group];
            debug_assert!(range_group.range.contains(dependency));
            for &dependent in &range_group.dependents {
                if formula_set.contains(&dependent) {
                    push_unique_dependency(
                        &mut dependencies,
                        &mut seen_dependencies,
                        dependent,
                        dependency,
                    );
                }
            }
        }
    }

    dependencies
}

pub(crate) fn push_unique_dependency(
    dependencies: &mut HashMap<AbsCellKey, Vec<AbsCellKey>>,
    seen_dependencies: &mut HashMap<AbsCellKey, HashSet<AbsCellKey>>,
    formula_cell: AbsCellKey,
    dependency: AbsCellKey,
) {
    if seen_dependencies
        .entry(formula_cell)
        .or_default()
        .insert(dependency)
    {
        dependencies
            .entry(formula_cell)
            .or_default()
            .push(dependency);
    }
}

pub(crate) fn formula_dependency_depth(
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
