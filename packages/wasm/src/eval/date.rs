//! Excel serial date conversion, parsing, and formatting.

use crate::types::FormulaError;
use crate::calc::Func;
use crate::types::{EvalResult, Value};

use super::functions::{integer_arg, number_arg, require_arity, text_arg, FuncAccumulator};

const UNIX_EPOCH_SERIAL: i64 = 25_569;

fn days_from_civil(mut year: i64, month: i64, day: i64) -> i64 {
    year -= i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = shifted_month + if shifted_month < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year, month, day)
}

pub(super) fn date_serial(mut year: i64, month: i64, day: i64) -> Result<f64, FormulaError> {
    if (0..=1899).contains(&year) {
        year += 1900;
    }
    let total_months = year
        .checked_mul(12)
        .and_then(|value| value.checked_add(month - 1))
        .ok_or(FormulaError::Num)?;
    let normalized_year = total_months.div_euclid(12);
    let normalized_month = total_months.rem_euclid(12) + 1;
    let first_day = days_from_civil(normalized_year, normalized_month, 1);
    let mut first_serial = first_day + UNIX_EPOCH_SERIAL;
    if (normalized_year, normalized_month) <= (1900, 2) {
        first_serial -= 1;
    }
    let serial = first_serial.checked_add(day - 1).ok_or(FormulaError::Num)?;
    let (result_year, _, _) = date_parts(serial as f64).ok_or(FormulaError::Num)?;
    if !(0..=9999).contains(&result_year) {
        return Err(FormulaError::Num);
    }
    Ok(serial as f64)
}

pub(super) fn date_parts(serial: f64) -> Option<(i64, i64, i64)> {
    if !serial.is_finite() {
        return None;
    }
    let days = serial.floor();
    if days < i64::MIN as f64 || days > i64::MAX as f64 {
        return None;
    }
    if days == 60.0 {
        return Some((1900, 2, 29));
    }
    let offset = if days < 60.0 {
        UNIX_EPOCH_SERIAL - 1
    } else {
        UNIX_EPOCH_SERIAL
    };
    let parts = civil_from_days(days as i64 - offset);
    (0..=9999).contains(&parts.0).then_some(parts)
}

fn exact_date(year: i64, month: i64, day: i64) -> Option<f64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let serial = date_serial(year, month, day).ok()?;
    (date_parts(serial) == Some((year, month, day))).then_some(serial)
}

pub(super) fn parse_date_value(text: &str) -> Option<f64> {
    let date = text.trim().split(['T', ' ']).next()?;
    if let Some((year, rest)) = date.split_once('-') {
        let (month, day) = rest.split_once('-')?;
        return exact_date(year.parse().ok()?, month.parse().ok()?, day.parse().ok()?);
    }
    let mut parts = date.split('/');
    let first: i64 = parts.next()?.parse().ok()?;
    let second: i64 = parts.next()?.parse().ok()?;
    let year: i64 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let (month, day) = if first > 12 && second <= 12 {
        (second, first)
    } else if first <= 12 {
        (first, second)
    } else {
        return None;
    };
    exact_date(year, month, day)
}

pub(super) fn format_date_serial(serial: f64, format: &str) -> Option<String> {
    let (year, month, day) = date_parts(serial)?;
    let total_seconds = ((serial.rem_euclid(1.0) * 86_400.0).round() as u32) % 86_400;
    let hour = total_seconds / 3_600;
    let minute = total_seconds % 3_600 / 60;
    let second = total_seconds % 60;
    match format.to_ascii_lowercase().as_str() {
        "yyyy-mm-dd" => Some(format!("{year:04}-{month:02}-{day:02}")),
        "yyyy/mm/dd" => Some(format!("{year:04}/{month:02}/{day:02}")),
        "mm/dd/yyyy" => Some(format!("{month:02}/{day:02}/{year:04}")),
        "dd/mm/yyyy" => Some(format!("{day:02}/{month:02}/{year:04}")),
        "m/d/yyyy" => Some(format!("{month}/{day}/{year:04}")),
        "yyyy-mm-dd hh:mm" => Some(format!(
            "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}"
        )),
        "yyyy-mm-dd hh:mm:ss" => Some(format!(
            "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"
        )),
        "hh:mm" => Some(format!("{hour:02}:{minute:02}")),
        "hh:mm:ss" => Some(format!("{hour:02}:{minute:02}:{second:02}")),
        _ => None,
    }
}

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Date => {
            if let Err(error) = require_arity(values, 3, 3) {
                Value::Error(error)
            } else {
                match (
                    integer_arg(values, 0, None),
                    integer_arg(values, 1, None),
                    integer_arg(values, 2, None),
                ) {
                    (Ok(year), Ok(month), Ok(day)) => {
                        date_serial(year, month, day).map_or_else(Value::Error, Value::number)
                    }
                    (Err(error), _, _) | (_, Err(error), _) | (_, _, Err(error)) => {
                        Value::Error(error)
                    }
                }
            }
        }
        Func::DateValue => {
            if let Err(error) = require_arity(values, 1, 1) {
                Value::Error(error)
            } else {
                match text_arg(values, 0, None)
                    .and_then(|text| parse_date_value(&text).ok_or(FormulaError::Value))
                {
                    Ok(serial) => Value::number(serial),
                    Err(error) => Value::Error(error),
                }
            }
        }
        Func::Day | Func::Month | Func::Year => {
            if let Err(error) = require_arity(values, 1, 1) {
                Value::Error(error)
            } else {
                match number_arg(values, 0, None) {
                    Ok(serial) => match date_parts(serial) {
                        Some((year, month, day)) => Value::number(match func {
                            Func::Day => day as f64,
                            Func::Month => month as f64,
                            Func::Year => year as f64,
                            _ => unreachable!(),
                        }),
                        None => Value::Error(FormulaError::Num),
                    },
                    Err(error) => Value::Error(error),
                }
            }
        }
        _ => return None,
    };
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::{date_serial, format_date_serial, parse_date_value};

    #[test]
    fn parses_day_first_dates_and_formats_time_components() {
        let serial = date_serial(2024, 12, 31).unwrap();
        assert_eq!(parse_date_value("31/12/2024"), Some(serial));
        assert_eq!(parse_date_value("31/13/2024"), None);
        assert_eq!(parse_date_value("12/31/2024/extra"), None);
        assert_eq!(
            format_date_serial(serial + 0.5, "yyyy-mm-dd hh:mm:ss").as_deref(),
            Some("2024-12-31 12:00:00")
        );
    }
}
