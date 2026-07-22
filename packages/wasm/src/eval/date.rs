//! Excel serial date conversion, parsing, and formatting.

use crate::calc::Func;
use crate::types::FormulaError;
use crate::types::{EvalResult, Value};

use super::functions::{
    bool_arg, integer_arg, number_arg, require_arity, text_arg, FuncAccumulator,
};
use super::value::number_from_value;

const UNIX_EPOCH_SERIAL: i64 = 25_569;
const SECONDS_PER_DAY: i64 = 86_400;
const MIN_SUPPORTED_SERIAL: i64 = -693_960;
const MAX_DATE_SERIAL: i64 = 2_958_465;
const MAX_DATE_SCAN: usize = MAX_DATE_SERIAL as usize + 1;
const MAX_TIME_COMPONENT: i64 = 32_767;

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
    let month_offset = month.checked_sub(1).ok_or(FormulaError::Num)?;
    let total_months = year
        .checked_mul(12)
        .and_then(|value| value.checked_add(month_offset))
        .ok_or(FormulaError::Num)?;
    let normalized_year = total_months.div_euclid(12);
    if !(0..=9999).contains(&normalized_year) {
        return Err(FormulaError::Num);
    }
    let normalized_month = total_months.rem_euclid(12) + 1;
    let first_day = days_from_civil(normalized_year, normalized_month, 1);
    let mut first_serial = first_day + UNIX_EPOCH_SERIAL;
    if (normalized_year, normalized_month) <= (1900, 2) {
        first_serial -= 1;
    }
    let day_offset = day.checked_sub(1).ok_or(FormulaError::Num)?;
    let serial = first_serial.checked_add(day_offset).ok_or(FormulaError::Num)?;
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
    if !(MIN_SUPPORTED_SERIAL as f64..=MAX_DATE_SERIAL as f64).contains(&days) {
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

fn parse_time_value(text: &str) -> Option<f64> {
    let mut raw = text.trim();
    let mut meridiem = None;
    if raw.len() >= 2 {
        if let Some(suffix) = raw.get(raw.len() - 2..) {
            if suffix.eq_ignore_ascii_case("am") || suffix.eq_ignore_ascii_case("pm") {
                meridiem = Some(suffix.eq_ignore_ascii_case("pm"));
                raw = raw.get(..raw.len() - 2)?.trim_end();
            }
        }
    }
    let time = raw.rsplit(['T', ' ']).next()?;
    let mut parts = time.split(':');
    let mut hour: i64 = parts.next()?.parse().ok()?;
    let minute: i64 = parts.next()?.parse().ok()?;
    let second: f64 = match parts.next() {
        Some(second) => second.parse().ok()?,
        None => 0.0,
    };
    if parts.next().is_some() || !(0..60).contains(&minute) || !(0.0..60.0).contains(&second) {
        return None;
    }
    match meridiem {
        Some(pm) => {
            if !(1..=12).contains(&hour) {
                return None;
            }
            hour %= 12;
            if pm {
                hour += 12;
            }
        }
        None if !(0..24).contains(&hour) => return None,
        None => {}
    }
    Some((hour as f64 * 3_600.0 + minute as f64 * 60.0 + second) / SECONDS_PER_DAY as f64)
}

fn temporal_serial(value: &Value) -> Result<f64, FormulaError> {
    let serial = match value {
        Value::Text(text) => {
            let trimmed = text.trim();
            if let Ok(number) = trimmed.parse::<f64>() {
                number
            } else if let Some(time) = parse_time_value(trimmed) {
                parse_date_value(trimmed).map_or(time, |date| date.floor() + time)
            } else {
                parse_date_value(trimmed).ok_or(FormulaError::Value)?
            }
        }
        _ => number_from_value(value)?,
    };
    if serial.is_finite() && serial >= 0.0 {
        Ok(serial)
    } else {
        Err(FormulaError::Num)
    }
}

fn serial_date_arg(values: &FuncAccumulator, index: usize) -> Result<i64, FormulaError> {
    let value = values.arg_value(index).ok_or(FormulaError::Value)?;
    let serial = match value {
        Value::Text(text) => parse_date_value(text)
            .or_else(|| text.trim().parse::<f64>().ok())
            .ok_or(FormulaError::Value)?,
        _ => number_from_value(value)?,
    };
    if !serial.is_finite() {
        return Err(FormulaError::Num);
    }
    let serial = serial.floor();
    if !(0.0..=MAX_DATE_SERIAL as f64).contains(&serial) {
        return Err(FormulaError::Num);
    }
    Ok(serial as i64)
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

fn days_in_month(year: i64, month: i64) -> i64 {
    if year == 1900 && month == 2 {
        return 29;
    }
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    days_from_civil(next_year, next_month, 1) - days_from_civil(year, month, 1)
}

fn is_leap_year(year: i64) -> bool {
    year == 1900 || (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0))
}

fn add_months(serial: i64, months: i64, end_of_month: bool) -> Result<f64, FormulaError> {
    let (year, month, day) = date_parts(serial as f64).ok_or(FormulaError::Num)?;
    let total_months = year
        .checked_mul(12)
        .and_then(|value| value.checked_add(month - 1))
        .and_then(|value| value.checked_add(months))
        .ok_or(FormulaError::Num)?;
    let target_year = total_months.div_euclid(12);
    let target_month = total_months.rem_euclid(12) + 1;
    if !(0..=9999).contains(&target_year) {
        return Err(FormulaError::Num);
    }
    let target_day = if end_of_month {
        days_in_month(target_year, target_month)
    } else {
        day.min(days_in_month(target_year, target_month))
    };
    let result = exact_date(target_year, target_month, target_day).ok_or(FormulaError::Num)?;
    if (0.0..=MAX_DATE_SERIAL as f64).contains(&result) {
        Ok(result)
    } else {
        Err(FormulaError::Num)
    }
}

fn sunday_zero_weekday(serial: i64) -> Result<i64, FormulaError> {
    let (year, month, day) = date_parts(serial as f64).ok_or(FormulaError::Num)?;
    if (year, month, day) == (1900, 2, 29) {
        return Ok((days_from_civil(1900, 2, 28) + 5).rem_euclid(7));
    }
    Ok((days_from_civil(year, month, day) + 4).rem_euclid(7))
}

fn weekday_number(serial: i64, return_type: i64) -> Result<i64, FormulaError> {
    let weekday = sunday_zero_weekday(serial)?;
    match return_type {
        1 => Ok(weekday + 1),
        2 | 11 => Ok((weekday - 1).rem_euclid(7) + 1),
        3 => Ok((weekday - 1).rem_euclid(7)),
        12..=17 => {
            let first_day = return_type - 10;
            Ok((weekday - first_day).rem_euclid(7) + 1)
        }
        _ => Err(FormulaError::Num),
    }
}

fn iso_week_number(serial: i64) -> Result<i64, FormulaError> {
    let (year, month, day) = date_parts(serial as f64).ok_or(FormulaError::Num)?;
    let days = if (year, month, day) == (1900, 2, 29) {
        days_from_civil(1900, 3, 1)
    } else {
        days_from_civil(year, month, day)
    };
    let monday_zero = (days + 3).rem_euclid(7);
    let thursday = days + 3 - monday_zero;
    let (iso_year, _, _) = civil_from_days(thursday);
    let january_fourth = days_from_civil(iso_year, 1, 4);
    let week_one_monday = january_fourth - (january_fourth + 3).rem_euclid(7);
    Ok((thursday - week_one_monday) / 7 + 1)
}

fn week_number(serial: i64, return_type: i64) -> Result<i64, FormulaError> {
    if return_type == 21 {
        return iso_week_number(serial);
    }
    let first_day = match return_type {
        1 | 17 => 0,
        2 | 11 => 1,
        12..=16 => return_type - 10,
        _ => return Err(FormulaError::Num),
    };
    let (year, _, _) = date_parts(serial as f64).ok_or(FormulaError::Num)?;
    let year_start = exact_date(year, 1, 1).ok_or(FormulaError::Num)? as i64;
    let ordinal = serial - year_start;
    let offset = (sunday_zero_weekday(year_start)? - first_day).rem_euclid(7);
    Ok((ordinal + offset) / 7 + 1)
}

fn is_workday(serial: i64) -> Result<bool, FormulaError> {
    Ok(!matches!(sunday_zero_weekday(serial)?, 0 | 6))
}

fn holiday_serials(values: &FuncAccumulator, index: usize) -> Result<Vec<i64>, FormulaError> {
    let Some(entries) = values.arg(index) else {
        return Ok(Vec::new());
    };
    let mut holidays = Vec::new();
    holidays
        .try_reserve(entries.len())
        .map_err(|_| FormulaError::Num)?;
    for entry in entries {
        let serial = match &entry.value {
            Value::Blank => continue,
            Value::Text(text) if text.trim().is_empty() => continue,
            Value::Text(text) => parse_date_value(text)
                .or_else(|| text.trim().parse::<f64>().ok())
                .ok_or(FormulaError::Value)?,
            Value::Error(error) => return Err(*error),
            value => number_from_value(value)?,
        };
        if !serial.is_finite() {
            return Err(FormulaError::Num);
        }
        let serial = serial.floor();
        if !(0.0..=MAX_DATE_SERIAL as f64).contains(&serial) {
            return Err(FormulaError::Num);
        }
        holidays.push(serial as i64);
    }
    holidays.sort_unstable();
    holidays.dedup();
    Ok(holidays)
}

fn workday(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 3)?;
    let mut current = serial_date_arg(values, 0)?;
    let days = integer_arg(values, 1, None)?;
    let holidays = holiday_serials(values, 2)?;
    if days == 0 {
        return Ok(current as f64);
    }
    if days.unsigned_abs() as usize > MAX_DATE_SCAN {
        return Err(FormulaError::Num);
    }
    let direction = days.signum();
    let mut remaining = days.unsigned_abs();
    let mut scanned = 0usize;
    while remaining != 0 {
        scanned += 1;
        if scanned > MAX_DATE_SCAN {
            return Err(FormulaError::Num);
        }
        current = current.checked_add(direction).ok_or(FormulaError::Num)?;
        if !(0..=MAX_DATE_SERIAL).contains(&current) {
            return Err(FormulaError::Num);
        }
        if is_workday(current)? && holidays.binary_search(&current).is_err() {
            remaining -= 1;
        }
    }
    Ok(current as f64)
}

fn cyclic_weekdays(start: i64, end: i64) -> Result<i64, FormulaError> {
    if start > end {
        return Ok(0);
    }
    let length = end - start + 1;
    let mut count = length / 7 * 5;
    let mut weekday = sunday_zero_weekday(start)?;
    for _ in 0..length % 7 {
        if !matches!(weekday, 0 | 6) {
            count += 1;
        }
        weekday = (weekday + 1) % 7;
    }
    Ok(count)
}

fn weekdays_inclusive(start: i64, end: i64) -> Result<i64, FormulaError> {
    if start > end {
        return Ok(0);
    }
    if start <= 60 && end >= 60 {
        let before = cyclic_weekdays(start, 59)?;
        let leap_day = i64::from(is_workday(60)?);
        let after = cyclic_weekdays(61, end)?;
        Ok(before + leap_day + after)
    } else {
        cyclic_weekdays(start, end)
    }
}

fn networkdays(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 3)?;
    let start = serial_date_arg(values, 0)?;
    let end = serial_date_arg(values, 1)?;
    let holidays = holiday_serials(values, 2)?;
    let (lower, upper, sign) = if start <= end {
        (start, end, 1i64)
    } else {
        (end, start, -1i64)
    };
    let mut count = weekdays_inclusive(lower, upper)?;
    for holiday in holidays {
        if holiday >= lower && holiday <= upper && is_workday(holiday)? {
            count -= 1;
        }
    }
    Ok((count * sign) as f64)
}

fn interval_has_leap_day(start: i64, end: i64) -> bool {
    let (start_year, _, _) = date_parts(start as f64).unwrap_or((0, 0, 0));
    let (end_year, _, _) = date_parts(end as f64).unwrap_or((0, 0, 0));
    (start_year..=end_year).any(|year| {
        is_leap_year(year)
            && exact_date(year, 2, 29)
                .is_some_and(|serial| serial as i64 >= start && (serial as i64) < end)
    })
}

fn actual_actual_yearfrac(start: i64, end: i64) -> Result<f64, FormulaError> {
    if start == end {
        return Ok(0.0);
    }
    let (start_year, start_month, start_day) =
        date_parts(start as f64).ok_or(FormulaError::Num)?;
    let (end_year, end_month, end_day) = date_parts(end as f64).ok_or(FormulaError::Num)?;
    let days = (end - start) as f64;
    if start_year == end_year
        || (end_year == start_year + 1
            && (end_month, end_day) <= (start_month, start_day))
    {
        let divisor = if interval_has_leap_day(start, end) {
            366.0
        } else {
            365.0
        };
        return Ok(days / divisor);
    }
    let years = end_year - start_year + 1;
    let mut calendar_days = 0i64;
    for year in start_year..=end_year {
        calendar_days += if is_leap_year(year) { 366 } else { 365 };
    }
    Ok(days / (calendar_days as f64 / years as f64))
}

fn is_last_day_of_february(year: i64, month: i64, day: i64) -> bool {
    month == 2 && day == days_in_month(year, month)
}

fn days_360(start: i64, end: i64, european: bool) -> Result<i64, FormulaError> {
    let (start_year, start_month, mut start_day) =
        date_parts(start as f64).ok_or(FormulaError::Num)?;
    let (end_year, end_month, mut end_day) =
        date_parts(end as f64).ok_or(FormulaError::Num)?;
    if european {
        start_day = start_day.min(30);
        end_day = end_day.min(30);
    } else {
        let start_last_feb =
            is_last_day_of_february(start_year, start_month, start_day);
        let end_last_feb = is_last_day_of_february(end_year, end_month, end_day);
        if start_last_feb {
            start_day = 30;
        }
        if start_last_feb && end_last_feb {
            end_day = 30;
        }
        if end_day == 31 && start_day >= 30 {
            end_day = 30;
        }
        if start_day == 31 {
            start_day = 30;
        }
    }
    Ok((end_year - start_year) * 360
        + (end_month - start_month) * 30
        + end_day
        - start_day)
}

fn yearfrac(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 3)?;
    let start = serial_date_arg(values, 0)?;
    let end = serial_date_arg(values, 1)?;
    let basis = integer_arg(values, 2, Some(0))?;
    if !(0..=4).contains(&basis) {
        return Err(FormulaError::Num);
    }
    let (lower, upper, sign) = if start <= end {
        (start, end, 1.0)
    } else {
        (end, start, -1.0)
    };
    let fraction = match basis {
        0 => days_360(lower, upper, false)? as f64 / 360.0,
        1 => actual_actual_yearfrac(lower, upper)?,
        2 => (upper - lower) as f64 / 360.0,
        3 => (upper - lower) as f64 / 365.0,
        4 => days_360(lower, upper, true)? as f64 / 360.0,
        _ => unreachable!(),
    };
    Ok(fraction * sign)
}

fn time_function(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 3)?;
    let hour = integer_arg(values, 0, None)?;
    let minute = integer_arg(values, 1, None)?;
    let second = integer_arg(values, 2, None)?;
    if !(0..=MAX_TIME_COMPONENT).contains(&hour)
        || !(0..=MAX_TIME_COMPONENT).contains(&minute)
        || !(0..=MAX_TIME_COMPONENT).contains(&second)
    {
        return Err(FormulaError::Num);
    }
    let total = hour
        .checked_mul(3_600)
        .and_then(|value| minute.checked_mul(60).and_then(|minute| value.checked_add(minute)))
        .and_then(|value| value.checked_add(second))
        .ok_or(FormulaError::Num)?;
    Ok(total.rem_euclid(SECONDS_PER_DAY) as f64 / SECONDS_PER_DAY as f64)
}

fn time_component(values: &FuncAccumulator, component: Func) -> Result<f64, FormulaError> {
    require_arity(values, 1, 1)?;
    let serial = temporal_serial(values.arg_value(0).ok_or(FormulaError::Value)?)?;
    let total_seconds = (serial.rem_euclid(1.0) * SECONDS_PER_DAY as f64 + 1e-9).floor() as i64;
    Ok(match component {
        Func::Hour => total_seconds / 3_600,
        Func::Minute => total_seconds % 3_600 / 60,
        Func::Second => total_seconds % 60,
        _ => unreachable!(),
    } as f64)
}

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Date => {
            let result = require_arity(values, 3, 3).and_then(|_| {
                date_serial(
                    integer_arg(values, 0, None)?,
                    integer_arg(values, 1, None)?,
                    integer_arg(values, 2, None)?,
                )
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::DateValue => {
            let result = require_arity(values, 1, 1).and_then(|_| {
                let text = text_arg(values, 0, None)?;
                parse_date_value(&text).ok_or(FormulaError::Value)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::Day | Func::Month | Func::Year => {
            let result = require_arity(values, 1, 1).and_then(|_| {
                let serial = number_arg(values, 0, None)?;
                let (year, month, day) = date_parts(serial).ok_or(FormulaError::Num)?;
                Ok(match func {
                    Func::Day => day,
                    Func::Month => month,
                    Func::Year => year,
                    _ => unreachable!(),
                } as f64)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::Time => time_function(values).map_or_else(Value::Error, Value::number),
        Func::TimeValue => {
            let result = require_arity(values, 1, 1).and_then(|_| {
                let text = text_arg(values, 0, None)?;
                parse_time_value(&text).ok_or(FormulaError::Value)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::Hour | Func::Minute | Func::Second => {
            time_component(values, func).map_or_else(Value::Error, Value::number)
        }
        Func::Days => {
            let result = require_arity(values, 2, 2).and_then(|_| {
                Ok((serial_date_arg(values, 0)? - serial_date_arg(values, 1)?) as f64)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::EDate | Func::EOMonth => {
            let result = require_arity(values, 2, 2).and_then(|_| {
                add_months(
                    serial_date_arg(values, 0)?,
                    integer_arg(values, 1, None)?,
                    func == Func::EOMonth,
                )
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::Weekday => {
            let result = require_arity(values, 1, 2).and_then(|_| {
                Ok(weekday_number(
                    serial_date_arg(values, 0)?,
                    integer_arg(values, 1, Some(1))?,
                )? as f64)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::WeekNum => {
            let result = require_arity(values, 1, 2).and_then(|_| {
                Ok(week_number(
                    serial_date_arg(values, 0)?,
                    integer_arg(values, 1, Some(1))?,
                )? as f64)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        Func::Workday => workday(values).map_or_else(Value::Error, Value::number),
        Func::NetworkDays => networkdays(values).map_or_else(Value::Error, Value::number),
        Func::YearFrac => yearfrac(values).map_or_else(Value::Error, Value::number),
        Func::Days360 => {
            let result = require_arity(values, 2, 3).and_then(|_| {
                Ok(days_360(
                    serial_date_arg(values, 0)?,
                    serial_date_arg(values, 1)?,
                    bool_arg(values, 2, Some(false))?,
                )? as f64)
            });
            result.map_or_else(Value::Error, Value::number)
        }
        _ => return None,
    };
    Some(result)
}

#[cfg(test)]
mod tests {
    use crate::calc::Func;
    use crate::types::{FormulaError, Value};

    use super::{apply, date_parts, date_serial, format_date_serial, parse_date_value, FuncAccumulator};

    fn accumulator(args: &[Vec<Value>]) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for arg in args {
            for value in arg {
                values.push_range(value.clone()).unwrap();
            }
            values.finish_arg(1, arg.len()).unwrap();
        }
        values
    }

    fn scalar(value: f64) -> Vec<Value> {
        vec![Value::number(value)]
    }

    fn result(func: Func, args: &[Vec<Value>]) -> Value {
        apply(func, &accumulator(args)).unwrap()
    }

    fn number(value: Value) -> f64 {
        let Value::Number(value) = value else {
            panic!("expected a number, got {value:?}");
        };
        value
    }

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

    #[test]
    fn serial_boundaries_preserve_the_1900_leap_day() {
        assert_eq!(date_parts(59.0), Some((1900, 2, 28)));
        assert_eq!(date_parts(60.0), Some((1900, 2, 29)));
        assert_eq!(date_parts(61.0), Some((1900, 3, 1)));
        assert_eq!(date_parts(i64::MAX as f64), None);
        assert_eq!(date_serial(1900, 2, 29), Ok(60.0));
        for &(year, month, day) in &[
            (1900, 1, 1),
            (1900, 2, 28),
            (1900, 2, 29),
            (1900, 3, 1),
            (2000, 2, 29),
            (9999, 12, 31),
        ] {
            let serial = date_serial(year, month, day).unwrap();
            assert_eq!(date_parts(serial), Some((year, month, day)));
        }
        assert_eq!(
            result(
                Func::Date,
                &[
                    scalar(i64::MAX as f64),
                    scalar(i64::MIN as f64),
                    scalar(i64::MIN as f64),
                ],
            ),
            Value::Error(FormulaError::Num)
        );
    }

    #[test]
    fn time_functions_cover_meridiem_wrap_and_boundaries() {
        let time = number(result(
            Func::Time,
            &[scalar(25.0), scalar(1.0), scalar(2.0)],
        ));
        assert!((time - (3_662.0 / 86_400.0)).abs() < 1e-15);
        assert_eq!(
            result(Func::Time, &[scalar(-1.0), scalar(0.0), scalar(0.0)]),
            Value::Error(FormulaError::Num)
        );
        let noon = number(result(Func::TimeValue, &[vec![Value::text("12:30 PM")]]));
        assert!((noon - 0.520_833_333_333_333_3).abs() < 1e-15);
        assert_eq!(result(Func::Hour, &[vec![Value::text("12:30 AM")]]), scalar(0.0)[0]);
        assert_eq!(result(Func::Minute, &[vec![Value::text("23:59:58")]]), scalar(59.0)[0]);
        assert_eq!(result(Func::Second, &[vec![Value::text("23:59:58")]]), scalar(58.0)[0]);
    }

    #[test]
    fn month_arithmetic_clamps_and_resolves_month_ends() {
        let january_31 = date_serial(2024, 1, 31).unwrap();
        assert_eq!(
            number(result(Func::EDate, &[scalar(january_31), scalar(1.0)])),
            date_serial(2024, 2, 29).unwrap()
        );
        assert_eq!(
            number(result(Func::EOMonth, &[scalar(january_31), scalar(1.0)])),
            date_serial(2024, 2, 29).unwrap()
        );
        assert_eq!(
            result(Func::EDate, &[scalar(0.0), scalar(-1.0)]),
            Value::Error(FormulaError::Num)
        );
    }

    #[test]
    fn weekday_and_weeknum_tables_use_supported_return_types() {
        let monday = date_serial(2024, 1, 1).unwrap();
        for &(return_type, expected) in &[(1.0, 2.0), (2.0, 1.0), (3.0, 0.0), (12.0, 7.0)] {
            assert_eq!(
                result(Func::Weekday, &[scalar(monday), scalar(return_type)]),
                Value::number(expected)
            );
        }
        assert_eq!(
            result(Func::WeekNum, &[scalar(monday), scalar(21.0)]),
            Value::number(1.0)
        );
        assert_eq!(
            result(Func::Weekday, &[scalar(monday), scalar(4.0)]),
            Value::Error(FormulaError::Num)
        );
    }

    #[test]
    fn workday_functions_skip_weekends_and_unique_holidays() {
        let friday = date_serial(2024, 1, 5).unwrap();
        let monday = date_serial(2024, 1, 8).unwrap();
        let tuesday = date_serial(2024, 1, 9).unwrap();
        let holidays = vec![Value::number(monday), Value::number(monday)];
        assert_eq!(
            result(Func::Workday, &[scalar(friday), scalar(1.0), holidays.clone()]),
            Value::number(tuesday)
        );
        assert_eq!(
            result(Func::Workday, &[scalar(tuesday), scalar(-1.0), holidays.clone()]),
            Value::number(friday)
        );
        assert_eq!(
            result(Func::NetworkDays, &[scalar(friday), scalar(tuesday), holidays.clone()]),
            Value::number(2.0)
        );
        assert_eq!(
            result(Func::NetworkDays, &[scalar(tuesday), scalar(friday), holidays]),
            Value::number(-2.0)
        );
        assert_eq!(
            result(Func::Workday, &[scalar(friday), scalar(3_000_000.0)]),
            Value::Error(FormulaError::Num)
        );
    }

    #[test]
    fn day_count_conventions_cover_leap_and_month_end_boundaries() {
        let start = date_serial(2023, 2, 28).unwrap();
        let end = date_serial(2024, 2, 28).unwrap();
        assert_eq!(
            result(Func::Days, &[scalar(end), scalar(start)]),
            Value::number(365.0)
        );
        assert!((number(result(
            Func::YearFrac,
            &[scalar(start), scalar(end), scalar(1.0)],
        )) - 1.0)
            .abs()
            < 1e-15);
        assert_eq!(
            result(Func::Days360, &[scalar(start), scalar(end)]),
            Value::number(358.0)
        );
        let january_31 = date_serial(2024, 1, 31).unwrap();
        let february_29 = date_serial(2024, 2, 29).unwrap();
        assert_eq!(
            result(
                Func::Days360,
                &[scalar(january_31), scalar(february_29), vec![Value::Bool(true)]],
            ),
            Value::number(29.0)
        );
    }
}
