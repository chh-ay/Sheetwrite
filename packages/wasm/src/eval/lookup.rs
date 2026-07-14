//! Lookup argument validation and exact/approximate matching algorithms.

use std::cmp::Ordering;

use crate::types::{FormulaError, Value};

use super::criteria::Criterion;
use super::value::{compare_values, number_from_value};

pub(super) fn integer_arg(value: &Value) -> Result<i32, FormulaError> {
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

pub(super) fn positive_index(value: &Value) -> Result<usize, FormulaError> {
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

pub(super) fn find_match_index(
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
