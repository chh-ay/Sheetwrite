import { serialToDate } from "./date-serial.js";

const PLACEHOLDER = /[#0.,]/;

/** Parsed shape of an Excel-style number-format `code`, memoized per distinct code. */
interface FormatDescriptor {
  percent: boolean;
  decimals: number;
  grouped: boolean;
  prefix: string;
  suffix: string;
}

// ── Caches ──────────────────────────────────────────────────────────────────
// `formatNumber` runs per visible numeric cell; keep parse/formatter/date
// classification caches module-local.

const descriptorCache = new Map<string, FormatDescriptor>();
const formatterCache = new Map<string, Intl.NumberFormat>();
let defaultFormatter: Intl.NumberFormat | undefined;
/** Resolved `¤` currency symbol (see {@link getCurrencySymbol}); computed once. */
let currencySymbol: string | undefined;
/**
 * Compiled date-token lists keyed by code; a `null` entry records "this code is
 * numeric, not a date" so the date/number classification runs once per code.
 */
const dateFormatCache = new Map<string, DateToken[] | null>();

/**
 * Parse a format `code` into a {@link FormatDescriptor}, memoizing the result so
 * the per-character prefix/suffix/decimals scan happens once per distinct code.
 */
function parseFormat(code: string): FormatDescriptor {
  const cached = descriptorCache.get(code);
  if (cached) return cached;

  const percent = code.includes("%");
  const grouped = code.includes(",");

  let decimals = 0;
  const dot = code.indexOf(".");
  if (dot >= 0) {
    for (let i = dot + 1; i < code.length; i++) {
      const ch = code[i]!;
      if (ch === "0" || ch === "#") decimals++;
      else break;
    }
  }

  let prefix = "";
  for (const ch of code) {
    if (PLACEHOLDER.test(ch) || ch === "%") break;
    prefix += ch;
  }

  let suffix = "";
  for (let i = code.length - 1; i >= 0; i--) {
    const ch = code[i]!;
    if (PLACEHOLDER.test(ch)) break;
    suffix = ch + suffix;
  }

  // `¤` is the generic currency placeholder; resolve it to a concrete symbol.
  if (prefix.includes("¤")) prefix = prefix.replaceAll("¤", getCurrencySymbol());
  if (suffix.includes("¤")) suffix = suffix.replaceAll("¤", getCurrencySymbol());

  const descriptor: FormatDescriptor = { percent, decimals, grouped, prefix, suffix };
  descriptorCache.set(code, descriptor);
  return descriptor;
}

/** Cached `Intl.NumberFormat` fallback for edge values the grouped fast path skips. */
function formatterFor(decimals: number): Intl.NumberFormat {
  const key = String(decimals);

  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      useGrouping: true,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatterCache.set(key, formatter);
  }

  return formatter;
}

/**
 * Return the cached default-locale formatter used when no `code` is supplied.
 * Equivalent to `value.toLocaleString()` but without reconstructing the
 * underlying `Intl` formatter on every call.
 */
function getDefaultFormatter(): Intl.NumberFormat {
  if (!defaultFormatter) defaultFormatter = new Intl.NumberFormat();
  return defaultFormatter;
}

/**
 * Resolve the `¤` generic-currency placeholder to a concrete symbol. Derived once
 * from the same fixed `en-US` locale the grouped numeric path uses, so output is
 * deterministic (`¤` renders as `$`); for any other symbol put the literal glyph
 * in the code (e.g. `€#,##0.00`).
 */
function getCurrencySymbol(): string {
  if (currencySymbol === undefined) {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).formatToParts(0);
    currencySymbol = parts.find((part) => part.type === "currency")?.value ?? "$";
  }
  return currencySymbol;
}

function formatGroupedNumber(value: number, decimals: number): string {
  if (decimals < 0 || decimals > 20 || Math.abs(value) >= 1e21) {
    return formatterFor(decimals).format(value);
  }

  const negative = value < 0 || Object.is(value, -0);
  const abs = Math.abs(value);
  const rounded = roundAbsToDecimals(abs, decimals);
  if (!Number.isFinite(rounded)) return formatterFor(decimals).format(value);

  const fixed = rounded.toFixed(decimals);
  if (fixed.includes("e")) return formatterFor(decimals).format(value);

  const dot = fixed.indexOf(".");
  const intPart = dot === -1 ? fixed : fixed.slice(0, dot);
  const fracPart = dot === -1 ? "" : fixed.slice(dot);
  let grouped = "";
  for (let i = intPart.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    grouped = intPart.slice(start, i) + (grouped ? `,${grouped}` : "");
  }

  return `${negative ? "-" : ""}${grouped}${fracPart}`;
}

function roundAbsToDecimals(value: number, decimals: number): number {
  if (decimals === 0) return Math.round(value);

  const shifted = Number(`${value}e${decimals}`);
  if (!Number.isFinite(shifted)) return Number.NaN;
  return Number(`${Math.round(shifted)}e-${decimals}`);
}

// ── Date format codes ─────────────────────────────────────────────────────────
// A code is a DATE code when it carries no numeric digit placeholder (`0`/`#`) yet
// contains a date/time letter (y, m, d, h, s). The `0`/`#` guard keeps every real
// numeric code — including currency like `$#,##0.00` — on the numeric path, so a
// numeric suffix that happens to contain a letter is never misread as a date. The
// compiled token list is cached per code, mirroring the numeric descriptor cache,
// so the paint hot path never re-scans a code.

/** One field or literal run of a compiled date format. */
interface DateToken {
  kind: "year4" | "year2" | "month" | "minute" | "day" | "hour" | "second" | "literal";
  /** Zero-pad the numeric field to two digits (`mm`/`dd`/`hh`/`ss` vs `m`/`d`…). */
  pad: boolean;
  /** Verbatim text for a `literal` token (separators like `-`, `/`, `:`, space). */
  text: string;
}

/**
 * Return the compiled date-token list for `code`, or `null` when it is a numeric
 * code. Memoized so classification + tokenization run once per distinct code.
 */
function compileDateFormat(code: string): DateToken[] | null {
  const cached = dateFormatCache.get(code);
  if (cached !== undefined) return cached;

  const numeric = code.includes("0") || code.includes("#");
  const tokens = !numeric && /[ymdhs]/i.test(code) ? tokenizeDate(code) : null;
  dateFormatCache.set(code, tokens);
  return tokens;
}

/**
 * Split a date `code` into tokens (case-insensitive, longest run first). A run of
 * a date letter becomes one field: `mm`/`dd`/`hh`/`ss` pad to two digits, `m`/`d`/
 * `h`/`s` do not, `yyyy`/`yyy` are 4-digit years and `yy`/`y` are 2-digit. Every
 * other run is a literal. `m` is provisionally a month; {@link resolveMonthMinute}
 * reassigns it to a minute by Excel's adjacency rule.
 */
function tokenizeDate(code: string): DateToken[] {
  const tokens: DateToken[] = [];
  for (let i = 0; i < code.length; ) {
    const lower = code[i]!.toLowerCase();
    if (lower === "y" || lower === "m" || lower === "d" || lower === "h" || lower === "s") {
      const run = runLength(code, i, lower);
      if (lower === "y") tokens.push({ kind: run >= 3 ? "year4" : "year2", pad: false, text: "" });
      else if (lower === "m") tokens.push({ kind: "month", pad: run >= 2, text: "" });
      else if (lower === "d") tokens.push({ kind: "day", pad: run >= 2, text: "" });
      else if (lower === "h") tokens.push({ kind: "hour", pad: run >= 2, text: "" });
      else tokens.push({ kind: "second", pad: run >= 2, text: "" });
      i += run;
    } else {
      let text = "";
      while (i < code.length && !/[ymdhs]/i.test(code[i]!)) {
        text += code[i]!;
        i++;
      }
      tokens.push({ kind: "literal", pad: false, text });
    }
  }
  resolveMonthMinute(tokens);
  return tokens;
}

function runLength(code: string, start: number, letter: string): number {
  let i = start;
  while (i < code.length && code[i]!.toLowerCase() === letter) i++;
  return i - start;
}

/**
 * Reassign each provisional `month` token to `minute` when it neighbours a time
 * field (Excel's rule): `m` is minutes if the nearest non-literal token before it
 * is an hour, or the nearest one after it is a second. So `hh:mm` → minutes, but
 * `mm/dd` and `yyyy-mm` → month.
 */
function resolveMonthMinute(tokens: DateToken[]): void {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.kind !== "month") continue;
    let minute = false;
    for (let j = i - 1; j >= 0; j--) {
      const kind = tokens[j]!.kind;
      if (kind === "literal") continue;
      minute = kind === "hour";
      break;
    }
    if (!minute) {
      for (let j = i + 1; j < tokens.length; j++) {
        const kind = tokens[j]!.kind;
        if (kind === "literal") continue;
        minute = kind === "second";
        break;
      }
    }
    if (minute) tokens[i]!.kind = "minute";
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Render a date `serial` through a compiled token list. Reads UTC calendar fields
 * (see `date-serial.ts`) so the output never drifts with the host time zone.
 */
function renderDate(serial: number, tokens: DateToken[]): string {
  const date = serialToDate(serial);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  let out = "";
  for (const token of tokens) {
    switch (token.kind) {
      case "literal":
        out += token.text;
        break;
      case "year4":
        out += String(year).padStart(4, "0");
        break;
      case "year2":
        out += pad2(((year % 100) + 100) % 100);
        break;
      case "month":
        out += token.pad ? pad2(month) : String(month);
        break;
      case "minute":
        out += token.pad ? pad2(minute) : String(minute);
        break;
      case "day":
        out += token.pad ? pad2(day) : String(day);
        break;
      case "hour":
        out += token.pad ? pad2(hour) : String(hour);
        break;
      case "second":
        out += token.pad ? pad2(second) : String(second);
        break;
    }
  }
  return out;
}

/**
 * Best-effort Excel number-format renderer. Handles the common numeric presets —
 * fixed decimals, thousands grouping, percent, and literal or `¤` currency
 * prefixes/suffixes — plus date/time codes (`yyyy-mm-dd`, `dd/mm/yyyy hh:mm`, …),
 * which format the value as a date serial (see `date-serial.ts`). Not a full Excel
 * engine (no conditional sections, month/day names, or fractional seconds).
 *
 * Classification, the format parse, the compiled date tokens, and the
 * `Intl.NumberFormat` instances are all memoized module-side, so repeated calls
 * with the same code (the common paint case) avoid re-scanning and reconstruction.
 */
export function formatNumber(value: number, code?: string): string {
  if (!Number.isFinite(value)) return "";
  if (!code) return getDefaultFormatter().format(value);

  const dateTokens = compileDateFormat(code);
  if (dateTokens) return renderDate(value, dateTokens);

  const { percent, decimals, grouped, prefix, suffix } = parseFormat(code);

  const scaled = percent ? value * 100 : value;

  const body = grouped ? formatGroupedNumber(scaled, decimals) : scaled.toFixed(decimals);

  return `${prefix}${body}${suffix}`;
}
