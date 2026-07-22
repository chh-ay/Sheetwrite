//! Shared bounded argument accumulation and thin scalar-family dispatch.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};

use super::{date, financial, math, statistics, text};
use super::value::{aggregate_number, bool_from_value, number_from_value, text_from_value};

const MAX_FUNCTION_ARGS: usize = 254;

#[derive(Debug)]
pub(super) struct FuncValue {
    pub(super) value: Value,
    pub(super) from_range: bool,
}

#[derive(Clone, Copy, Debug, Default)]
struct FuncArg {
    end: u32,
    rows: u32,
    cols: u32,
}

#[derive(Debug)]
pub(super) struct FuncAccumulator {
    values: Vec<FuncValue>,
    args: [FuncArg; MAX_FUNCTION_ARGS],
    arg_count: usize,
}

impl Default for FuncAccumulator {
    fn default() -> Self {
        Self {
            values: Vec::new(),
            args: [FuncArg::default(); MAX_FUNCTION_ARGS],
            arg_count: 0,
        }
    }
}

impl FuncAccumulator {
    pub(super) fn push_scalar(&mut self, value: Value) -> Result<(), FormulaError> {
        self.push(value, false)
    }

    pub(super) fn push_range(&mut self, value: Value) -> Result<(), FormulaError> {
        self.push(value, true)
    }

    fn push(&mut self, value: Value, from_range: bool) -> Result<(), FormulaError> {
        if self.values.len() >= RANGE_CELL_LIMIT as usize {
            return Err(FormulaError::Num);
        }
        self.values
            .try_reserve(1)
            .map_err(|_| FormulaError::Num)?;
        self.values.push(FuncValue { value, from_range });
        Ok(())
    }


    pub(super) fn finish_arg(
        &mut self,
        rows: usize,
        cols: usize,
    ) -> Result<(), FormulaError> {
        if self.arg_count >= MAX_FUNCTION_ARGS || rows == 0 || cols == 0 {
            return Err(FormulaError::Value);
        }
        let cells = rows.checked_mul(cols).ok_or(FormulaError::Num)?;
        let start = if self.arg_count == 0 {
            0
        } else {
            self.args[self.arg_count - 1].end as usize
        };
        if cells != self.values.len().saturating_sub(start) {
            return Err(FormulaError::Value);
        }
        self.args[self.arg_count] = FuncArg {
            end: u32::try_from(self.values.len()).map_err(|_| FormulaError::Num)?,
            rows: u32::try_from(rows).map_err(|_| FormulaError::Num)?,
            cols: u32::try_from(cols).map_err(|_| FormulaError::Num)?,
        };
        self.arg_count += 1;
        Ok(())
    }

    pub(super) fn len(&self) -> usize {
        self.values.len()
    }

    pub(super) fn arg_count(&self) -> usize {
        self.arg_count
    }

    pub(super) fn entries(&self) -> &[FuncValue] {
        &self.values
    }

    pub(super) fn arg(&self, index: usize) -> Option<&[FuncValue]> {
        if index >= self.arg_count {
            return None;
        }
        let argument = self.args[index];
        let start = if index == 0 {
            0
        } else {
            self.args[index - 1].end as usize
        };
        Some(&self.values[start..argument.end as usize])
    }

    pub(super) fn arg_shape(&self, index: usize) -> Option<(usize, usize)> {
        (index < self.arg_count).then(|| {
            let argument = self.args[index];
            (argument.rows as usize, argument.cols as usize)
        })
    }

    pub(super) fn arg_value(&self, index: usize) -> Option<&Value> {
        self.arg(index)?.first().map(|entry| &entry.value)
    }

    pub(super) fn entries_from_arg(&self, index: usize) -> &[FuncValue] {
        let start = if index == 0 {
            0
        } else if index <= self.arg_count {
            self.args[index - 1].end as usize
        } else {
            self.values.len()
        };
        &self.values[start..]
    }
}

#[derive(Clone, Copy)]
struct NumericAggregate {
    count: u64,
    sum: f64,
    min: f64,
    max: f64,
}

pub(super) fn apply_func(func: Func, values: &FuncAccumulator) -> EvalResult {
    if let Some(result) = math::apply(func, values) {
        return result;
    }
    if let Some(result) = text::apply(func, values) {
        return result;
    }
    if let Some(result) = date::apply(func, values) {
        return result;
    }
    if let Some(result) = statistics::apply(func, values) {
        return result;
    }
    if let Some(result) = financial::apply(func, values) {
        return result;
    }

    match func {
        Func::Count => Value::number(count_numeric(values) as f64),
        Func::CountA => Value::number(
            values
                .entries()
                .iter()
                .filter(|entry| !matches!(entry.value, Value::Blank))
                .count() as f64,
        ),
        Func::Sum => aggregate_numbers(values).map_or_else(Value::Error, |s| Value::number(s.sum)),
        Func::Avg => aggregate_numbers(values).map_or_else(Value::Error, |s| {
            if s.count == 0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number(s.sum / s.count as f64)
            }
        }),
        Func::Min => aggregate_numbers(values).map_or_else(Value::Error, |s| {
            Value::number(if s.count == 0 { 0.0 } else { s.min })
        }),
        Func::Max => aggregate_numbers(values).map_or_else(Value::Error, |s| {
            Value::number(if s.count == 0 { 0.0 } else { s.max })
        }),
        Func::True if values.arg_count() == 0 => Value::Bool(true),
        Func::False if values.arg_count() == 0 => Value::Bool(false),
        Func::And | Func::Or | Func::Xor => logical_reduce(func, values),
        Func::Not if values.arg_count() == 1 => match bool_from_value(
            values.arg_value(0).unwrap_or(&Value::Blank),
        ) {
            Ok(value) => Value::Bool(!value),
            Err(error) => Value::Error(error),
        },
        Func::Na if values.arg_count() == 0 => Value::Error(FormulaError::Na),
        _ => Value::Error(FormulaError::Value),
    }
}

fn logical_reduce(func: Func, values: &FuncAccumulator) -> Value {
    if values.len() == 0 {
        return match func {
            Func::And => Value::Bool(true),
            Func::Or => Value::Bool(false),
            _ => Value::Error(FormulaError::Value),
        };
    }
    let mut any = false;
    let mut parity = false;
    for entry in values.entries() {
        match bool_from_value(&entry.value) {
            Ok(value) => {
                any |= value;
                parity ^= value;
                if (func == Func::And && !value) || (func == Func::Or && value) {
                    return Value::Bool(value);
                }
            }
            Err(error) => return Value::Error(error),
        }
    }
    Value::Bool(if func == Func::And {
        true
    } else if func == Func::Or {
        any
    } else {
        parity
    })
}

fn aggregate_numbers(values: &FuncAccumulator) -> Result<NumericAggregate, FormulaError> {
    let mut out = NumericAggregate {
        count: 0,
        sum: 0.0,
        min: f64::INFINITY,
        max: f64::NEG_INFINITY,
    };
    for entry in values.entries() {
        if let Some(value) = aggregate_number(&entry.value, entry.from_range)? {
            out.count += 1;
            out.sum += value;
            out.min = out.min.min(value);
            out.max = out.max.max(value);
        }
    }
    if out.sum.is_finite() {
        Ok(out)
    } else {
        Err(FormulaError::Num)
    }
}

fn count_numeric(values: &FuncAccumulator) -> u64 {
    values
        .entries()
        .iter()
        .filter(|entry| matches!(entry.value, Value::Number(value) if value.is_finite()))
        .count() as u64
}

pub(super) fn require_arity(
    values: &FuncAccumulator,
    minimum: usize,
    maximum: usize,
) -> Result<(), FormulaError> {
    if (minimum..=maximum).contains(&values.arg_count()) {
        Ok(())
    } else {
        Err(FormulaError::Value)
    }
}

pub(super) fn number_arg(
    values: &FuncAccumulator,
    index: usize,
    default: Option<f64>,
) -> Result<f64, FormulaError> {
    match values.arg_value(index) {
        Some(value) => number_from_value(value),
        None => default.ok_or(FormulaError::Value),
    }
}

pub(super) fn integer_arg(
    values: &FuncAccumulator,
    index: usize,
    default: Option<i64>,
) -> Result<i64, FormulaError> {
    let number = match values.arg_value(index) {
        Some(value) => number_from_value(value)?,
        None => return default.ok_or(FormulaError::Value),
    };
    if !number.is_finite() || number < i64::MIN as f64 || number > i64::MAX as f64 {
        return Err(FormulaError::Num);
    }
    Ok(number.trunc() as i64)
}

pub(super) fn bool_arg(
    values: &FuncAccumulator,
    index: usize,
    default: Option<bool>,
) -> Result<bool, FormulaError> {
    match values.arg_value(index) {
        Some(value) => bool_from_value(value),
        None => default.ok_or(FormulaError::Value),
    }
}

pub(super) fn text_arg(
    values: &FuncAccumulator,
    index: usize,
    default: Option<&str>,
) -> Result<String, FormulaError> {
    match values.arg_value(index) {
        Some(value) => text_from_value(value),
        None => default
            .map(str::to_string)
            .ok_or(FormulaError::Value),
    }
}

pub(super) fn numeric_entries<'a>(
    entries: impl IntoIterator<Item = &'a FuncValue>,
) -> Result<Vec<f64>, FormulaError> {
    let iter = entries.into_iter();
    let mut numbers = Vec::new();
    let (_, upper) = iter.size_hint();
    if let Some(upper) = upper {
        numbers.try_reserve(upper).map_err(|_| FormulaError::Num)?;
    }
    for entry in iter {
        if let Some(number) = aggregate_number(&entry.value, entry.from_range)? {
            numbers.push(number);
        }
    }
    Ok(numbers)
}

pub(super) fn treats_cell_as_reference(func: Func) -> bool {
    matches!(
        func,
        Func::Sum
            | Func::Avg
            | Func::Min
            | Func::Max
            | Func::Count
            | Func::CountA
            | Func::Product
            | Func::Median
            | Func::ModeSngl
            | Func::StdevS
            | Func::StdevP
            | Func::VarS
            | Func::VarP
            | Func::GeoMean
            | Func::CountBlank
            | Func::Npv
            | Func::Irr
    )
}
