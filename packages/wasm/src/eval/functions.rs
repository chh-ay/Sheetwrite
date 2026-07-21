//! Generic function accumulation, dispatch, and pure aggregates.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::date::{date_parts, date_serial, parse_date_value};
use super::value::{
    aggregate_number, bool_from_value, format_basic_text, number_from_value, text_from_value,
};

#[derive(Debug, Default)]
pub(super) struct FuncAccumulator {
    values: Vec<FuncValue>,
}

#[derive(Debug)]
struct FuncValue {
    value: Value,
    from_range: bool,
}

impl FuncAccumulator {
    pub(super) fn push_scalar(&mut self, value: Value) {
        self.values.push(FuncValue {
            value,
            from_range: false,
        });
    }

    pub(super) fn push_range(&mut self, value: Value) {
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

pub(super) fn apply_func(func: Func, values: &FuncAccumulator) -> EvalResult {
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
        | Func::XLookup
        | Func::Filter
        | Func::Sort
        | Func::Unique => Value::Error(FormulaError::Value),
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

pub(super) fn treats_cell_as_reference(func: Func) -> bool {
    matches!(
        func,
        Func::Sum | Func::Avg | Func::Min | Func::Max | Func::Count | Func::CountA
    )
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
