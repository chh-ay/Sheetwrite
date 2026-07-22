//! Bounded math, rounding, and numeric aggregation functions.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::functions::{integer_arg, number_arg, require_arity, FuncAccumulator};
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
            if number == 0.0 || multiple == 0.0 {
                return Ok(0.0);
            }
            if number.is_sign_negative() != multiple.is_sign_negative() {
                return Err(FormulaError::Num);
            }
            let quotient = number / multiple;
            if quotient.is_finite() {
                finite(quotient.round() * multiple)
            } else {
                Ok(number)
            }
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
    let round_scaled = |scaled: f64| match direction {
        RoundDirection::Nearest => scaled.round(),
        RoundDirection::Away if scaled < 0.0 => scaled.floor(),
        RoundDirection::Away => scaled.ceil(),
        RoundDirection::Toward => scaled.trunc(),
    };
    let rounded = if digits >= 0 {
        let scaled = number * factor;
        if scaled.is_finite() {
            round_scaled(scaled) / factor
        } else {
            // At this magnitude the requested decimal place is below f64 precision.
            number
        }
    } else {
        round_scaled(number / factor) * factor
    };
    Value::number(rounded)
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
    let Some(first) = values.arg(0) else {
        return Value::Error(FormulaError::Value);
    };
    let Some(shape) = values.arg_shape(0) else {
        return Value::Error(FormulaError::Value);
    };
    let length = first.len();
    if length == 0 {
        return Value::Error(FormulaError::Value);
    }
    for argument in 1..values.arg_count() {
        if values.arg_shape(argument) != Some(shape) {
            return Value::Error(FormulaError::Value);
        }
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
            if !product.is_finite() {
                return Value::Error(FormulaError::Num);
            }
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
    if number < i64::MIN as f64 || number >= -(i64::MIN as f64) {
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
        let adjustment = if number < 0.0 {
            -((remainder - wanted).rem_euclid(divisor))
        } else {
            (wanted - remainder).rem_euclid(divisor)
        };
        integer = match integer.checked_add(adjustment) {
            Some(value) => value,
            None => return Value::Error(FormulaError::Num),
        };
    }
    Value::number(integer as f64)
}

fn gcd_lcm(values: &FuncAccumulator, lcm: bool) -> Value {
    if values.arg_count() == 0 {
        return Value::Error(FormulaError::Value);
    }
    let mut result = if lcm { 1u64 } else { 0u64 };
    let mut found = false;
    for entry in values.entries() {
        let number = match aggregate_number(&entry.value, entry.from_range) {
            Ok(Some(number)) => number,
            Ok(None) => continue,
            Err(error) => return Value::Error(error),
        };
        if number < 0.0 || number >= u64::MAX as f64 {
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

    if function == 2 {
        let mut count = 0usize;
        for entry in entries {
            match aggregate_number(&entry.value, entry.from_range) {
                Ok(Some(_)) => count += 1,
                Ok(None) => {}
                Err(_) if entry.from_range && matches!(&entry.value, Value::Error(_)) => {}
                Err(error) => return Value::Error(error),
            }
        }
        return Value::number(count as f64);
    }
    if function == 3 {
        return Value::number(
            entries
                .iter()
                .filter(|entry| !matches!(&entry.value, Value::Blank))
                .count() as f64,
        );
    }

    let mut count = 0usize;
    let mut aggregate = match function {
        4 => f64::NEG_INFINITY,
        5 => f64::INFINITY,
        6 => 1.0,
        _ => 0.0,
    };
    let mut mean = 0.0f64;
    let mut squared_deviations = 0.0f64;
    for entry in entries {
        let number = match aggregate_number(&entry.value, entry.from_range) {
            Ok(Some(number)) => number,
            Ok(None) => continue,
            Err(error) => return Value::Error(error),
        };
        count += 1;
        match function {
            1 => {
                let weight = 1.0 / count as f64;
                mean = mean.mul_add(1.0 - weight, number * weight);
            }
            4 => aggregate = aggregate.max(number),
            5 => aggregate = aggregate.min(number),
            6 => aggregate *= number,
            9 => aggregate += number,
            7 | 8 | 10 | 11 => {
                let delta = number - mean;
                mean += delta / count as f64;
                squared_deviations += delta * (number - mean);
            }
            _ => unreachable!(),
        }
        let selected = if matches!(function, 1) { mean } else if matches!(function, 7 | 8 | 10 | 11) {
            squared_deviations
        } else {
            aggregate
        };
        if !selected.is_finite() {
            return Value::Error(FormulaError::Num);
        }
    }

    match function {
        1 => {
            if count == 0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number(mean)
            }
        }
        4 | 5 | 6 | 9 => Value::number(if count == 0 { 0.0 } else { aggregate }),
        7 | 8 | 10 | 11 => {
            let sample = matches!(function, 7 | 10);
            let divisor = count.saturating_sub(usize::from(sample));
            if divisor == 0 {
                return Value::Error(FormulaError::DivZero);
            }
            let variance = squared_deviations / divisor as f64;
            Value::number(if matches!(function, 7 | 8) {
                variance.sqrt()
            } else {
                variance
            })
        }
        _ => unreachable!(),
    }
}


#[cfg(test)]
mod tests {
    use super::apply;
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
    fn scalar_domains_and_arities() {
        let cases = [
            (Func::Power, vec![Value::number(2.0), Value::number(10.0)], 1024.0),
            (Func::Exp, vec![Value::number(1.0)], std::f64::consts::E),
            (Func::Ln, vec![Value::number(std::f64::consts::E)], 1.0),
            (Func::Log, vec![Value::number(8.0), Value::number(2.0)], 3.0),
            (Func::Log10, vec![Value::number(1000.0)], 3.0),
            (Func::Quotient, vec![Value::number(-7.0), Value::number(3.0)], -2.0),
        ];
        for (func, arguments, expected) in cases {
            assert_number(evaluate(func, arguments), expected);
        }

        assert_eq!(evaluate(Func::Power, vec![Value::number(2.0)]), Value::Error(FormulaError::Value));
        assert_eq!(evaluate(Func::Ln, vec![Value::number(0.0)]), Value::Error(FormulaError::Num));
        assert_eq!(
            evaluate(Func::Log, vec![Value::number(10.0), Value::number(1.0)]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            evaluate(Func::Quotient, vec![Value::number(1.0), Value::number(0.0)]),
            Value::Error(FormulaError::DivZero)
        );
        assert_number(evaluate(Func::Log, vec![Value::number(100.0)]), 2.0);
        assert_eq!(
            evaluate(Func::Power, vec![Value::number(-2.0), Value::number(0.5)]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            evaluate(Func::Exp, vec![Value::number(1_000.0)]),
            Value::Error(FormulaError::Num)
        );
        let empty = FuncAccumulator::default();
        assert_eq!(
            apply(Func::Product, &empty).unwrap(),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            apply(Func::SumProduct, &empty).unwrap(),
            Value::Error(FormulaError::Value)
        );
    }

    #[test]
    fn rounding_is_away_or_toward_zero_and_bounded() {
        let cases = [
            (Func::RoundUp, 12.341, 2.0, 12.35),
            (Func::RoundUp, -12.341, 2.0, -12.35),
            (Func::RoundDown, 12.349, 2.0, 12.34),
            (Func::RoundDown, -12.349, 2.0, -12.34),
            (Func::RoundUp, 149.0, -2.0, 200.0),
            (Func::RoundDown, -149.0, -2.0, -100.0),
        ];
        for (func, number, digits, expected) in cases {
            assert_number(evaluate(func, vec![Value::number(number), Value::number(digits)]), expected);
        }
        assert_number(
            evaluate(Func::RoundDown, vec![Value::number(2.0), Value::number(308.0)]),
            2.0,
        );
        assert_eq!(
            evaluate(Func::RoundUp, vec![Value::number(1.0), Value::number(309.0)]),
            Value::Error(FormulaError::Num)
        );
    }

    #[test]
    fn product_and_sumproduct_obey_argument_provenance_and_shapes() {
        let values = accumulator(vec![
            (false, vec![Value::Bool(true)]),
            (false, vec![Value::text("3")]),
            (
                true,
                vec![Value::number(2.0), Value::Bool(true), Value::text("9"), Value::Blank],
            ),
        ]);
        assert_number(apply(Func::Product, &values).unwrap(), 6.0);

        let paired = accumulator(vec![
            (
                true,
                vec![Value::number(2.0), Value::Bool(true), Value::text("4"), Value::Blank],
            ),
            (
                true,
                vec![Value::number(3.0), Value::number(4.0), Value::number(5.0), Value::number(6.0)],
            ),
        ]);
        assert_number(apply(Func::SumProduct, &paired).unwrap(), 6.0);

        let mismatched = accumulator(vec![
            (true, vec![Value::number(1.0), Value::number(2.0)]),
            (true, vec![Value::number(3.0)]),
        ]);
        assert_eq!(
            apply(Func::SumProduct, &mismatched).unwrap(),
            Value::Error(FormulaError::Value)
        );
        let mut dimensional_mismatch = FuncAccumulator::default();
        dimensional_mismatch.push_range(Value::number(1.0)).unwrap();
        dimensional_mismatch.push_range(Value::number(2.0)).unwrap();
        dimensional_mismatch.finish_arg(1, 2).unwrap();
        dimensional_mismatch.push_range(Value::number(3.0)).unwrap();
        dimensional_mismatch.push_range(Value::number(4.0)).unwrap();
        dimensional_mismatch.finish_arg(2, 1).unwrap();
        assert_eq!(
            apply(Func::SumProduct, &dimensional_mismatch).unwrap(),
            Value::Error(FormulaError::Value)
        );
        let error = accumulator(vec![
            (true, vec![Value::number(1.0), Value::Error(FormulaError::Ref)]),
            (true, vec![Value::number(2.0), Value::number(3.0)]),
        ]);
        assert_eq!(
            apply(Func::SumProduct, &error).unwrap(),
            Value::Error(FormulaError::Ref)
        );
    }

    #[test]
    fn multiple_and_parity_rounding_cover_sign_and_integer_boundaries() {
        assert_number(
            evaluate(Func::MRound, vec![Value::number(0.0), Value::number(-3.0)]),
            0.0,
        );
        assert_number(
            evaluate(Func::MRound, vec![Value::number(6.0), Value::number(4.0)]),
            8.0,
        );
        assert_eq!(
            evaluate(Func::MRound, vec![Value::number(6.0), Value::number(-4.0)]),
            Value::Error(FormulaError::Num)
        );
        assert_number(evaluate(Func::Even, vec![Value::number(-3.2)]), -4.0);
        assert_number(evaluate(Func::Odd, vec![Value::number(2.0)]), 3.0);
        assert_eq!(
            evaluate(Func::Even, vec![Value::number(-(i64::MIN as f64))]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            evaluate(Func::Odd, vec![Value::number(i64::MIN as f64)]),
            Value::Error(FormulaError::Num)
        );
        assert_number(
            evaluate(
                Func::MRound,
                vec![Value::number(1e308), Value::number(1e-308)],
            ),
            1e308,
        );
    }

    #[test]
    fn gcd_and_lcm_truncate_and_satisfy_divisibility() {
        assert_number(
            evaluate(Func::Gcd, vec![Value::number(48.9), Value::number(18.1)]),
            6.0,
        );
        assert_number(
            evaluate(Func::Lcm, vec![Value::number(48.9), Value::number(18.1)]),
            144.0,
        );
        assert_eq!(
            evaluate(Func::Gcd, vec![Value::number(-1.0)]),
            Value::Error(FormulaError::Num)
        );

        assert_eq!(
            evaluate(
                Func::Lcm,
                vec![Value::number(2f64.powi(63)), Value::number(3.0)],
            ),
            Value::Error(FormulaError::Num)
        );
        for left in 1..32u64 {
            for right in 1..32u64 {
                let Value::Number(divisor) = evaluate(
                    Func::Gcd,
                    vec![Value::number(left as f64), Value::number(right as f64)],
                ) else {
                    panic!("GCD must be numeric");
                };
                let divisor = divisor as u64;
                assert_eq!(left % divisor, 0);
                assert_eq!(right % divisor, 0);
            }
        }
    }

    #[test]
    fn subtotal_uses_function_specific_error_and_coercion_rules() {
        let range = vec![
            Value::number(2.0),
            Value::number(4.0),
            Value::Error(FormulaError::DivZero),
            Value::text("6"),
            Value::Bool(true),
            Value::Blank,
        ];
        let count = accumulator(vec![(false, vec![Value::number(2.0)]), (true, range.clone())]);
        assert_number(apply(Func::Subtotal, &count).unwrap(), 2.0);

        let count_a = accumulator(vec![(false, vec![Value::number(3.0)]), (true, range.clone())]);
        assert_number(apply(Func::Subtotal, &count_a).unwrap(), 5.0);

        let sum = accumulator(vec![(false, vec![Value::number(9.0)]), (true, range)]);
        assert_eq!(
            apply(Func::Subtotal, &sum).unwrap(),
            Value::Error(FormulaError::DivZero)
        );

        let variance = accumulator(vec![
            (false, vec![Value::number(11.0)]),
            (
                true,
                vec![
                    Value::number(2.0),
                    Value::number(4.0),
                    Value::number(4.0),
                    Value::number(4.0),
                    Value::number(5.0),
                    Value::number(5.0),
                    Value::number(7.0),
                    Value::number(9.0),
                ],
            ),
        ]);
        assert_number(apply(Func::Subtotal, &variance).unwrap(), 4.0);
        let average = accumulator(vec![
            (false, vec![Value::number(1.0)]),
            (true, vec![Value::number(1e308), Value::number(1e308)]),
        ]);
        assert_number(apply(Func::Subtotal, &average).unwrap(), 1e308);

        let invalid_code = accumulator(vec![
            (false, vec![Value::number(12.0)]),
            (true, vec![Value::number(1.0)]),
        ]);
        assert_eq!(
            apply(Func::Subtotal, &invalid_code).unwrap(),
            Value::Error(FormulaError::Value)
        );
    }
}
