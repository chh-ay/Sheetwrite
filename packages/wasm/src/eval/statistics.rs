//! Statistical function family dispatch.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};

use super::criteria::Criterion;
use super::functions::{
    integer_arg, number_arg, numeric_entries, require_arity, FuncAccumulator, FuncValue,
};

const MAX_SELECTION_VALUES: usize = RANGE_CELL_LIMIT as usize;
const MAX_CRITERIA_PAIRS: usize = 126;

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Median => aggregate_result(median(values)),
        Func::ModeSngl => aggregate_result(mode_sngl(values)),
        Func::Large => aggregate_result(large_small(values, false)),
        Func::Small => aggregate_result(large_small(values, true)),
        Func::RankEq => aggregate_result(rank_eq(values)),
        Func::PercentileInc => aggregate_result(percentile_inc(values)),
        Func::QuartileInc => aggregate_result(quartile_inc(values)),
        Func::StdevS => aggregate_result(variance_result(values, true, true)),
        Func::StdevP => aggregate_result(variance_result(values, false, true)),
        Func::VarS => aggregate_result(variance_result(values, true, false)),
        Func::VarP => aggregate_result(variance_result(values, false, false)),
        Func::GeoMean => aggregate_result(geomean(values)),
        Func::Correl => aggregate_result(paired_result(values, PairedKind::Correlation)),
        Func::CovarianceS => aggregate_result(paired_result(values, PairedKind::SampleCovariance)),
        Func::CovarianceP => {
            aggregate_result(paired_result(values, PairedKind::PopulationCovariance))
        }
        Func::CountBlank => count_blank(values),
        Func::MaxIfs => conditional_extreme(values, true),
        Func::MinIfs => conditional_extreme(values, false),
        _ => return None,
    };
    Some(result)
}

fn aggregate_result(result: Result<f64, FormulaError>) -> Value {
    result.map_or_else(Value::Error, Value::number)
}

fn collect_numbers(entries: &[FuncValue]) -> Result<Vec<f64>, FormulaError> {
    if entries.len() > MAX_SELECTION_VALUES {
        return Err(FormulaError::Num);
    }
    numeric_entries(entries)
}

fn require_at_least_one_arg(values: &FuncAccumulator) -> Result<(), FormulaError> {
    require_arity(values, 1, 254)
}

fn median(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let mut numbers = collect_numbers(values.entries())?;
    if numbers.is_empty() {
        return Ok(0.0);
    }
    let middle = numbers.len() / 2;
    let odd = middle * 2 != numbers.len();
    let (left, upper, _) = numbers.select_nth_unstable_by(middle, f64::total_cmp);
    if odd {
        return Ok(*upper);
    }
    let lower = left
        .iter()
        .copied()
        .max_by(f64::total_cmp)
        .ok_or(FormulaError::Num)?;
    Ok(lower * 0.5 + *upper * 0.5)
}

fn mode_sngl(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let mut numbers = collect_numbers(values.entries())?;
    if numbers.len() < 2 {
        return Err(FormulaError::Na);
    }
    numbers.sort_unstable_by(f64::total_cmp);
    let mut best_value = numbers[0];
    let mut best_count = 1usize;
    let mut run_count = 1usize;
    for index in 1..numbers.len() {
        if numbers[index] == numbers[index - 1] {
            run_count += 1;
        } else {
            if run_count > best_count {
                best_count = run_count;
                best_value = numbers[index - 1];
            }
            run_count = 1;
        }
    }
    if run_count > best_count {
        best_count = run_count;
        best_value = *numbers.last().unwrap_or(&best_value);
    }
    if best_count < 2 {
        Err(FormulaError::Na)
    } else {
        Ok(best_value)
    }
}

fn large_small(values: &FuncAccumulator, ascending: bool) -> Result<f64, FormulaError> {
    require_arity(values, 2, 2)?;
    let mut numbers = collect_numbers(values.arg(0).unwrap_or_default())?;
    let k = usize::try_from(integer_arg(values, 1, None)?)
        .map_err(|_| FormulaError::Num)?;
    if k == 0 || k > numbers.len() {
        return Err(FormulaError::Num);
    }
    let index = if ascending {
        k - 1
    } else {
        numbers.len() - k
    };
    let (_, selected, _) = numbers.select_nth_unstable_by(index, f64::total_cmp);
    Ok(*selected)
}

fn rank_eq(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 3)?;
    let target = number_arg(values, 0, None)?;
    let numbers = collect_numbers(values.arg(1).unwrap_or_default())?;
    if numbers.is_empty() {
        return Err(FormulaError::Na);
    }
    if !numbers.contains(&target) {
        return Err(FormulaError::Na);
    }
    let ascending = number_arg(values, 2, Some(0.0))? != 0.0;
    let before = numbers
        .iter()
        .filter(|&&value| {
            if ascending {
                value < target
            } else {
                value > target
            }
        })
        .count();
    Ok((before + 1) as f64)
}

fn percentile_inc(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 2)?;
    let numbers = collect_numbers(values.arg(0).unwrap_or_default())?;
    percentile(numbers, number_arg(values, 1, None)?)
}

fn quartile_inc(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 2)?;
    let quartile = integer_arg(values, 1, None)?;
    if !(0..=4).contains(&quartile) {
        return Err(FormulaError::Num);
    }
    let numbers = collect_numbers(values.arg(0).unwrap_or_default())?;
    percentile(numbers, quartile as f64 * 0.25)
}

fn percentile(mut numbers: Vec<f64>, fraction: f64) -> Result<f64, FormulaError> {
    if numbers.is_empty() || !(0.0..=1.0).contains(&fraction) {
        return Err(FormulaError::Num);
    }
    let rank = (numbers.len() - 1) as f64 * fraction;
    let lower_index = rank.floor() as usize;
    let interpolation = rank - lower_index as f64;
    let (_, lower, right) = numbers.select_nth_unstable_by(lower_index, f64::total_cmp);
    if interpolation == 0.0 {
        return Ok(*lower);
    }
    let lower = *lower;
    let upper = right
        .iter()
        .copied()
        .min_by(f64::total_cmp)
        .ok_or(FormulaError::Num)?;
    Ok(lower * (1.0 - interpolation) + upper * interpolation)
}

#[derive(Default)]
struct Moments {
    count: usize,
    mean: f64,
    m2: f64,
}

impl Moments {
    fn push(&mut self, value: f64) -> Result<(), FormulaError> {
        self.count += 1;
        let delta = value - self.mean;
        self.mean += delta / self.count as f64;
        self.m2 += delta * (value - self.mean);
        if self.mean.is_finite() && self.m2.is_finite() {
            Ok(())
        } else {
            Err(FormulaError::Num)
        }
    }
}

fn variance_result(
    values: &FuncAccumulator,
    sample: bool,
    standard_deviation: bool,
) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let mut moments = Moments::default();
    for value in collect_numbers(values.entries())? {
        moments.push(value)?;
    }
    let divisor = if sample {
        if moments.count < 2 {
            return Err(FormulaError::DivZero);
        }
        moments.count - 1
    } else {
        if moments.count == 0 {
            return Err(FormulaError::DivZero);
        }
        moments.count
    };
    let variance = (moments.m2 / divisor as f64).max(0.0);
    Ok(if standard_deviation {
        variance.sqrt()
    } else {
        variance
    })
}

fn geomean(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let numbers = collect_numbers(values.entries())?;
    if numbers.is_empty() || numbers.iter().any(|&value| value <= 0.0) {
        return Err(FormulaError::Num);
    }
    let mut sum = 0.0;
    let mut correction = 0.0;
    for value in numbers.iter().copied() {
        let logarithm = value.ln();
        let adjusted = logarithm - correction;
        let next = sum + adjusted;
        correction = (next - sum) - adjusted;
        sum = next;
    }
    let result = (sum / numbers.len() as f64).exp();
    if result.is_finite() {
        Ok(result)
    } else {
        Err(FormulaError::Num)
    }
}

#[derive(Clone, Copy)]
enum PairedKind {
    Correlation,
    SampleCovariance,
    PopulationCovariance,
}

#[derive(Default)]
struct PairedMoments {
    count: usize,
    mean_x: f64,
    mean_y: f64,
    m2_x: f64,
    m2_y: f64,
    co_moment: f64,
}

impl PairedMoments {
    fn push(&mut self, x: f64, y: f64) -> Result<(), FormulaError> {
        self.count += 1;
        let divisor = self.count as f64;
        let delta_x = x - self.mean_x;
        let delta_y = y - self.mean_y;
        self.mean_x += delta_x / divisor;
        self.mean_y += delta_y / divisor;
        self.m2_x += delta_x * (x - self.mean_x);
        self.m2_y += delta_y * (y - self.mean_y);
        self.co_moment += delta_x * (y - self.mean_y);
        if self.mean_x.is_finite()
            && self.mean_y.is_finite()
            && self.m2_x.is_finite()
            && self.m2_y.is_finite()
            && self.co_moment.is_finite()
        {
            Ok(())
        } else {
            Err(FormulaError::Num)
        }
    }
}

fn paired_result(values: &FuncAccumulator, kind: PairedKind) -> Result<f64, FormulaError> {
    require_arity(values, 2, 2)?;
    let left = values.arg(0).unwrap_or_default();
    let right = values.arg(1).unwrap_or_default();
    if left.len() != right.len() {
        return Err(FormulaError::Na);
    }
    let mut moments = PairedMoments::default();
    for (left, right) in left.iter().zip(right) {
        match (&left.value, &right.value) {
            (Value::Error(error), _) | (_, Value::Error(error)) => return Err(*error),
            (Value::Number(x), Value::Number(y)) if x.is_finite() && y.is_finite() => {
                moments.push(*x, *y)?;
            }
            (Value::Number(_), Value::Number(_)) => return Err(FormulaError::Num),
            _ => {}
        }
    }
    match kind {
        PairedKind::Correlation => {
            if moments.count < 2 || moments.m2_x <= 0.0 || moments.m2_y <= 0.0 {
                return Err(FormulaError::DivZero);
            }
            let result = moments.co_moment / moments.m2_x.sqrt() / moments.m2_y.sqrt();
            if result.is_finite() {
                Ok(result.clamp(-1.0, 1.0))
            } else {
                Err(FormulaError::Num)
            }
        }
        PairedKind::SampleCovariance => {
            if moments.count < 2 {
                Err(FormulaError::DivZero)
            } else {
                Ok(moments.co_moment / (moments.count - 1) as f64)
            }
        }
        PairedKind::PopulationCovariance => {
            if moments.count == 0 {
                Err(FormulaError::DivZero)
            } else {
                Ok(moments.co_moment / moments.count as f64)
            }
        }
    }
}

fn count_blank(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    Value::number(
        values
            .arg(0)
            .unwrap_or_default()
            .iter()
            .filter(|entry| {
                matches!(entry.value, Value::Blank)
                    || matches!(&entry.value, Value::Text(text) if text.is_empty())
            })
            .count() as f64,
    )
}

fn conditional_extreme(values: &FuncAccumulator, maximum: bool) -> Value {
    let arg_count = values.arg_count();
    if arg_count < 3 || arg_count % 2 == 0 || (arg_count - 1) / 2 > MAX_CRITERIA_PAIRS {
        return Value::Error(FormulaError::Value);
    }
    let target = values.arg(0).unwrap_or_default();
    let target_shape = values.arg_shape(0);
    let mut criteria = Vec::new();
    if criteria.try_reserve((arg_count - 1) / 2).is_err() {
        return Value::Error(FormulaError::Num);
    }
    for pair in (1..arg_count).step_by(2) {
        let range = values.arg(pair).unwrap_or_default();
        if values.arg_shape(pair) != target_shape {
            return Value::Error(FormulaError::Value);
        }
        let Some(criterion) = values.arg_value(pair + 1) else {
            return Value::Error(FormulaError::Value);
        };
        criteria.push((range, Criterion::parse(criterion.clone())));
    }

    let mut result: Option<f64> = None;
    for (index, entry) in target.iter().enumerate() {
        if !criteria
            .iter()
            .all(|(range, criterion)| criterion.matches(&range[index].value))
        {
            continue;
        }
        match entry.value {
            Value::Number(value) if value.is_finite() => {
                result = Some(match result {
                    Some(current) if maximum => current.max(value),
                    Some(current) => current.min(value),
                    None => value,
                });
            }
            Value::Number(_) => return Value::Error(FormulaError::Num),
            Value::Error(error) => return Value::Error(error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
    }
    Value::number(result.unwrap_or(0.0))
}

#[cfg(test)]
mod tests {
    use crate::calc::Func;
    use crate::types::{FormulaError, Value};

    use super::{apply, FuncAccumulator};

    fn accumulator(args: &[Vec<Value>]) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for arg in args {
            for value in arg {
                values.push_range(value.clone()).unwrap();
            }
            values.finish_arg(arg.len(), 1).unwrap();
        }
        values
    }

    fn shaped_accumulator(args: &[(Vec<Value>, usize, usize)]) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for (arg, rows, cols) in args {
            for value in arg {
                values.push_range(value.clone()).unwrap();
            }
            values.finish_arg(*rows, *cols).unwrap();
        }
        values
    }

    fn scalar(value: f64) -> Vec<Value> {
        vec![Value::number(value)]
    }

    fn result(func: Func, args: &[Vec<Value>]) -> Value {
        apply(func, &accumulator(args)).unwrap()
    }

    fn assert_near(actual: Value, expected: f64) {
        let Value::Number(actual) = actual else {
            panic!("expected number, got {actual:?}");
        };
        assert!((actual - expected).abs() <= 1e-12 * expected.abs().max(1.0));
    }

    #[test]
    fn order_statistics_cover_boundaries_and_ties() {
        let data = vec![5.0, 1.0, 3.0, 3.0]
            .into_iter()
            .map(Value::number)
            .collect::<Vec<_>>();
        assert_near(result(Func::Median, &[data.clone()]), 3.0);
        assert_near(result(Func::ModeSngl, &[data.clone()]), 3.0);
        assert_near(result(Func::Large, &[data.clone(), scalar(2.0)]), 3.0);
        assert_near(result(Func::Small, &[data.clone(), scalar(1.0)]), 1.0);
        assert_eq!(
            result(Func::Large, &[data.clone(), scalar(0.0)]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            result(Func::Small, &[data.clone(), scalar(i64::MAX as f64)]),
            Value::Error(FormulaError::Num)
        );
        assert_near(
            result(Func::PercentileInc, &[data.clone(), scalar(0.25)]),
            2.5,
        );
        assert_near(result(Func::QuartileInc, &[data, scalar(3.0)]), 3.5);
    }

    #[test]
    fn rank_requires_the_target_in_both_orders() {
        let data = vec![Value::number(5.0), Value::number(3.0), Value::number(1.0)];
        assert_eq!(
            result(Func::RankEq, &[scalar(3.0), data.clone()]),
            Value::number(2.0)
        );
        assert_eq!(
            result(
                Func::RankEq,
                &[scalar(3.0), data.clone(), scalar(1.0)],
            ),
            Value::number(2.0)
        );
        for order in [0.0, 1.0] {
            assert_eq!(
                result(
                    Func::RankEq,
                    &[scalar(4.0), data.clone(), scalar(order)],
                ),
                Value::Error(FormulaError::Na)
            );
        }
    }

    #[test]
    fn percentile_is_monotone_and_stays_inside_the_sample() {
        let data = vec![9.0, -2.0, 4.0, 20.0, 4.0]
            .into_iter()
            .map(Value::number)
            .collect::<Vec<_>>();
        let mut previous = -2.0;
        for step in 0..=100 {
            let Value::Number(current) = result(
                Func::PercentileInc,
                &[data.clone(), scalar(step as f64 / 100.0)],
            ) else {
                panic!("percentile returned an error");
            };
            assert!((-2.0..=20.0).contains(&current));
            assert!(current >= previous);
            previous = current;
        }
    }

    #[test]
    fn stable_moments_preserve_small_spread_on_large_offsets() {
        let data = vec![1_000_000_000_001.0, 1_000_000_000_002.0, 1_000_000_000_003.0]
            .into_iter()
            .map(Value::number)
            .collect::<Vec<_>>();
        assert_near(result(Func::VarS, &[data.clone()]), 1.0);
        assert_near(result(Func::VarP, &[data.clone()]), 2.0 / 3.0);
        assert_near(result(Func::StdevS, &[data.clone()]), 1.0);
        assert_near(result(Func::GeoMean, &[data]), 1_000_000_000_002.0);
    }

    #[test]
    fn paired_statistics_enforce_shape_and_pairwise_numeric_values() {
        let left = vec![Value::number(1.0), Value::text("ignored"), Value::number(3.0)];
        let right = vec![Value::number(2.0), Value::number(9.0), Value::number(6.0)];
        assert_near(result(Func::Correl, &[left.clone(), right.clone()]), 1.0);
        assert_near(result(Func::CovarianceP, &[left.clone(), right.clone()]), 2.0);
        assert_near(result(Func::CovarianceS, &[left, right]), 4.0);
        assert_eq!(
            result(Func::Correl, &[scalar(1.0), vec![Value::number(1.0), Value::number(2.0)]]),
            Value::Error(FormulaError::Na)
        );
    }

    #[test]
    fn conditional_extremes_share_criteria_and_require_equal_shapes() {
        let target = vec![Value::number(-4.0), Value::number(8.0), Value::number(3.0)];
        let groups = vec![Value::text("west"), Value::text("east"), Value::text("west")];
        assert_near(
            result(
                Func::MaxIfs,
                &[target.clone(), groups.clone(), vec![Value::text("w*")]],
            ),
            3.0,
        );
        assert_near(
            result(
                Func::MinIfs,
                &[target, groups, vec![Value::text("w*")]],
            ),
            -4.0,
        );
        assert_eq!(
            result(
                Func::MaxIfs,
                &[scalar(1.0), vec![Value::number(1.0), Value::number(2.0)], scalar(1.0)],
            ),
            Value::Error(FormulaError::Value)
        );
        let shape_mismatch = shaped_accumulator(&[
            (
                vec![
                    Value::number(1.0),
                    Value::number(2.0),
                    Value::number(3.0),
                    Value::number(4.0),
                ],
                2,
                2,
            ),
            (
                vec![
                    Value::text("x"),
                    Value::text("x"),
                    Value::text("x"),
                    Value::text("x"),
                ],
                1,
                4,
            ),
            (vec![Value::text("x")], 1, 1),
        ]);
        assert_eq!(
            apply(Func::MaxIfs, &shape_mismatch).unwrap(),
            Value::Error(FormulaError::Value)
        );
    }

    #[test]
    fn blank_count_includes_empty_text_but_not_errors() {
        let values = vec![
            Value::Blank,
            Value::text(""),
            Value::text("x"),
            Value::Error(FormulaError::Na),
        ];
        assert_near(result(Func::CountBlank, &[values]), 2.0);
    }
}
