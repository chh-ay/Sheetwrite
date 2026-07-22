//! Shared bounded argument accumulation and thin scalar-family dispatch.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::{date, financial, math, statistics, text};
use super::value::{aggregate_number, bool_from_value};

#[derive(Debug)]
pub(super) struct FuncValue {
    pub(super) value: Value,
    pub(super) from_range: bool,
}

#[derive(Debug, Default)]
pub(super) struct FuncAccumulator {
    values: Vec<FuncValue>,
    arg_ends: Vec<usize>,
}

impl FuncAccumulator {
    pub(super) fn push_scalar(&mut self, value: Value) {
        self.values.push(FuncValue { value, from_range: false });
    }

    pub(super) fn push_range(&mut self, value: Value) {
        self.values.push(FuncValue { value, from_range: true });
    }

    pub(super) fn finish_arg(&mut self) {
        self.arg_ends.push(self.values.len());
    }

    pub(super) fn len(&self) -> usize {
        self.values.len()
    }

    pub(super) fn arg_count(&self) -> usize {
        self.arg_ends.len()
    }

    pub(super) fn value(&self, index: usize) -> Option<&Value> {
        self.values.get(index).map(|entry| &entry.value)
    }

    pub(super) fn entries(&self) -> &[FuncValue] {
        &self.values
    }

    pub(super) fn arg(&self, index: usize) -> Option<&[FuncValue]> {
        let end = *self.arg_ends.get(index)?;
        let start = if index == 0 { 0 } else { self.arg_ends[index - 1] };
        Some(&self.values[start..end])
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
        Func::CountA => Value::number(values.len() as f64),
        Func::Sum => aggregate_numbers(values).map_or_else(Value::Error, |s| Value::number(s.sum)),
        Func::Avg => aggregate_numbers(values).map_or_else(Value::Error, |s| {
            if s.count == 0 { Value::Error(FormulaError::DivZero) } else { Value::number(s.sum / s.count as f64) }
        }),
        Func::Min => aggregate_numbers(values).map_or_else(Value::Error, |s| Value::number(if s.count == 0 { 0.0 } else { s.min })),
        Func::Max => aggregate_numbers(values).map_or_else(Value::Error, |s| Value::number(if s.count == 0 { 0.0 } else { s.max })),
        Func::True if values.arg_count() == 0 => Value::Bool(true),
        Func::False if values.arg_count() == 0 => Value::Bool(false),
        Func::And | Func::Or | Func::Xor => logical_reduce(func, values),
        Func::Not if values.arg_count() == 1 => match bool_from_value(values.value(0).unwrap_or(&Value::Blank)) {
            Ok(value) => Value::Bool(!value),
            Err(error) => Value::Error(error),
        },
        Func::Na if values.arg_count() == 0 => Value::Error(FormulaError::Na),
        _ => Value::Error(FormulaError::Value),
    }
}

fn logical_reduce(func: Func, values: &FuncAccumulator) -> Value {
    if values.len() == 0 {
        return Value::Error(FormulaError::Value);
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
    Value::Bool(if func == Func::And { true } else if func == Func::Or { any } else { parity })
}

fn aggregate_numbers(values: &FuncAccumulator) -> Result<NumericAggregate, FormulaError> {
    let mut out = NumericAggregate { count: 0, sum: 0.0, min: f64::INFINITY, max: f64::NEG_INFINITY };
    for entry in values.entries() {
        if let Some(value) = aggregate_number(&entry.value, entry.from_range)? {
            out.count += 1;
            out.sum += value;
            out.min = out.min.min(value);
            out.max = out.max.max(value);
        }
    }
    if out.sum.is_finite() { Ok(out) } else { Err(FormulaError::Num) }
}

fn count_numeric(values: &FuncAccumulator) -> u64 {
    values.entries().iter().filter(|entry| matches!(entry.value, Value::Number(_))).count() as u64
}

pub(super) fn treats_cell_as_reference(func: Func) -> bool {
    matches!(func, Func::Sum | Func::Avg | Func::Min | Func::Max | Func::Count | Func::CountA
        | Func::Product | Func::Median | Func::ModeSngl | Func::StdevS | Func::StdevP
        | Func::VarS | Func::VarP | Func::GeoMean | Func::CountBlank)
}
