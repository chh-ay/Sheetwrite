//! Cached formula values, coercion, comparison, aggregation, and text formatting.

use std::cmp::Ordering;

use crate::sheet::SheetData;
use crate::types::{
    string_from_pool_ref, FormulaEntry, FormulaError, FormulaValueKind, StringPool, Value,
};

use super::date::format_date_serial;

pub(super) fn cached_formula_value(
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

fn bool_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

pub(super) fn number_from_value(value: &Value) -> Result<f64, FormulaError> {
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

pub(super) fn bool_from_value(value: &Value) -> Result<bool, FormulaError> {
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

pub(super) fn text_from_value(value: &Value) -> Result<String, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(value.to_string()),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Text(text) => Ok(text.to_string()),
        Value::Bool(value) => Ok(bool_text(*value).to_string()),
        Value::Error(error) => Err(*error),
        Value::Blank => Ok(String::new()),
    }
}

pub(super) fn compare_values(left: &Value, right: &Value) -> Result<Ordering, FormulaError> {
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

fn value_rank(value: &Value) -> u8 {
    match value {
        Value::Blank => 0,
        Value::Number(_) => 1,
        Value::Text(_) => 2,
        Value::Bool(_) => 3,
        Value::Error(_) => 4,
    }
}

pub(super) fn aggregate_number(
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

pub(super) fn format_basic_text(value: &Value, format: &str) -> Result<String, FormulaError> {
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
