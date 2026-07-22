//! Bounded math, rounding, and numeric aggregation functions.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::functions::{
    integer_arg, number_arg, numeric_entries, require_arity, FuncAccumulator, FuncValue,
};
use super::value::aggregate_number;

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Abs => unary(values, |value| Ok(value.abs())),
        Func::Sqrt => unary(values, |value| {
            if value < 0.0 {
                Err(FormulaError::Num)
            } else {
                Ok(value.sqrt())
            }
        }),
        Func::Round => round(values, RoundDirection::Nearest),
        Func::RoundUp => round(values, RoundDirection::Away),
        Func::RoundDown => round(values, RoundDirection::Toward),
        Func::Mod => binary(values, |number, divisor| {
            if divisor == 0.0 {
                Err(FormulaError::DivZero)
            } else {
                Ok(number - divisor * (number / divisor).floor())
            }
        }),
        Func::Pow | Func::Power => binary(values, |base, exponent| {
            if base == 0.0 && exponent < 0.0 {
                Err(FormulaError::DivZero)
            } else {
                finite(base.powf(exponent))
            }
        }),
        Func::Floor => significance(values, f64::floor),
        Func::Ceiling => significance(values, f64::ceil),
        Func::Int => unary(values, |value| Ok(value.floor())),
        Func::Trunc => trunc(values),
        Func::Sign => unary(values, |value| {
            Ok(if value > 0.0 {
                1.0
            } else if value < 0.0 {
                -1.0
            } else {
                0.0
            })
        }),
        Func::Pi => {
            require_arity(values, 0, 0).map_or_else(Value::Error, |_| Value::number(std::f64::consts::PI))
        }
        Func::Product => product(values),
        Func::SumProduct => sum_product(values),
        Func::Exp => unary(values, |value| finite(value.exp())),
        Func::Ln => unary(values, |value| {
            if value <= 0.0 {
                Err(FormulaError::Num)
            } else {
                finite(value.ln())
            }
        }),
        Func::Log => log(values),
        Func::Log10 => unary(values, |value| {
            if value <= 0.0 {
                Err(FormulaError::Num)
            } else {
                finite(value.log10())
            }
        }),
        Func::MRound => binary(values, |number, multiple| {
            if multiple == 0.0 {
                return Ok(0.0);
            }
            if number.signum() != multiple.signum() {
                return Err(FormulaError::Num);
            }
            finite((number / multiple).round() * multiple)
        }),
        Func::Even => parity_round(values, 2, false),
        Func::Odd => parity_round(values, 2, true),
        Func::Quotient => binary(values, |numerator, denominator| {
            if denominator == 0.0 {
                Err(FormulaError::DivZero)
            } else {
                finite((numerator / denominator).trunc())
            }
        }),
        Func::Gcd => gcd_lcm(values, false),
        Func::Lcm => gcd_lcm(values, true),
        Func::Subtotal => subtotal(values),
        _ => return None,
    };
    Some(result)
}

fn unary(
    values: &FuncAccumulator,
    operation: impl FnOnce(f64) -> Result<f64, FormulaError>,
) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    match number_arg(values, 0, None).and_then(operation) {
        Ok(value) => Value::number(value),
        Err(error) => Value::Error(error),
    }
}

fn binary(
    values: &FuncAccumulator,
    operation: impl FnOnce(f64, f64) -> Result<f64, FormulaError>,
) -> Value {
    if let Err(error) = require_arity(values, 2, 2) {
        return Value::Error(error);
    }
    let left = match number_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let right = match number_arg(values, 1, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    match operation(left, right) {
        Ok(value) => Value::number(value),
        Err(error) => Value::Error(error),
    }
}

fn finite(value: f64) -> Result<f64, FormulaError> {
    value.is_finite().then_some(value).ok_or(FormulaError::Num)
}

#[derive(Clone, Copy)]
enum RoundDirection {
    Nearest,
    Away,
    Toward,
}

fn round(values: &FuncAccumulator, direction: RoundDirection) -> Value {
    if let Err(error) = require_arity(values, 2, 2) {
        return Value::Error(error);
    }
    let number = match number_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let digits = match integer_arg(values, 1, None) {
        Ok(value) if (-308..=308).contains(&value) => value as i32,
        Ok(_) => return Value::Error(FormulaError::Num),
        Err(error) => return Value::Error(error),
    };
    let factor = 10f64.powi(digits.abs());
    if !factor.is_finite() || factor == 0.0 {
        return Value::Error(FormulaError::Num);
    }
    let scaled = if digits >= 0 {
        number * factor
    } else {
        number / factor
    };
    let rounded = match direction {
        RoundDirection::Nearest => scaled.round(),
        RoundDirection::Away => {
            if scaled < 0.0 { scaled.floor() } else { scaled.ceil() }
        }
        RoundDirection::Toward => scaled.trunc(),
    };
    Value::number(if digits >= 0 {
        rounded / factor
    } else {
        rounded * factor
    })
}

fn significance(values: &FuncAccumulator, operation: fn(f64) -> f64) -> Value {
    if let Err(error) = require_arity(values, 1, 2) {
        return Value::Error(error);
    }
    let number = match number_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let significance = match number_arg(values, 1, Some(1.0)) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    if significance == 0.0 {
        return Value::Error(FormulaError::DivZero);
    }
    Value::number(operation(number / significance) * significance)
}

fn trunc(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 2) {
        return Value::Error(error);
    }
    let number = match number_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let digits = match integer_arg(values, 1, Some(0)) {
        Ok(value) if (-308..=308).contains(&value) => value as i32,
        Ok(_) => return Value::Error(FormulaError::Num),
        Err(error) => return Value::Error(error),
    };
    let factor = 10f64.powi(digits.abs());
    Value::number(if digits >= 0 {
        (number * factor).trunc() / factor
    } else {
        (number / factor).trunc() * factor
    })
}

fn product(values: &FuncAccumulator) -> Value {
    if values.arg_count() == 0 {
        return Value::Error(FormulaError::Value);
    }
    let mut product = 1.0;
    let mut count = 0usize;
    for entry in values.entries() {
        match aggregate_number(&entry.value, entry.from_range) {
            Ok(Some(number)) => {
                product *= number;
                count += 1;
                if !product.is_finite() {
                    return Value::Error(FormulaError::Num);
                }
            }
            Ok(None) => {}
            Err(error) => return Value::Error(error),
        }
    }
    Value::number(if count == 0 { 0.0 } else { product })
}

fn sum_product(values: &FuncAccumulator) -> Value {
    if values.arg_count() == 0 {
        return Value::Error(FormulaError::Value);
    }
    let length = values.arg(0).map_or(0, <[FuncValue]>::len);
    if length == 0
        || (0..values.arg_count()).any(|index| values.arg(index).map_or(0, <[FuncValue]>::len) != length)
    {
        return Value::Error(FormulaError::Value);
    }
    let mut total = 0.0;
    for item in 0..length {
        let mut product = 1.0;
        for argument in 0..values.arg_count() {
            let entry = &values.arg(argument).expect("validated argument")[item];
            let number = match aggregate_number(&entry.value, entry.from_range) {
                Ok(Some(number)) => number,
                Ok(None) => 0.0,
                Err(error) => return Value::Error(error),
            };
            product *= number;
        }
        total += product;
        if !total.is_finite() {
            return Value::Error(FormulaError::Num);
        }
    }
    Value::number(total)
}

fn log(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 2) {
        return Value::Error(error);
    }
    let number = match number_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    let base = match number_arg(values, 1, Some(10.0)) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    if number <= 0.0 || base <= 0.0 || base == 1.0 {
        Value::Error(FormulaError::Num)
    } else {
        Value::number(number.log(base))
    }
}

fn parity_round(values: &FuncAccumulator, divisor: i64, odd: bool) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    let number = match number_arg(values, 0, None) {
        Ok(value) => value,
        Err(error) => return Value::Error(error),
    };
    if number.abs() > i64::MAX as f64 {
        return Value::Error(FormulaError::Num);
    }
    let mut integer = if number < 0.0 {
        number.floor() as i64
    } else {
        number.ceil() as i64
    };
    let remainder = integer.rem_euclid(divisor);
    let wanted = if odd { 1 } else { 0 };
    if remainder != wanted {
        integer = if number < 0.0 {
            integer.checked_sub((remainder - wanted).rem_euclid(divisor))
        } else {
            integer.checked_add((wanted - remainder).rem_euclid(divisor))
        }
        .unwrap_or(if number < 0.0 { i64::MIN } else { i64::MAX });
    }
    Value::number(integer as f64)
}

fn gcd_lcm(values: &FuncAccumulator, lcm: bool) -> Value {
    if values.arg_count() == 0 {
        return Value::Error(FormulaError::Value);
    }
    let numbers = match numeric_entries(values.entries()) {
        Ok(numbers) => numbers,
        Err(error) => return Value::Error(error),
    };
    let mut result = if lcm { 1u64 } else { 0u64 };
    let mut found = false;
    for number in numbers {
        if number < 0.0 || number > u64::MAX as f64 {
            return Value::Error(FormulaError::Num);
        }
        let value = number.trunc() as u64;
        found = true;
        if lcm {
            if value == 0 {
                result = 0;
                continue;
            }
            let divisor = gcd(result, value);
            result = match result.checked_div(divisor).and_then(|part| part.checked_mul(value)) {
                Some(value) => value,
                None => return Value::Error(FormulaError::Num),
            };
        } else {
            result = gcd(result, value);
        }
    }
    Value::number(if found { result as f64 } else { 0.0 })
}

fn gcd(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left
}

fn subtotal(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 2, 254) {
        return Value::Error(error);
    }
    let function = match integer_arg(values, 0, None) {
        Ok(code @ 101..=111) => code - 100,
        Ok(code @ 1..=11) => code,
        Ok(_) => return Value::Error(FormulaError::Value),
        Err(error) => return Value::Error(error),
    };
    let entries = values.entries_from_arg(1);
    let numbers = match numeric_entries(entries) {
        Ok(numbers) => numbers,
        Err(error) => return Value::Error(error),
    };
    match function {
        1 => if numbers.is_empty() { Value::Error(FormulaError::DivZero) } else { Value::number(numbers.iter().sum::<f64>() / numbers.len() as f64) },
        2 => Value::number(numbers.len() as f64),
        3 => Value::number(entries.iter().filter(|entry| !matches!(entry.value, Value::Blank)).count() as f64),
        4 => Value::number(numbers.iter().copied().reduce(f64::max).unwrap_or(0.0)),
        5 => Value::number(numbers.iter().copied().reduce(f64::min).unwrap_or(0.0)),
        6 => Value::number(if numbers.is_empty() { 0.0 } else { numbers.iter().product() }),
        7 => variance_value(&numbers, true, true),
        8 => variance_value(&numbers, false, true),
        9 => Value::number(numbers.iter().sum()),
        10 => variance_value(&numbers, true, false),
        11 => variance_value(&numbers, false, false),
        _ => unreachable!(),
    }
}

fn variance_value(numbers: &[f64], sample: bool, standard_deviation: bool) -> Value {
    let divisor = numbers.len().saturating_sub(usize::from(sample));
    if divisor == 0 {
        return Value::Error(FormulaError::DivZero);
    }
    let mean = numbers.iter().sum::<f64>() / numbers.len() as f64;
    let variance = numbers
        .iter()
        .map(|value| (value - mean) * (value - mean))
        .sum::<f64>()
        / divisor as f64;
    Value::number(if standard_deviation { variance.sqrt() } else { variance })
}
