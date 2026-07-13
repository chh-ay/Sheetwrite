// Excel/Sheets-style date serials: a date is a plain number — whole days since
// the 1899-12-30 epoch, with the fractional part carrying the time of day. Dates
// therefore live in ordinary number cells, so sorting, filtering, and aggregation
// keep working unchanged; only rendering (a date `numberFormat`) and input parsing
// need to know a column is a date.
//
// ── Excel's leap-year compatibility and UTC ──────────────────────────────────
// Excel's 1900 date system treats serial 60 as the non-existent 1900-02-29.
// Real JavaScript Dates before 1900-03-01 use days since 1899-12-31; dates on or
// after that cutoff receive one extra serial day. Serial 60 maps to the only
// representable fallback (1900-02-28) when converted to a Date, while numeric
// formula/XLSX paths can preserve the serial itself.
//
// All conversions use UTC (`Date.UTC` / `getUTC*`) so host timezone offsets never
// shift calendar dates.

/** Real-date base used before Excel's synthetic leap day. */
const EPOCH_MS = Date.UTC(1899, 11, 31);
const LEAP_BUG_CUTOFF_MS = Date.UTC(1900, 2, 1);
/** Milliseconds in one day; the serial ↔ ms scale factor. */
const MS_PER_DAY = 86_400_000;

/**
 * Convert a real UTC `Date` to the Excel 1900-system serial. It is the inverse
 * of {@link serialToDate} except for synthetic serial 60, which JavaScript
 * cannot represent as a Date. Construct calendar dates with `Date.UTC(...)`
 * (or via {@link parseDateInput}) to avoid host-timezone shifts.
 */
export function dateToSerial(date: Date): number {
  const milliseconds = date.getTime();
  const serial = (milliseconds - EPOCH_MS) / MS_PER_DAY;
  return milliseconds >= LEAP_BUG_CUTOFF_MS ? serial + 1 : serial;
}

/**
 * Convert a date serial back to a `Date`. Read the result with the UTC accessors
 * (`getUTCFullYear`, `getUTCMonth`, …) — which is what the renderer does — so the
 * calendar fields are stable regardless of the host time zone.
 */
export function serialToDate(serial: number): Date {
  const realSerial = serial >= 60 ? serial - 1 : serial;
  return new Date(EPOCH_MS + realSerial * MS_PER_DAY);
}

/**
 * Build a serial from calendar/time components, returning `null` when they do not
 * form a real date. Overflow (e.g. Feb 30, month 13) is rejected by round-tripping
 * the components through `Date.UTC` and checking they survive normalization; this
 * also rejects two-digit years, since `Date.UTC` would remap 0–99 into 1900–1999.
 */
function componentsToSerial(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return dateToSerial(new Date(ms));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Parse a user-typed date string into a serial, or `null` when it is not a date.
 * Accepted forms:
 *
 * - ISO `yyyy-mm-dd` (e.g. `2026-07-06`);
 * - ISO date-time `yyyy-mm-dd hh:mm` or `yyyy-mm-dd hh:mm:ss` (a `T` separator is
 *   also accepted); the fractional serial carries the time;
 * - slash `dd/mm/yyyy` and `mm/dd/yyyy`, disambiguated **conservatively**: if one
 *   component exceeds 12 it must be the day and the layout is unambiguous; when
 *   both are ≤ 12 the value is ambiguous (e.g. `04/05/2026`) and is read as
 *   **mm/dd** — Google Sheets' default (US) locale. Both > 12 is rejected.
 *
 * Anything else (bare numbers, free text) returns `null` so callers can fall back
 * to a text literal.
 */
export function parseDateInput(raw: string): number | null {
  const s = raw.trim();

  const dateTime = ISO_DATETIME.exec(s);
  if (dateTime) {
    return componentsToSerial(
      Number(dateTime[1]),
      Number(dateTime[2]),
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      dateTime[6] ? Number(dateTime[6]) : 0,
    );
  }

  const date = ISO_DATE.exec(s);
  if (date) {
    return componentsToSerial(Number(date[1]), Number(date[2]), Number(date[3]), 0, 0, 0);
  }

  const slash = SLASH_DATE.exec(s);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);

    let month: number;
    let day: number;
    if (a > 12 && b <= 12) {
      // dd/mm/yyyy — the first field cannot be a month.
      day = a;
      month = b;
    } else if (a <= 12 && b <= 12) {
      // Ambiguous or mm/dd/yyyy — default to month-first (US locale).
      month = a;
      day = b;
    } else {
      // b > 12 with a ≤ 12 is mm/dd; anything else (both > 12) is invalid.
      if (a > 12) return null;
      month = a;
      day = b;
    }

    return componentsToSerial(year, month, day, 0, 0, 0);
  }

  return null;
}
