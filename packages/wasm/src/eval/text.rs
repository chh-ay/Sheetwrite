//! Unicode code-point text functions with bounded output growth.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::date::parse_date_value;
use super::functions::{
    bool_arg, integer_arg, number_arg, require_arity, text_arg, FuncAccumulator,
};
use super::value::{format_basic_text, text_from_value};

const MAX_TEXT_OUTPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_SEARCH_STEPS: usize = 4_000_000;

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Len => unary_text(values, |text| Ok(Value::number(text.chars().count() as f64))),
        Func::Left => left_right(values, false),
        Func::Right => left_right(values, true),
        Func::Mid => mid(values),
        Func::Concat | Func::Concatenate => concat(values),
        Func::Upper => unary_text(values, |text| bounded_text(text.to_uppercase())),
        Func::Lower => unary_text(values, |text| bounded_text(text.to_lowercase())),
        Func::Trim => unary_text(values, |text| {
            let mut output = String::new();
            for (index, part) in text.split_whitespace().enumerate() {
                if index > 0 {
                    checked_push(&mut output, " ")?;
                }
                checked_push(&mut output, part)?;
            }
            Ok(Value::text(output))
        }),
        Func::Text => format_text(values),
        Func::Exact => {
            if let Err(error) = require_arity(values, 2, 2) {
                Value::Error(error)
            } else {
                match (text_arg(values, 0, None), text_arg(values, 1, None)) {
                    (Ok(left), Ok(right)) => Value::Bool(left == right),
                    (Err(error), _) | (_, Err(error)) => Value::Error(error),
                }
            }
        }
        Func::TextJoin => text_join(values),
        Func::Substitute => substitute(values),
        Func::Replace => replace(values),
        Func::Find => find_search(values, true),
        Func::Search => find_search(values, false),
        Func::Value => value(values),
        Func::Clean => unary_text(values, |text| {
            bounded_text(text.chars().filter(|ch| !matches!(*ch as u32, 0..=31)).collect())
        }),
        Func::Rept => repeat(values),
        Func::Char => character(values, false),
        Func::Code | Func::Unicode => code(values),
        Func::UniChar => character(values, true),
        Func::Proper => proper(values),
        Func::NumberValue => number_value(values),
        _ => return None,
    };
    Some(result)
}

fn unary_text(
    values: &FuncAccumulator,
    operation: impl FnOnce(String) -> Result<Value, FormulaError>,
) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    match text_arg(values, 0, None).and_then(operation) {
        Ok(value) => value,
        Err(error) => Value::Error(error),
    }
}

fn bounded_text(text: String) -> Result<Value, FormulaError> {
    if text.len() > MAX_TEXT_OUTPUT_BYTES {
        Err(FormulaError::Num)
    } else {
        Ok(Value::text(text))
    }
}

fn checked_push(output: &mut String, text: &str) -> Result<(), FormulaError> {
    let length = output
        .len()
        .checked_add(text.len())
        .filter(|length| *length <= MAX_TEXT_OUTPUT_BYTES)
        .ok_or(FormulaError::Num)?;
    output
        .try_reserve(length - output.len())
        .map_err(|_| FormulaError::Num)?;
    output.push_str(text);
    Ok(())
}

fn count_arg(values: &FuncAccumulator, index: usize, default: Option<i64>) -> Result<usize, FormulaError> {
    let count = integer_arg(values, index, default)?;
    if count < 0 {
        Err(FormulaError::Value)
    } else {
        usize::try_from(count).map_err(|_| FormulaError::Num)
    }
}

fn left_right(values: &FuncAccumulator, right: bool) -> Value {
    if let Err(error) = require_arity(values, 1, 2) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(text) => text,
        Err(error) => return Value::Error(error),
    };
    let count = match count_arg(values, 1, Some(1)) {
        Ok(count) => count,
        Err(error) => return Value::Error(error),
    };
    let length = text.chars().count();
    let output: String = if right {
        text.chars().skip(length.saturating_sub(count)).collect()
    } else {
        text.chars().take(count).collect()
    };
    Value::text(output)
}

fn mid(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 3, 3) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(text) => text,
        Err(error) => return Value::Error(error),
    };
    let start = match integer_arg(values, 1, None) {
        Ok(start) if start > 0 => start as usize,
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    let count = match count_arg(values, 2, None) {
        Ok(count) => count,
        Err(error) => return Value::Error(error),
    };
    Value::text(text.chars().skip(start - 1).take(count).collect::<String>())
}

fn concat(values: &FuncAccumulator) -> Value {
    if values.arg_count() == 0 {
        return Value::Error(FormulaError::Value);
    }
    let mut output = String::new();
    for entry in values.entries() {
        let text = match text_from_value(&entry.value) {
            Ok(text) => text,
            Err(error) => return Value::Error(error),
        };
        if let Err(error) = checked_push(&mut output, &text) {
            return Value::Error(error);
        }
    }
    Value::text(output)
}

fn format_text(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 2, 2) {
        return Value::Error(error);
    }
    let Some(value) = values.arg_value(0) else {
        return Value::Error(FormulaError::Value);
    };
    let format = match text_arg(values, 1, None) {
        Ok(format) => format,
        Err(error) => return Value::Error(error),
    };
    match format_basic_text(value, &format) {
        Ok(text) => Value::text(text),
        Err(error) => Value::Error(error),
    }
}

fn text_join(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 3, 254) {
        return Value::Error(error);
    }
    let delimiter = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let ignore_empty = match bool_arg(values, 1, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let mut output = String::new();
    let mut wrote = false;
    for entry in values.entries_from_arg(2) {
        let text = match text_from_value(&entry.value) {
            Ok(text) => text,
            Err(error) => return Value::Error(error),
        };
        if ignore_empty && text.is_empty() {
            continue;
        }
        if wrote {
            if let Err(error) = checked_push(&mut output, &delimiter) {
                return Value::Error(error);
            }
        }
        if let Err(error) = checked_push(&mut output, &text) {
            return Value::Error(error);
        }
        wrote = true;
    }
    Value::text(output)
}

fn substitute(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 3, 4) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let old = match text_arg(values, 1, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let new = match text_arg(values, 2, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    if old.is_empty() {
        return Value::text(text);
    }
    let instance = if values.arg_count() == 4 {
        match integer_arg(values, 3, None) {
            Ok(value) if value > 0 => Some(value as usize),
            Ok(_) => return Value::Error(FormulaError::Value),
            Err(error) => return Value::Error(error),
        }
    } else {
        None
    };
    let mut output = String::new();
    let mut cursor = 0;
    let mut occurrence = 0;
    for (offset, _) in text.match_indices(&old) {
        occurrence += 1;
        if instance.is_none_or(|wanted| wanted == occurrence) {
            if let Err(error) = checked_push(&mut output, &text[cursor..offset])
                .and_then(|_| checked_push(&mut output, &new))
            {
                return Value::Error(error);
            }
            cursor = offset + old.len();
            if instance.is_some() {
                break;
            }
        }
    }
    if let Err(error) = checked_push(&mut output, &text[cursor..]) {
        return Value::Error(error);
    }
    Value::text(output)
}

fn replace(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 4, 4) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let start = match integer_arg(values, 1, None) {
        Ok(value) if value > 0 => value as usize,
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    let count = match count_arg(values, 2, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let replacement = match text_arg(values, 3, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let mut chars: Vec<char> = text.chars().collect();
    if start > chars.len() + 1 {
        return Value::Error(FormulaError::Value);
    }
    let end = (start - 1).saturating_add(count).min(chars.len());
    chars.splice(start - 1..end, replacement.chars());
    bounded_text(chars.into_iter().collect()).unwrap_or_else(Value::Error)
}

fn find_search(values: &FuncAccumulator, case_sensitive: bool) -> Value {
    if let Err(error) = require_arity(values, 2, 3) {
        return Value::Error(error);
    }
    let needle = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let haystack = match text_arg(values, 1, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let start = match integer_arg(values, 2, Some(1)) {
        Ok(value) if value > 0 => value as usize,
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    let haystack: Vec<char> = if case_sensitive {
        haystack.chars().collect()
    } else {
        haystack.chars().flat_map(char::to_lowercase).collect()
    };
    let needle: Vec<char> = if case_sensitive {
        needle.chars().collect()
    } else {
        needle.chars().flat_map(char::to_lowercase).collect()
    };
    if start > haystack.len() + 1 {
        return Value::Error(FormulaError::Value);
    }
    let found = if case_sensitive {
        literal_find(&haystack, &needle, start - 1)
    } else {
        wildcard_find(&haystack, &needle, start - 1)
    };
    match found {
        Ok(Some(index)) => Value::number((index + 1) as f64),
        Ok(None) => Value::Error(FormulaError::Value),
        Err(error) => Value::Error(error),
    }
}

fn literal_find(haystack: &[char], needle: &[char], start: usize) -> Result<Option<usize>, FormulaError> {
    if needle.is_empty() {
        return Ok(Some(start));
    }
    let steps = haystack.len().saturating_mul(needle.len());
    if steps > MAX_SEARCH_STEPS {
        return Err(FormulaError::Num);
    }
    Ok((start..=haystack.len().saturating_sub(needle.len()))
        .find(|&index| haystack[index..index + needle.len()] == *needle))
}

fn wildcard_find(haystack: &[char], pattern: &[char], start: usize) -> Result<Option<usize>, FormulaError> {
    let mut steps = 0usize;
    for candidate in start..=haystack.len() {
        if wildcard_prefix(&haystack[candidate..], pattern, &mut steps)? {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

fn wildcard_prefix(text: &[char], pattern: &[char], steps: &mut usize) -> Result<bool, FormulaError> {
    let (mut text_index, mut pattern_index) = (0usize, 0usize);
    let (mut star, mut retry_text) = (None, 0usize);
    while text_index < text.len() {
        *steps = steps.checked_add(1).ok_or(FormulaError::Num)?;
        if *steps > MAX_SEARCH_STEPS {
            return Err(FormulaError::Num);
        }
        if pattern.get(pattern_index) == Some(&'~') {
            if let Some(literal) = pattern.get(pattern_index + 1) {
                if text[text_index] == *literal {
                    text_index += 1;
                    pattern_index += 2;
                    continue;
                }
            }
        } else if matches!(pattern.get(pattern_index), Some('?'))
            || pattern.get(pattern_index) == text.get(text_index)
        {
            text_index += 1;
            pattern_index += 1;
            continue;
        } else if matches!(pattern.get(pattern_index), Some('*')) {
            star = Some(pattern_index);
            pattern_index += 1;
            retry_text = text_index;
            continue;
        }
        if let Some(star_index) = star {
            retry_text += 1;
            text_index = retry_text;
            pattern_index = star_index + 1;
        } else {
            return Ok(false);
        }
    }
    while matches!(pattern.get(pattern_index), Some('*')) {
        pattern_index += 1;
    }
    Ok(pattern_index == pattern.len())
}

fn value(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    if let Some(serial) = parse_date_value(&text) {
        return Value::number(serial);
    }
    parse_number(&text, ".", ",").map_or_else(Value::Error, Value::number)
}

fn repeat(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 2, 2) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let count = match count_arg(values, 1, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let length = match text.len().checked_mul(count) {
        Some(length) if length <= MAX_TEXT_OUTPUT_BYTES => length,
        _ => return Value::Error(FormulaError::Num),
    };
    let mut output = String::new();
    if output.try_reserve_exact(length).is_err() {
        return Value::Error(FormulaError::Num);
    }
    for _ in 0..count {
        output.push_str(&text);
    }
    Value::text(output)
}

fn character(values: &FuncAccumulator, unicode: bool) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    let code = match integer_arg(values, 0, None) {
        Ok(code) => code,
        Err(error) => return Value::Error(error),
    };
    if (!unicode && !(1..=255).contains(&code)) || (unicode && code <= 0) {
        return Value::Error(FormulaError::Value);
    }
    match u32::try_from(code).ok().and_then(char::from_u32) {
        Some(character) => Value::text(character.to_string()),
        None => Value::Error(FormulaError::Value),
    }
}

fn code(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    match text_arg(values, 0, None) {
        Ok(text) => text
            .chars()
            .next()
            .map_or(Value::Error(FormulaError::Value), |ch| Value::number(ch as u32 as f64)),
        Err(error) => Value::Error(error),
    }
}

fn proper(values: &FuncAccumulator) -> Value {
    unary_text(values, |text| {
        let mut begins_word = true;
        let mut output = String::new();
        for character in text.chars() {
            let transformed = if begins_word {
                character.to_uppercase().collect::<String>()
            } else {
                character.to_lowercase().collect::<String>()
            };
            checked_push(&mut output, &transformed)?;
            begins_word = !character.is_alphanumeric();
        }
        Ok(Value::text(output))
    })
}

fn number_value(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 3) {
        return Value::Error(error);
    }
    let text = match text_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let decimal = match text_arg(values, 1, Some(".")) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let group = match text_arg(values, 2, Some(",")) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    parse_number(&text, &decimal, &group).map_or_else(Value::Error, Value::number)
}

fn parse_number(text: &str, decimal: &str, group: &str) -> Result<f64, FormulaError> {
    if decimal.is_empty() || decimal == group || decimal.chars().count() != 1 || group.chars().count() > 1 {
        return Err(FormulaError::Value);
    }
    let mut source = text.trim().to_string();
    let mut percent = 1.0;
    while source.ends_with('%') {
        source.pop();
        source = source.trim_end().to_string();
        percent *= 0.01;
    }
    if source.contains('%') {
        return Err(FormulaError::Value);
    }
    let mut normalized = String::new();
    let mut decimal_seen = false;
    for character in source.chars() {
        if !group.is_empty() && group.contains(character) {
            if decimal_seen {
                return Err(FormulaError::Value);
            }
            continue;
        }
        if decimal.contains(character) {
            if decimal_seen {
                return Err(FormulaError::Value);
            }
            decimal_seen = true;
            normalized.push('.');
        } else if !character.is_whitespace() {
            normalized.push(character);
        }
    }
    let value = normalized
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .ok_or(FormulaError::Value)?;
    let result = value * percent;
    result.is_finite().then_some(result).ok_or(FormulaError::Num)
}
