//! Criteria parsing, wildcard matching, and conditional aggregation.

use std::cmp::Ordering;

use crate::calc::CmpOp;
use crate::types::{FormulaError, Value};

use super::matrix::EvalMatrix;

#[derive(Debug)]
enum WildcardToken {
    Literal(char),
    AnyOne,
    AnyMany,
}

#[derive(Debug)]
pub(super) struct Criterion {
    op: CmpOp,
    operand: Value,
    wildcard: Option<Vec<WildcardToken>>,
}

impl Criterion {
    pub(super) fn parse(value: Value) -> Self {
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

    pub(super) fn matches(&self, candidate: &Value) -> bool {
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

pub(super) fn wildcard_matches_pattern(pattern: &str, candidate: &Value) -> bool {
    let Some(text) = criterion_text(candidate) else {
        return false;
    };
    if let Some(tokens) = wildcard_tokens(pattern) {
        wildcard_matches(&tokens, &text)
    } else {
        text.eq_ignore_ascii_case(pattern)
    }
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

pub(super) fn aggregate_if(
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

pub(super) fn extreme_if(
    value_range: &EvalMatrix,
    criteria: &[(&EvalMatrix, &Criterion)],
    maximum: bool,
) -> Result<f64, FormulaError> {
    let mut found = None;
    for (index, value) in value_range.values.iter().enumerate() {
        if !criteria
            .iter()
            .all(|(range, criterion)| criterion.matches(&range.values[index]))
        {
            continue;
        }
        match value {
            Value::Number(value) if value.is_finite() => {
                found = Some(found.map_or(*value, |current: f64| {
                    if maximum {
                        current.max(*value)
                    } else {
                        current.min(*value)
                    }
                }));
            }
            Value::Number(_) => return Err(FormulaError::Num),
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
    }
    Ok(found.unwrap_or(0.0))
}
