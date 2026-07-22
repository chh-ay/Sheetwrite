//! Financial function family dispatch.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::functions::{number_arg, require_arity, FuncAccumulator, FuncValue};
use super::value::aggregate_number;

const ROOT_BRACKET_STEPS: usize = 14;
const ROOT_SOLVE_STEPS: usize = 100;
const ROOT_VALUE_REL_TOLERANCE: f64 = 1e-12;
const ROOT_X_ABS_TOLERANCE: f64 = 1e-12;
const ROOT_X_REL_TOLERANCE: f64 = 1e-12;
const ROOT_X_MIN: f64 = -36.0;
const ROOT_X_MAX: f64 = 700.0;

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Pv => pv(values),
        Func::Fv => fv(values),
        Func::Pmt => pmt(values),
        Func::Npv => npv(values),
        Func::Irr => irr(values),
        Func::Rate => rate(values),
        Func::Ipmt => ipmt(values),
        Func::Ppmt => ppmt(values),
        _ => return None,
    };
    Some(result.map_or_else(Value::Error, Value::number))
}

fn pv(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 5)?;
    let rate = number_arg(values, 0, None)?;
    let periods = number_arg(values, 1, None)?;
    let payment = number_arg(values, 2, None)?;
    let future_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    pv_value(rate, periods, payment, future_value, timing)
}

fn fv(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 5)?;
    let rate = number_arg(values, 0, None)?;
    let periods = number_arg(values, 1, None)?;
    let payment = number_arg(values, 2, None)?;
    let present_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    fv_value(rate, periods, payment, present_value, timing)
}

fn pmt(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 5)?;
    let rate = number_arg(values, 0, None)?;
    let periods = number_arg(values, 1, None)?;
    let present_value = number_arg(values, 2, None)?;
    let future_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    pmt_value(rate, periods, present_value, future_value, timing)
}

fn npv(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 254)?;
    let rate = number_arg(values, 0, None)?;
    let base = 1.0 + rate;
    let mut discount = base;
    let mut sum = 0.0;
    let mut compensation = 0.0;

    for entry in values.entries_from_arg(1) {
        let Some(cashflow) = cashflow_number(entry)? else {
            continue;
        };
        if discount == 0.0 {
            return Err(FormulaError::DivZero);
        }
        let contribution = cashflow / discount;
        if !contribution.is_finite() {
            return Err(FormulaError::Num);
        }
        let adjusted = contribution - compensation;
        let next = sum + adjusted;
        if !next.is_finite() {
            return Err(FormulaError::Num);
        }
        compensation = (next - sum) - adjusted;
        sum = next;
        discount *= base;
        if discount.is_nan() {
            return Err(FormulaError::Num);
        }
    }
    Ok(sum)
}

fn irr(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 1, 2)?;
    let cashflows = values.arg(0).ok_or(FormulaError::Value)?;
    let mut has_positive = false;
    let mut has_negative = false;
    for entry in cashflows {
        if let Some(cashflow) = cashflow_number(entry)? {
            has_positive |= cashflow > 0.0;
            has_negative |= cashflow < 0.0;
        }
    }
    if !has_positive || !has_negative {
        return Err(FormulaError::Num);
    }

    let guess = number_arg(values, 1, Some(0.1))?;
    solve_root(guess, |x| irr_sample(cashflows, x))
}

fn rate(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 6)?;
    let periods = number_arg(values, 0, None)?;
    let payment = number_arg(values, 1, None)?;
    let present_value = number_arg(values, 2, None)?;
    let future_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    let guess = number_arg(values, 5, Some(0.1))?;
    if periods <= 0.0
        || (payment == 0.0 && present_value == 0.0 && future_value == 0.0)
    {
        return Err(FormulaError::Num);
    }
    solve_root(guess, |x| {
        rate_sample(
            periods,
            payment,
            present_value,
            future_value,
            timing,
            x,
        )
    })
}

fn ipmt(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 4, 6)?;
    let rate = number_arg(values, 0, None)?;
    let period = number_arg(values, 1, None)?;
    let periods = number_arg(values, 2, None)?;
    let present_value = number_arg(values, 3, None)?;
    let future_value = number_arg(values, 4, Some(0.0))?;
    let timing = payment_timing(values, 5)?;
    ipmt_value(
        rate,
        period,
        periods,
        present_value,
        future_value,
        timing,
    )
}

fn ppmt(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 4, 6)?;
    let rate = number_arg(values, 0, None)?;
    let period = number_arg(values, 1, None)?;
    let periods = number_arg(values, 2, None)?;
    let present_value = number_arg(values, 3, None)?;
    let future_value = number_arg(values, 4, Some(0.0))?;
    let timing = payment_timing(values, 5)?;
    let interest = ipmt_value(
        rate,
        period,
        periods,
        present_value,
        future_value,
        timing,
    )?;
    let payment = pmt_value(rate, periods, present_value, future_value, timing)?;
    finite(payment - interest)
}

fn payment_timing(values: &FuncAccumulator, index: usize) -> Result<bool, FormulaError> {
    Ok(number_arg(values, index, Some(0.0))? != 0.0)
}

fn periodic_terms(rate: f64, periods: f64) -> Result<(f64, f64), FormulaError> {
    if rate == 0.0 {
        return Ok((1.0, periods));
    }

    let base = 1.0 + rate;
    let (growth, annuity) = if base > 0.0 {
        let exponent = periods * rate.ln_1p();
        let growth_minus_one = exponent.exp_m1();
        (exponent.exp(), growth_minus_one / rate)
    } else if base == 0.0 {
        let growth = if periods > 0.0 {
            0.0
        } else if periods == 0.0 {
            1.0
        } else {
            return Err(FormulaError::Num);
        };
        (growth, (growth - 1.0) / rate)
    } else {
        if periods.fract() != 0.0
            || periods < i64::MIN as f64
            || periods > i64::MAX as f64
        {
            return Err(FormulaError::Num);
        }
        let magnitude = base.abs().powf(periods);
        let integer_periods = periods as i64;
        let growth = if integer_periods & 1 == 0 {
            magnitude
        } else {
            -magnitude
        };
        (growth, (growth - 1.0) / rate)
    };
    if growth.is_finite() && annuity.is_finite() {
        Ok((growth, annuity))
    } else {
        Err(FormulaError::Num)
    }
}

fn pv_value(
    rate: f64,
    periods: f64,
    payment: f64,
    future_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    let (growth, annuity) = periodic_terms(rate, periods)?;
    if growth == 0.0 {
        return Err(FormulaError::DivZero);
    }
    let timing_factor = if timing { 1.0 + rate } else { 1.0 };
    finite(-(future_value + payment * timing_factor * annuity) / growth)
}

fn fv_value(
    rate: f64,
    periods: f64,
    payment: f64,
    present_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    let (growth, annuity) = periodic_terms(rate, periods)?;
    let timing_factor = if timing { 1.0 + rate } else { 1.0 };
    finite(-(present_value * growth + payment * timing_factor * annuity))
}

fn pmt_value(
    rate: f64,
    periods: f64,
    present_value: f64,
    future_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    let (growth, annuity) = periodic_terms(rate, periods)?;
    let timing_factor = if timing { 1.0 + rate } else { 1.0 };
    let denominator = timing_factor * annuity;
    if denominator == 0.0 {
        return Err(FormulaError::DivZero);
    }
    finite(-(future_value + present_value * growth) / denominator)
}

fn ipmt_value(
    rate: f64,
    period: f64,
    periods: f64,
    present_value: f64,
    future_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    if period < 1.0 || period > periods || periods < 1.0 {
        return Err(FormulaError::Num);
    }
    let payment = pmt_value(rate, periods, present_value, future_value, timing)?;
    if timing && period == 1.0 {
        return Ok(0.0);
    }
    let balance = fv_value(
        rate,
        period - 1.0,
        payment,
        present_value,
        timing,
    )?;
    let mut interest = balance * rate;
    if timing {
        let base = 1.0 + rate;
        if base == 0.0 {
            return Err(FormulaError::DivZero);
        }
        interest /= base;
    }
    finite(interest)
}

fn cashflow_number(entry: &FuncValue) -> Result<Option<f64>, FormulaError> {
    if !entry.from_range && matches!(entry.value, Value::Blank) {
        Ok(Some(0.0))
    } else {
        aggregate_number(&entry.value, entry.from_range)
    }
}

fn finite(value: f64) -> Result<f64, FormulaError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(FormulaError::Num)
    }
}

#[derive(Clone, Copy)]
struct RootSample {
    value: f64,
    scale: f64,
}

impl RootSample {
    fn new(value: f64, scale: f64) -> Result<Self, FormulaError> {
        if value.is_nan() || scale.is_nan() {
            Err(FormulaError::Num)
        } else {
            Ok(Self { value, scale })
        }
    }

    fn converged(self) -> bool {
        self.value.is_finite()
            && self.scale.is_finite()
            && self.scale > 0.0
            && (self.value == 0.0
                || self.value.abs() <= ROOT_VALUE_REL_TOLERANCE * self.scale)
    }
}

fn irr_sample(cashflows: &[FuncValue], x: f64) -> Result<RootSample, FormulaError> {
    let inverse_growth = (-x).exp();
    let mut value = 0.0;
    let mut scale = 0.0;
    for entry in cashflows.iter().rev() {
        let Some(cashflow) = cashflow_number(entry)? else {
            continue;
        };
        value = value * inverse_growth + cashflow;
        scale = scale * inverse_growth + cashflow.abs();
    }
    RootSample::new(value, scale)
}

fn rate_sample(
    periods: f64,
    payment: f64,
    present_value: f64,
    future_value: f64,
    timing: bool,
    x: f64,
) -> Result<RootSample, FormulaError> {
    if x == 0.0 {
        let payment_term = payment * periods;
        let value = present_value + future_value + payment_term;
        let scale = present_value.abs() + future_value.abs() + payment_term.abs();
        return RootSample::new(value, scale);
    }

    let rate = x.exp_m1();
    let exponent = periods * x;
    let (present_term, future_term, annuity) = if exponent > 0.0 {
        let numerator = -(-exponent).exp_m1();
        let annuity = if timing {
            numerator / -(-x).exp_m1()
        } else {
            numerator / rate
        };
        (
            present_value,
            future_value * (-exponent).exp(),
            annuity,
        )
    } else {
        let annuity = if timing {
            exponent.exp_m1() / -(-x).exp_m1()
        } else {
            exponent.exp_m1() / rate
        };
        (
            present_value * exponent.exp(),
            future_value,
            annuity,
        )
    };
    let payment_term = if payment == 0.0 {
        0.0
    } else {
        payment * annuity
    };
    RootSample::new(
        present_term + future_term + payment_term,
        present_term.abs() + future_term.abs() + payment_term.abs(),
    )
}

#[derive(Clone, Copy)]
struct RootBracket {
    low_x: f64,
    low: RootSample,
    high_x: f64,
    high: RootSample,
}

fn solve_root(
    guess: f64,
    mut sample: impl FnMut(f64) -> Result<RootSample, FormulaError>,
) -> Result<f64, FormulaError> {
    if guess <= -1.0 {
        return Err(FormulaError::Num);
    }
    let initial_x = guess.ln_1p();
    if !initial_x.is_finite() || !(ROOT_X_MIN..=ROOT_X_MAX).contains(&initial_x) {
        return Err(FormulaError::Num);
    }

    let initial = sample(initial_x)?;
    if initial.converged() {
        return rate_from_x(initial_x);
    }

    let mut left_x = initial_x;
    let mut left = initial;
    let mut right_x = initial_x;
    let mut right = initial;
    let mut step = 0.125;
    for _ in 0..ROOT_BRACKET_STEPS {
        let mut left_bracket = None;
        let next_left_x = (left_x - step).max(ROOT_X_MIN);
        if next_left_x < left_x {
            let next_left = sample(next_left_x)?;
            if next_left.converged() {
                return rate_from_x(next_left_x);
            }
            if opposite_signs(next_left, left) {
                left_bracket = Some(RootBracket {
                    low_x: next_left_x,
                    low: next_left,
                    high_x: left_x,
                    high: left,
                });
            }
            left_x = next_left_x;
            left = next_left;
        }

        let mut right_bracket = None;
        let next_right_x = (right_x + step).min(ROOT_X_MAX);
        if next_right_x > right_x {
            let next_right = sample(next_right_x)?;
            if next_right.converged() {
                return rate_from_x(next_right_x);
            }
            if opposite_signs(right, next_right) {
                right_bracket = Some(RootBracket {
                    low_x: right_x,
                    low: right,
                    high_x: next_right_x,
                    high: next_right,
                });
            }
            right_x = next_right_x;
            right = next_right;
        }

        if let Some(bracket) = choose_bracket(left_bracket, right_bracket, initial_x) {
            return solve_bracket(bracket, &mut sample);
        }
        if left_x == ROOT_X_MIN && right_x == ROOT_X_MAX {
            break;
        }
        step *= 2.0;
    }
    Err(FormulaError::Num)
}

fn choose_bracket(
    left: Option<RootBracket>,
    right: Option<RootBracket>,
    initial_x: f64,
) -> Option<RootBracket> {
    match (left, right) {
        (Some(left), Some(right)) => {
            if bracket_distance(left, initial_x) <= bracket_distance(right, initial_x) {
                Some(left)
            } else {
                Some(right)
            }
        }
        (Some(bracket), None) | (None, Some(bracket)) => Some(bracket),
        (None, None) => None,
    }
}

fn bracket_distance(bracket: RootBracket, initial_x: f64) -> f64 {
    let estimate = secant_candidate(bracket).unwrap_or((bracket.low_x + bracket.high_x) * 0.5);
    (estimate - initial_x).abs()
}

fn solve_bracket(
    mut bracket: RootBracket,
    sample: &mut impl FnMut(f64) -> Result<RootSample, FormulaError>,
) -> Result<f64, FormulaError> {
    for _ in 0..ROOT_SOLVE_STEPS {
        let width = bracket.high_x - bracket.low_x;
        let tolerance = ROOT_X_ABS_TOLERANCE
            + ROOT_X_REL_TOLERANCE * bracket.low_x.abs().max(bracket.high_x.abs());
        if width <= tolerance {
            let midpoint = (bracket.low_x + bracket.high_x) * 0.5;
            if sample(midpoint)?.converged() {
                return rate_from_x(midpoint);
            }
            return Err(FormulaError::Num);
        }

        let lower_third = bracket.low_x + width / 3.0;
        let upper_third = bracket.high_x - width / 3.0;
        let candidate = secant_candidate(bracket)
            .filter(|candidate| *candidate >= lower_third && *candidate <= upper_third)
            .unwrap_or((bracket.low_x + bracket.high_x) * 0.5);
        let candidate_sample = sample(candidate)?;
        if candidate_sample.converged() {
            return rate_from_x(candidate);
        }
        if opposite_signs(bracket.low, candidate_sample) {
            bracket.high_x = candidate;
            bracket.high = candidate_sample;
        } else {
            bracket.low_x = candidate;
            bracket.low = candidate_sample;
        }
    }
    Err(FormulaError::Num)
}

fn secant_candidate(bracket: RootBracket) -> Option<f64> {
    if !bracket.low.value.is_finite() || !bracket.high.value.is_finite() {
        return None;
    }
    let scale = bracket.low.value.abs().max(bracket.high.value.abs());
    if scale == 0.0 {
        return None;
    }
    let low = bracket.low.value / scale;
    let high = bracket.high.value / scale;
    let denominator = high - low;
    if denominator == 0.0 {
        return None;
    }
    let candidate =
        bracket.low_x - low * (bracket.high_x - bracket.low_x) / denominator;
    candidate.is_finite().then_some(candidate)
}

fn opposite_signs(left: RootSample, right: RootSample) -> bool {
    left.value.is_sign_positive() != right.value.is_sign_positive()
}

fn rate_from_x(x: f64) -> Result<f64, FormulaError> {
    let rate = x.exp_m1();
    if rate.is_finite() && rate > -1.0 {
        Ok(rate)
    } else {
        Err(FormulaError::Num)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scalar_args(args: impl IntoIterator<Item = Value>) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for value in args {
            values.push_scalar(value).unwrap();
            values.finish_arg(1, 1).unwrap();
        }
        values
    }

    fn number_args(args: impl IntoIterator<Item = f64>) -> FuncAccumulator {
        scalar_args(args.into_iter().map(Value::Number))
    }

    fn irr_args(
        cashflows: impl IntoIterator<Item = f64>,
        guess: Option<f64>,
    ) -> FuncAccumulator {
        let cashflows: Vec<f64> = cashflows.into_iter().collect();
        let mut values = FuncAccumulator::default();
        for cashflow in cashflows {
            values.push_range(Value::Number(cashflow)).unwrap();
        }
        values.finish_arg(1, values.len()).unwrap();
        if let Some(guess) = guess {
            values.push_scalar(Value::Number(guess)).unwrap();
            values.finish_arg(1, 1).unwrap();
        }
        values
    }

    fn result_number(func: Func, values: &FuncAccumulator) -> f64 {
        match apply(func, values).unwrap() {
            Value::Number(value) => value,
            value => panic!("expected number, got {value:?}"),
        }
    }

    fn assert_close(actual: f64, expected: f64) {
        let tolerance = 1e-10 * expected.abs().max(1.0);
        assert!(
            (actual - expected).abs() <= tolerance,
            "{actual} differs from {expected} by more than {tolerance}"
        );
    }

    fn assert_error(func: Func, values: &FuncAccumulator, expected: FormulaError) {
        assert_eq!(apply(func, values), Some(Value::Error(expected)));
    }

    #[test]
    fn computes_normal_financial_values() {
        assert_close(
            result_number(Func::Pv, &number_args([0.1, 5.0, 100.0])),
            -379.0786769408448,
        );
        assert_close(
            result_number(Func::Fv, &number_args([0.1, 5.0, 100.0])),
            -610.51,
        );
        assert_close(
            result_number(Func::Pmt, &number_args([0.1, 5.0, 1000.0])),
            -263.79748079474524,
        );
        assert_close(
            result_number(Func::Npv, &number_args([0.1, 100.0, 200.0])),
            256.198347107438,
        );
        assert_close(
            result_number(
                Func::Irr,
                &irr_args(
                    [-70_000.0, 12_000.0, 15_000.0, 18_000.0, 21_000.0, 26_000.0],
                    None,
                ),
            ),
            0.08663094803653158,
        );
        assert_close(
            result_number(Func::Rate, &number_args([10.0, -150.0, 1000.0])),
            0.08144165646436567,
        );
        assert_close(
            result_number(Func::Ipmt, &number_args([0.1, 1.0, 10.0, 1000.0])),
            -100.0,
        );
        assert_close(
            result_number(Func::Ppmt, &number_args([0.1, 1.0, 10.0, 1000.0])),
            -62.7453948825115,
        );
        assert_close(
            result_number(
                Func::Ipmt,
                &number_args([0.1, 1.5, 10.0, 1000.0]),
            ),
            -96.93746954780329,
        );
        assert_close(
            result_number(
                Func::Ppmt,
                &number_args([0.1, 1.5, 10.0, 1000.0]),
            ),
            -65.80792533470833,
        );
    }

    #[test]
    fn applies_defaults_and_cashflow_coercion() {
        let explicit = number_args([0.08, 24.0, -50.0, 1000.0, 0.0]);
        let defaults = number_args([0.08, 24.0, -50.0, 1000.0]);
        assert_close(
            result_number(Func::Fv, &defaults),
            result_number(Func::Fv, &explicit),
        );

        let mut npv_values = FuncAccumulator::default();
        npv_values.push_scalar(Value::Number(0.1)).unwrap();
        npv_values.finish_arg(1, 1).unwrap();
        npv_values.push_scalar(Value::Number(100.0)).unwrap();
        npv_values.finish_arg(1, 1).unwrap();
        npv_values.push_scalar(Value::Blank).unwrap();
        npv_values.finish_arg(1, 1).unwrap();
        npv_values.push_scalar(Value::Bool(true)).unwrap();
        npv_values.finish_arg(1, 1).unwrap();
        npv_values.push_range(Value::text("ignored")).unwrap();
        npv_values.push_range(Value::Bool(true)).unwrap();
        npv_values.push_range(Value::Number(200.0)).unwrap();
        npv_values.finish_arg(1, 3).unwrap();
        let expected = 100.0 / 1.1 + 1.0 / 1.1f64.powi(3) + 200.0 / 1.1f64.powi(4);
        assert_close(result_number(Func::Npv, &npv_values), expected);

        let mut irr_values = FuncAccumulator::default();
        irr_values.push_range(Value::Number(-100.0)).unwrap();
        irr_values.push_range(Value::Blank).unwrap();
        irr_values.push_range(Value::text("ignored")).unwrap();
        irr_values.push_range(Value::Bool(true)).unwrap();
        irr_values.push_range(Value::Number(121.0)).unwrap();
        irr_values.finish_arg(1, 5).unwrap();
        assert_close(result_number(Func::Irr, &irr_values), 0.21);

        assert_error(
            Func::Pv,
            &scalar_args([Value::text("bad"), Value::Number(2.0), Value::Number(3.0)]),
            FormulaError::Value,
        );
        assert_error(
            Func::Pv,
            &scalar_args([
                Value::Error(FormulaError::Ref),
                Value::Number(2.0),
                Value::Number(3.0),
            ]),
            FormulaError::Ref,
        );
    }

    #[test]
    fn handles_zero_rate_near_zero_rate_and_beginning_timing() {
        assert_close(
            result_number(Func::Pv, &number_args([0.0, 10.0, 100.0, 500.0])),
            -1500.0,
        );
        assert_close(
            result_number(Func::Fv, &number_args([0.0, 10.0, 100.0, 500.0])),
            -1500.0,
        );
        assert_close(
            result_number(Func::Pmt, &number_args([0.0, 10.0, 1000.0])),
            -100.0,
        );
        let near_zero_payment =
            result_number(Func::Pmt, &number_args([1e-14, 360.0, 250_000.0]));
        assert_close(near_zero_payment, -250_000.0 / 360.0);
        assert_close(
            result_number(
                Func::Ipmt,
                &number_args([0.1, 1.0, 10.0, 1000.0, 0.0, 7.0]),
            ),
            0.0,
        );
        assert_error(
            Func::Npv,
            &number_args([-1.0, 100.0]),
            FormulaError::DivZero,
        );
        assert_error(
            Func::Pmt,
            &number_args([0.0, 0.0, 1000.0]),
            FormulaError::DivZero,
        );
    }

    #[test]
    fn reports_invalid_periods_and_arity() {
        assert_error(
            Func::Ipmt,
            &number_args([0.1, 0.0, 10.0, 1000.0]),
            FormulaError::Num,
        );
        assert_error(
            Func::Ipmt,
            &number_args([0.1, 11.0, 10.0, 1000.0]),
            FormulaError::Num,
        );
        assert_error(
            Func::Ppmt,
            &number_args([0.1, 1.0, 0.0, 1000.0]),
            FormulaError::Num,
        );
        assert_error(
            Func::Rate,
            &number_args([0.0, -100.0, 1000.0]),
            FormulaError::Num,
        );
        assert_error(
            Func::Pv,
            &number_args([0.1, 10.0]),
            FormulaError::Value,
        );
    }

    #[test]
    fn reports_root_non_convergence() {
        assert_error(
            Func::Irr,
            &irr_args([-100.0, 50.0, -10.0], None),
            FormulaError::Num,
        );
        assert_error(
            Func::Rate,
            &number_args([10.0, 100.0, 1000.0]),
            FormulaError::Num,
        );
        assert_error(
            Func::Irr,
            &irr_args([-100.0, 110.0], Some(-1.0)),
            FormulaError::Num,
        );
    }

    #[test]
    fn present_and_future_value_are_inverse_properties() {
        for rate in [-0.25, -1e-12, 0.0, 0.01, 0.2] {
            for periods in [1.0, 6.0, 24.0] {
                for timing in [false, true] {
                    let present = 1234.5;
                    let payment = -37.25;
                    let future =
                        fv_value(rate, periods, payment, present, timing).unwrap();
                    let recovered =
                        pv_value(rate, periods, payment, future, timing).unwrap();
                    assert_close(recovered, present);
                }
            }
        }
    }

    #[test]
    fn payment_and_period_components_obey_amortization_properties() {
        for rate in [-0.05, -1e-12, 0.0, 0.01, 0.15] {
            for timing in [false, true] {
                let periods = 12.0;
                let present = 1000.0;
                let target_future = 250.0;
                let payment =
                    pmt_value(rate, periods, present, target_future, timing).unwrap();
                assert_close(
                    fv_value(rate, periods, payment, present, timing).unwrap(),
                    target_future,
                );
                for period in [1.0, 2.0, 6.0, 12.0] {
                    let interest = ipmt_value(
                        rate,
                        period,
                        periods,
                        present,
                        target_future,
                        timing,
                    )
                    .unwrap();
                    let principal = payment - interest;
                    assert_close(interest + principal, payment);
                }
            }
        }
    }

    #[test]
    fn irr_solves_generated_two_cashflow_properties() {
        for expected_rate in [-0.5, -1e-10, 0.0, 0.1, 2.0] {
            let values = irr_args(
                [-1000.0, 1000.0 * (1.0 + expected_rate)],
                Some(0.05),
            );
            assert_close(result_number(Func::Irr, &values), expected_rate);
        }

        let underflow_regression =
            irr_args([0.0, 0.0, 1.0, -2.0], Some(ROOT_X_MAX.exp_m1()));
        assert_close(
            result_number(Func::Irr, &underflow_regression),
            1.0,
        );
    }
}
