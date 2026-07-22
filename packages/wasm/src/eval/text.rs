//! Unicode code-point text functions with bounded output growth.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::date::parse_date_value;
use super::functions::{
    bool_arg, integer_arg, require_arity, text_arg, FuncAccumulator,
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
        Func::Upper => unary_text(values, |text| change_case(text, true)),
        Func::Lower => unary_text(values, |text| change_case(text, false)),
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
        Func::Clean => unary_text(values, clean_text),
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

fn checked_push_character(output: &mut String, character: char) -> Result<(), FormulaError> {
    let additional = character.len_utf8();
    output
        .len()
        .checked_add(additional)
        .filter(|length| *length <= MAX_TEXT_OUTPUT_BYTES)
        .ok_or(FormulaError::Num)?;
    output.try_reserve(additional).map_err(|_| FormulaError::Num)?;
    output.push(character);
    Ok(())
}

fn change_case(text: String, uppercase: bool) -> Result<Value, FormulaError> {
    let mut output = String::new();
    output
        .try_reserve(text.len().min(MAX_TEXT_OUTPUT_BYTES))
        .map_err(|_| FormulaError::Num)?;
    for character in text.chars() {
        if uppercase {
            for transformed in character.to_uppercase() {
                checked_push_character(&mut output, transformed)?;
            }
        } else {
            for transformed in character.to_lowercase() {
                checked_push_character(&mut output, transformed)?;
            }
        }
    }
    Ok(Value::text(output))
}

fn clean_text(text: String) -> Result<Value, FormulaError> {
    let mut output = String::new();
    output
        .try_reserve(text.len().min(MAX_TEXT_OUTPUT_BYTES))
        .map_err(|_| FormulaError::Num)?;
    for character in text.chars() {
        if !matches!(character as u32, 0..=31) {
            checked_push_character(&mut output, character)?;
        }
    }
    Ok(Value::text(output))
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
    let start = if right {
        length.saturating_sub(count)
    } else {
        0
    };
    slice_text(&text, start, count).unwrap_or_else(Value::Error)
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
        Ok(start) if start > 0 => match usize::try_from(start - 1) {
            Ok(start) => start,
            Err(_) => return Value::Error(FormulaError::Value),
        },
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    let count = match count_arg(values, 2, None) {
        Ok(count) => count,
        Err(error) => return Value::Error(error),
    };
    slice_text(&text, start, count).unwrap_or_else(Value::Error)
}

fn slice_text(text: &str, start: usize, count: usize) -> Result<Value, FormulaError> {
    let mut output = String::new();
    for character in text.chars().skip(start).take(count) {
        checked_push_character(&mut output, character)?;
    }
    bounded_text(output)
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
        return bounded_text(text).unwrap_or_else(Value::Error);
    }
    let instance = if values.arg_count() == 4 {
        match integer_arg(values, 3, None) {
            Ok(value) if value > 0 => match usize::try_from(value) {
                Ok(value) => Some(value),
                Err(_) => return Value::Error(FormulaError::Value),
            },
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
        Ok(value) if value > 0 => match usize::try_from(value - 1) {
            Ok(value) => value,
            Err(_) => return Value::Error(FormulaError::Value),
        },
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
    let Some(start_byte) = code_point_byte_offset(&text, start) else {
        return Value::Error(FormulaError::Value);
    };
    let end_byte = code_point_byte_offset(&text[start_byte..], count)
        .map(|offset| start_byte + offset)
        .unwrap_or(text.len());
    let mut output = String::new();
    if let Err(error) = checked_push(&mut output, &text[..start_byte])
        .and_then(|_| checked_push(&mut output, &replacement))
        .and_then(|_| checked_push(&mut output, &text[end_byte..]))
    {
        return Value::Error(error);
    }
    Value::text(output)
}

fn code_point_byte_offset(text: &str, index: usize) -> Option<usize> {
    if index == 0 {
        return Some(0);
    }
    let mut seen = 0usize;
    for (offset, _) in text.char_indices() {
        if seen == index {
            return Some(offset);
        }
        seen += 1;
    }
    (seen == index).then_some(text.len())
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
        Ok(value) if value > 0 => match usize::try_from(value - 1) {
            Ok(value) => value,
            Err(_) => return Value::Error(FormulaError::Value),
        },
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    let haystack = match collect_code_points(&haystack) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let needle = match collect_code_points(&needle) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    if start > haystack.len() {
        return Value::Error(FormulaError::Value);
    }
    let found = if case_sensitive {
        literal_find(&haystack, &needle, start)
    } else {
        wildcard_find(&haystack, &needle, start)
    };
    match found {
        Ok(Some(index)) => Value::number((index + 1) as f64),
        Ok(None) => Value::Error(FormulaError::Value),
        Err(error) => Value::Error(error),
    }
}

fn collect_code_points(text: &str) -> Result<Vec<char>, FormulaError> {
    if text.len() > MAX_TEXT_OUTPUT_BYTES {
        return Err(FormulaError::Num);
    }
    let count = text.chars().count();
    let mut characters = Vec::new();
    characters.try_reserve_exact(count).map_err(|_| FormulaError::Num)?;
    characters.extend(text.chars());
    Ok(characters)
}

fn literal_find(haystack: &[char], needle: &[char], start: usize) -> Result<Option<usize>, FormulaError> {
    if needle.is_empty() {
        return Ok(Some(start));
    }
    let available = haystack.len().saturating_sub(start);
    if needle.len() > available {
        return Ok(None);
    }
    let steps = available.saturating_mul(needle.len());
    if steps > MAX_SEARCH_STEPS {
        return Err(FormulaError::Num);
    }
    Ok((start..=haystack.len() - needle.len())
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
    let mut star: Option<(usize, usize)> = None;
    loop {
        *steps = steps.checked_add(1).ok_or(FormulaError::Num)?;
        if *steps > MAX_SEARCH_STEPS {
            return Err(FormulaError::Num);
        }
        if pattern_index == pattern.len() {
            return Ok(true);
        }

        let pattern_character = pattern[pattern_index];
        if pattern_character == '*' {
            pattern_index += 1;
            star = Some((pattern_index, text_index));
            continue;
        }

        let (literal, next_pattern) = if pattern_character == '~'
            && matches!(pattern.get(pattern_index + 1), Some('~' | '*' | '?'))
        {
            (Some(pattern[pattern_index + 1]), pattern_index + 2)
        } else if pattern_character == '?' {
            (None, pattern_index + 1)
        } else {
            (Some(pattern_character), pattern_index + 1)
        };
        let matched = text.get(text_index).is_some_and(|character| {
            literal.is_none_or(|literal| characters_equal_ignore_case(*character, literal))
        });
        if matched {
            text_index += 1;
            pattern_index = next_pattern;
            continue;
        }

        if let Some((retry_pattern, retry_text)) = star {
            if retry_text < text.len() {
                let retry_text = retry_text + 1;
                text_index = retry_text;
                pattern_index = retry_pattern;
                star = Some((retry_pattern, retry_text));
                continue;
            }
        }
        return Ok(false);
    }
}

fn characters_equal_ignore_case(left: char, right: char) -> bool {
    left == right
        || left.to_lowercase().eq(right.to_lowercase())
        || left.to_uppercase().eq(right.to_uppercase())
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
    let count = match integer_arg(values, 1, None) {
        Ok(value) if value >= 0 => value,
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    if text.is_empty() || count == 0 {
        return Value::text("");
    }
    let count = match usize::try_from(count) {
        Ok(value) => value,
        Err(_) => return Value::Error(FormulaError::Num),
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
        output.try_reserve(text.len().min(MAX_TEXT_OUTPUT_BYTES)).map_err(|_| FormulaError::Num)?;
        for character in text.chars() {
            if begins_word {
                for transformed in character.to_uppercase() {
                    checked_push_character(&mut output, transformed)?;
                }
            } else {
                for transformed in character.to_lowercase() {
                    checked_push_character(&mut output, transformed)?;
                }
            }
            begins_word = !character.is_alphabetic();
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
    if text.len() > MAX_TEXT_OUTPUT_BYTES {
        return Err(FormulaError::Num);
    }
    if decimal.is_empty()
        || decimal.len() > 4
        || group.len() > 4
        || decimal == group
        || decimal.chars().count() != 1
        || group.chars().count() > 1
    {
        return Err(FormulaError::Value);
    }
    let decimal = decimal.chars().next().expect("validated decimal separator");
    let group = group.chars().next();
    let mut source = text.trim();
    let mut percent = 1.0;
    while let Some(prefix) = source.strip_suffix('%') {
        source = prefix.trim_end();
        percent *= 0.01;
    }

    let mut normalized = String::new();
    normalized.try_reserve(source.len()).map_err(|_| FormulaError::Num)?;
    let mut decimal_seen = false;
    for character in source.chars() {
        if group == Some(character) {
            if decimal_seen {
                return Err(FormulaError::Value);
            }
            continue;
        }
        if character == decimal {
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

#[cfg(test)]
mod tests {
    use super::{
        apply, clean_text, literal_find, slice_text, MAX_SEARCH_STEPS, MAX_TEXT_OUTPUT_BYTES,
    };
    use crate::calc::Func;
    use crate::types::{FormulaError, Value};

    use super::super::functions::FuncAccumulator;

    fn accumulator(arguments: Vec<(bool, Vec<Value>)>) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for (from_range, argument) in arguments {
            let cells = argument.len();
            for value in argument {
                if from_range {
                    values.push_range(value).unwrap();
                } else {
                    values.push_scalar(value).unwrap();
                }
            }
            values.finish_arg(cells, 1).unwrap();
        }
        values
    }

    fn evaluate(func: Func, arguments: Vec<Value>) -> Value {
        let arguments = arguments
            .into_iter()
            .map(|value| (false, vec![value]))
            .collect();
        apply(func, &accumulator(arguments)).unwrap()
    }

    fn assert_number(value: Value, expected: f64) {
        let Value::Number(actual) = value else {
            panic!("expected number {expected}, got {value:?}");
        };
        let tolerance = expected.abs().max(1.0) * 1e-12;
        assert!((actual - expected).abs() <= tolerance, "{actual} != {expected}");
    }

    #[test]
    fn text_join_flattens_values_with_shared_coercion() {
        let values = accumulator(vec![
            (false, vec![Value::text("|")]),
            (false, vec![Value::Bool(true)]),
            (
                true,
                vec![Value::text("a"), Value::Blank, Value::Bool(true), Value::number(2.0)],
            ),
        ]);
        assert_eq!(apply(Func::TextJoin, &values).unwrap(), Value::text("a|TRUE|2"));

        let error = accumulator(vec![
            (false, vec![Value::text(",")]),
            (false, vec![Value::Bool(false)]),
            (true, vec![Value::Error(FormulaError::Ref)]),
        ]);
        assert_eq!(
            apply(Func::TextJoin, &error).unwrap(),
            Value::Error(FormulaError::Ref)
        );
    }

    #[test]
    fn substitute_and_replace_use_code_point_positions() {
        assert_eq!(
            evaluate(
                Func::Substitute,
                vec![
                    Value::text("😀a😀a"),
                    Value::text("😀"),
                    Value::text("é"),
                    Value::number(2.0),
                ],
            ),
            Value::text("😀aéa")
        );
        assert_eq!(
            evaluate(
                Func::Replace,
                vec![
                    Value::text("a😀ç"),
                    Value::number(2.0),
                    Value::number(1.0),
                    Value::text("ZZ"),
                ],
            ),
            Value::text("aZZç")
        );
        assert_eq!(
            evaluate(
                Func::Replace,
                vec![
                    Value::text("a😀ç"),
                    Value::number(4.0),
                    Value::number(99.0),
                    Value::text("!"),
                ],
            ),
            Value::text("a😀ç!")
        );
        assert_eq!(
            evaluate(
                Func::Replace,
                vec![
                    Value::text("abc"),
                    Value::number(5.0),
                    Value::number(1.0),
                    Value::text("x"),
                ],
            ),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(
                Func::Substitute,
                vec![Value::text("abc"), Value::text(""), Value::text("x")],
            ),
            Value::text("abc")
        );
        assert_eq!(
            evaluate(
                Func::Substitute,
                vec![
                    Value::text("abc"),
                    Value::text("a"),
                    Value::text("x"),
                    Value::number(0.0),
                ],
            ),
            Value::Error(FormulaError::Value)
        );
    }

    #[test]
    fn find_and_search_cover_unicode_wildcards_and_prefix_matches() {
        assert_number(
            evaluate(Func::Find, vec![Value::text("😀"), Value::text("é😀z")]),
            2.0,
        );
        assert_number(
            evaluate(Func::Search, vec![Value::text("BAR"), Value::text("xxBarista")]),
            3.0,
        );
        assert_number(
            evaluate(Func::Search, vec![Value::text("a?c"), Value::text("--A😀C--")]),
            3.0,
        );
        assert_number(
            evaluate(Func::Search, vec![Value::text("~*"), Value::text("a*b")]),
            2.0,
        );
        assert_eq!(
            evaluate(
                Func::Find,
                vec![Value::text("a"), Value::text("abc"), Value::number(5.0)],
            ),
            Value::Error(FormulaError::Value)
        );
        assert_number(
            evaluate(Func::Search, vec![Value::text("b*r"), Value::text("xxBarista")]),
            3.0,
        );
        assert_number(
            evaluate(
                Func::Find,
                vec![Value::text(""), Value::text("abc"), Value::number(4.0)],
            ),
            4.0,
        );
        assert_eq!(
            evaluate(Func::Find, vec![Value::text("bar"), Value::text("Bar")]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(Func::Find, vec![Value::text("abcdef"), Value::text("abc")]),
            Value::Error(FormulaError::Value)
        );
    }

    #[test]
    fn search_work_is_bounded_before_quadratic_scans() {
        let haystack = vec!['a'; 2_001];
        let needle = vec!['b'; 2_000];
        assert_eq!(
            literal_find(&haystack, &needle, 0),
            Err(FormulaError::Num)
        );
        assert_eq!(MAX_SEARCH_STEPS, 4_000_000);
    }

    #[test]
    fn value_and_numbervalue_are_locale_neutral_and_strict() {
        assert_number(
            evaluate(Func::Value, vec![Value::text("1,234.5%")]),
            12.345,
        );
        assert_number(
            evaluate(
                Func::NumberValue,
                vec![Value::text(" 1.234,5 %% "), Value::text(","), Value::text(".")],
            ),
            0.12345,
        );
        assert_number(
            evaluate(
                Func::NumberValue,
                vec![Value::text("1 234,5"), Value::text(","), Value::text(" ")],
            ),
            1234.5,
        );
        assert_eq!(
            evaluate(
                Func::NumberValue,
                vec![Value::text("1,2,3"), Value::text(","), Value::text(".")],
            ),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(
                Func::NumberValue,
                vec![Value::text("1.2"), Value::text("."), Value::text(".")],
            ),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(
                Func::NumberValue,
                vec![Value::text("1,2.3"), Value::text(","), Value::text(".")],
            ),
            Value::Error(FormulaError::Value)
        );
    }

    #[test]
    fn clean_repeat_and_character_functions_enforce_boundaries() {
        assert_eq!(
            evaluate(Func::Clean, vec![Value::text("a\u{0}b\u{1f}c\u{7f}")]),
            Value::text("abc\u{7f}")
        );
        assert_eq!(
            evaluate(Func::Rept, vec![Value::text(""), Value::number(i64::MAX as f64)]),
            Value::text("")
        );
        assert_eq!(
            evaluate(
                Func::Rept,
                vec![
                    Value::text("ab"),
                    Value::number((MAX_TEXT_OUTPUT_BYTES / 2 + 1) as f64),
                ],
            ),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(evaluate(Func::Char, vec![Value::number(65.0)]), Value::text("A"));
        assert_eq!(
            evaluate(Func::Char, vec![Value::number(0.0)]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(Func::UniChar, vec![Value::number(0x1f600 as f64)]),
            Value::text("😀")
        );
        assert_eq!(
            evaluate(Func::UniChar, vec![Value::number(0xd800 as f64)]),
            Value::Error(FormulaError::Value)
        );
        assert_number(evaluate(Func::Code, vec![Value::text("é")]), 233.0);
        assert_number(evaluate(Func::Unicode, vec![Value::text("😀")]), 0x1f600 as f64);
        assert_eq!(
            evaluate(Func::Rept, vec![Value::text("a"), Value::number(-1.0)]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(Func::Char, vec![Value::number(256.0)]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            evaluate(Func::Code, vec![Value::text("")]),
            Value::Error(FormulaError::Value)
        );
        for code in [1u32, 65, 127, 233, 255] {
            let character = evaluate(Func::Char, vec![Value::number(code as f64)]);
            assert_number(evaluate(Func::Code, vec![character]), code as f64);
        }
        for code in ['A' as u32, 'é' as u32, '😀' as u32, 0x10ffff] {
            let character = evaluate(Func::UniChar, vec![Value::number(code as f64)]);
            assert_number(evaluate(Func::Unicode, vec![character]), code as f64);
        }
        assert_eq!(
            clean_text("a".repeat(MAX_TEXT_OUTPUT_BYTES + 1)),
            Err(FormulaError::Num)
        );
        assert_eq!(
            evaluate(Func::Upper, vec![Value::text("straße")]),
            Value::text("STRASSE")
        );
        assert_eq!(
            evaluate(Func::Lower, vec![Value::text("İ")]),
            Value::text("i\u{307}")
        );
    }


    #[test]
    fn code_point_slices_enforce_output_bounds() {
        assert_eq!(
            evaluate(
                Func::Right,
                vec![Value::text("a😀ç"), Value::number(2.0)],
            ),
            Value::text("😀ç")
        );
        assert_eq!(
            evaluate(
                Func::Mid,
                vec![
                    Value::text("a😀ç"),
                    Value::number(2.0),
                    Value::number(1.0),
                ],
            ),
            Value::text("😀")
        );
        let oversized = "a".repeat(MAX_TEXT_OUTPUT_BYTES + 1);
        assert_eq!(
            slice_text(&oversized, 0, MAX_TEXT_OUTPUT_BYTES + 1),
            Err(FormulaError::Num)
        );
    }
    #[test]
    fn proper_uses_nonletters_as_word_boundaries_without_per_character_strings() {
        assert_eq!(
            evaluate(Func::Proper, vec![Value::text("éLAN 76bUDGET")]),
            Value::text("Élan 76Budget")
        );
    }

    #[test]
    fn required_text_functions_reject_wrong_arity() {
        let empty = FuncAccumulator::default();
        for func in [
            Func::TextJoin,
            Func::Substitute,
            Func::Replace,
            Func::Find,
            Func::Search,
            Func::Value,
            Func::Clean,
            Func::Rept,
            Func::Char,
            Func::Code,
            Func::UniChar,
            Func::Unicode,
            Func::Proper,
            Func::NumberValue,
        ] {
            assert_eq!(
                apply(func, &empty).unwrap(),
                Value::Error(FormulaError::Value),
                "{func:?}"
            );
        }
    }
}
