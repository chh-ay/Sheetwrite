import { serialToDate } from "./date-serial.js";

interface NumericDescriptor {
  percent: boolean;
  decimals: number;
  grouped: boolean;
  prefix: string;
  suffix: string;
  scientific: boolean;
  exponentDigits: number;
}

const YEAR4 = 0;
const YEAR2 = 1;
const MONTH = 2;
const MONTH_SHORT = 3;
const MONTH_LONG = 4;
const MINUTE = 5;
const DAY = 6;
const WEEKDAY_SHORT = 7;
const WEEKDAY_LONG = 8;
const HOUR = 9;
const SECOND = 10;
const AMPM = 11;
const LITERAL = 12;
type DateToken = [kind: number, pad: boolean, text: string];

type CompiledSection = readonly [
  dateTokens: readonly DateToken[] | null,
  numeric: NumericDescriptor | null,
  literal: string,
];
type CompiledFormat = readonly CompiledSection[];

export interface NumberFormatResourceStats {
  readonly compiledFormats: number;
  readonly numberFormatters: number;
  readonly dateTimeFormatters: number;
  readonly formatCacheEntries: number;
  readonly numberFormatterCacheEntries: number;
  readonly dateTimeFormatterCacheEntries: number;
}

const FORMAT_CACHE_LIMIT = 256;
const NUMBER_FORMATTER_CACHE_LIMIT = 128;
const DATE_TIME_FORMATTER_CACHE_LIMIT = 64;
const formatCache = new Map<string, CompiledFormat>();
const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
let resourceStats:
  | [compiledFormats: number, numberFormatters: number, dateTimeFormatters: number]
  | undefined;
let currencySymbol: string | undefined;

function splitRawSections(code: string): string[] {
  const sections: string[] = [];
  let section = "";
  let quoted = false;
  for (let index = 0; index < code.length; index++) {
    const char = code[index]!;
    if (char === '"') quoted = !quoted;
    if (char === "\\" && index + 1 < code.length) {
      section += char + code[++index]!;
      continue;
    }
    if (char === ";" && !quoted) {
      sections.push(section);
      section = "";
    } else {
      section += char;
    }
  }
  sections.push(section);
  return sections.slice(0, 4);
}

function sectionFor(
  value: number,
  format: CompiledFormat,
): { section: CompiledSection; magnitude: number } {
  const sections = format;
  const fallback = sections[0]!;
  if (value > 0 || sections.length === 1) return { section: fallback, magnitude: value };
  if (value < 0) {
    return sections[1] !== undefined
      ? { section: sections[1], magnitude: Math.abs(value) }
      : { section: fallback, magnitude: value };
  }
  return { section: sections[2] ?? fallback, magnitude: 0 };
}

function cacheValue<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return value;
}

/** Test-only deterministic formatter resource counters. */
export function getNumberFormatResourceStatsForTest(): NumberFormatResourceStats {
  const [compiledFormats, numberFormatters, dateTimeFormatters] = resourceStats ?? [0, 0, 0];
  return {
    compiledFormats,
    numberFormatters,
    dateTimeFormatters,
    formatCacheEntries: formatCache.size,
    numberFormatterCacheEntries: numberFormatterCache.size,
    dateTimeFormatterCacheEntries: dateTimeFormatterCache.size,
  };
}

/** Test-only reset for isolated formatter resource assertions. */
export function resetNumberFormatResourcesForTest(): void {
  formatCache.clear();
  numberFormatterCache.clear();
  dateTimeFormatterCache.clear();
  resourceStats = [0, 0, 0];
  currencySymbol = undefined;
}

function decodeLiteral(source: string): string {
  let output = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "\\" && index + 1 < source.length) {
      output += source[++index]!;
      continue;
    }
    if ((char === "_" || char === "*") && index + 1 < source.length) {
      index++;
      continue;
    }
    if (char === "[" && !quoted) {
      const close = source.indexOf("]", index + 1);
      if (close >= 0) {
        index = close;
        continue;
      }
    }
    output += char;
  }
  return output.includes("¤") ? output.replaceAll("¤", getCurrencySymbol()) : output;
}

function placeholderBounds(section: string): [number, number] | null {
  let first = -1;
  let last = -1;
  let quoted = false;
  for (let index = 0; index < section.length; index++) {
    const char = section[index]!;
    if (char === '"') quoted = !quoted;
    else if (char === "\\") index++;
    else if (!quoted && /[0#?]/.test(char)) {
      if (first < 0) first = index;
      last = index;
    }
  }
  return first < 0 ? null : [first, last];
}

function parseNumericFormat(section: string): NumericDescriptor | null {
  const bounds = placeholderBounds(section);
  if (!bounds) return null;
  const [first, last] = bounds;
  const pattern = section.slice(first, last + 1);
  const exponent = /E[+-]?(0+)/i.exec(pattern);
  const mantissa = exponent ? pattern.slice(0, exponent.index) : pattern;
  const dot = mantissa.indexOf(".");
  let decimals = 0;
  if (dot >= 0) {
    for (let index = dot + 1; index < mantissa.length; index++) {
      if (/[0#?]/.test(mantissa[index]!)) decimals++;
      else break;
    }
  }
  const descriptor: NumericDescriptor = {
    percent: section.includes("%"),
    decimals,
    grouped: mantissa.includes(","),
    prefix: decodeLiteral(section.slice(0, first)),
    suffix: decodeLiteral(section.slice(last + 1)),
    scientific: exponent !== null,
    exponentDigits: exponent?.[1]?.length ?? 0,
  };
  return descriptor;
}

function formatter(locale: string, decimals: number, grouped: boolean): Intl.NumberFormat {
  const key = `fixed:${locale}:${decimals}:${grouped ? 1 : 0}`;
  const cached = numberFormatterCache.get(key);
  if (cached) return cached;
  if (resourceStats) resourceStats[1] += 1;
  return cacheValue(
    numberFormatterCache,
    key,
    new Intl.NumberFormat(locale, {
      useGrouping: grouped,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    NUMBER_FORMATTER_CACHE_LIMIT,
  );
}

function defaultFormatter(locale: string): Intl.NumberFormat {
  const key = `default:${locale}`;
  const cached = numberFormatterCache.get(key);
  if (cached) return cached;
  if (resourceStats) resourceStats[1] += 1;
  return cacheValue(
    numberFormatterCache,
    key,
    new Intl.NumberFormat(locale),
    NUMBER_FORMATTER_CACHE_LIMIT,
  );
}

function getCurrencySymbol(): string {
  if (currencySymbol === undefined) {
    if (resourceStats) resourceStats[1] += 1;
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).formatToParts(0);
    currencySymbol = parts.find((part) => part.type === "currency")?.value ?? "$";
  }
  return currencySymbol;
}

function tokenizeDate(section: string): DateToken[] {
  const tokens: DateToken[] = [];
  for (let index = 0; index < section.length; ) {
    if (section[index] === '"') {
      const close = section.indexOf('"', index + 1);
      const end = close < 0 ? section.length : close;
      tokens.push([LITERAL, false, section.slice(index + 1, end)]);
      index = close < 0 ? section.length : close + 1;
      continue;
    }
    if (section[index] === "\\" && index + 1 < section.length) {
      tokens.push([LITERAL, false, section[index + 1]!]);
      index += 2;
      continue;
    }
    const ampm = section.slice(index).match(/^(am\/pm|a\/p)/i)?.[0];
    if (ampm) {
      tokens.push([AMPM, false, ""]);
      index += ampm.length;
      continue;
    }
    const lower = section[index]!.toLowerCase();
    if (lower === "y" || lower === "m" || lower === "d" || lower === "h" || lower === "s") {
      let end = index + 1;
      while (end < section.length && section[end]!.toLowerCase() === lower) end++;
      const run = end - index;
      if (lower === "y") tokens.push([run >= 3 ? YEAR4 : YEAR2, false, ""]);
      else if (lower === "m") {
        tokens.push([run >= 4 ? MONTH_LONG : run === 3 ? MONTH_SHORT : MONTH, run === 2, ""]);
      } else if (lower === "d") {
        tokens.push([run >= 4 ? WEEKDAY_LONG : run === 3 ? WEEKDAY_SHORT : DAY, run === 2, ""]);
      } else tokens.push([lower === "h" ? HOUR : SECOND, run >= 2, ""]);
      index = end;
      continue;
    }
    let literal = "";
    while (
      index < section.length &&
      !/[ymdhs"\\]/i.test(section[index]!) &&
      !/^(am\/pm|a\/p)/i.test(section.slice(index))
    ) {
      literal += section[index++]!;
    }
    tokens.push([LITERAL, false, decodeLiteral(literal)]);
  }
  resolveMonthMinute(tokens);
  return tokens;
}

function compileDateFormat(section: string): DateToken[] | null {
  let visible = "";
  let quoted = false;
  for (let index = 0; index < section.length; index++) {
    const char = section[index]!;
    if (char === "[" && !quoted) {
      const close = section.indexOf("]", index + 1);
      if (close >= 0) {
        index = close;
        continue;
      }
    }
    if (char === '"') quoted = !quoted;
    else if (char === "\\") index++;
    else if (!quoted) visible += char;
  }
  const tokens = /[ymdhs]/i.test(visible) && !/#/.test(visible) ? tokenizeDate(section) : null;
  return tokens;
}

function resolveMonthMinute(tokens: DateToken[]): void {
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]![0] !== MONTH) continue;
    let minute = false;
    for (let previous = index - 1; previous >= 0; previous--) {
      if (tokens[previous]![0] === LITERAL) continue;
      minute = tokens[previous]![0] === HOUR;
      break;
    }
    if (!minute) {
      for (let next = index + 1; next < tokens.length; next++) {
        if (tokens[next]![0] === LITERAL) continue;
        minute = tokens[next]![0] === SECOND;
        break;
      }
    }
    if (minute) tokens[index]![0] = MINUTE;
  }
}

function compileFormat(code: string): CompiledFormat {
  const cached = formatCache.get(code);
  if (cached) return cached;
  const compiled: CompiledFormat = splitRawSections(code).map((source) => [
    compileDateFormat(source),
    parseNumericFormat(source),
    decodeLiteral(source),
  ]);
  if (resourceStats) resourceStats[0] += 1;
  return cacheValue(formatCache, code, compiled, FORMAT_CACHE_LIMIT);
}

function calendarFormatter(
  locale: string,
  field: "month" | "weekday",
  width: "long" | "short",
): Intl.DateTimeFormat {
  const key = `${locale}:${field}:${width}`;
  const cached = dateTimeFormatterCache.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", [field]: width };
  if (resourceStats) resourceStats[2] += 1;
  return cacheValue(
    dateTimeFormatterCache,
    key,
    new Intl.DateTimeFormat(locale, options),
    DATE_TIME_FORMATTER_CACHE_LIMIT,
  );
}

function renderDate(serial: number, tokens: readonly DateToken[], locale: string): string {
  const date = serialToDate(serial);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour24 = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const usesAmPm = tokens.some((token) => token[0] === AMPM);
  let output = "";
  for (const token of tokens) {
    switch (token[0]) {
      case LITERAL:
        output += token[2];
        break;
      case YEAR4:
        output += String(year).padStart(4, "0");
        break;
      case YEAR2:
        output += String(((year % 100) + 100) % 100).padStart(2, "0");
        break;
      case MONTH:
        output += token[1] ? String(month).padStart(2, "0") : String(month);
        break;
      case MONTH_SHORT:
      case MONTH_LONG:
        output += calendarFormatter(
          locale,
          "month",
          token[0] === MONTH_LONG ? "long" : "short",
        ).format(date);
        break;
      case MINUTE:
        output += token[1] ? String(minute).padStart(2, "0") : String(minute);
        break;
      case DAY:
        output += token[1] ? String(day).padStart(2, "0") : String(day);
        break;
      case WEEKDAY_SHORT:
      case WEEKDAY_LONG:
        output += calendarFormatter(
          locale,
          "weekday",
          token[0] === WEEKDAY_LONG ? "long" : "short",
        ).format(date);
        break;
      case HOUR: {
        const hour = usesAmPm ? hour24 % 12 || 12 : hour24;
        output += token[1] ? String(hour).padStart(2, "0") : String(hour);
        break;
      }
      case SECOND:
        output += token[1] ? String(second).padStart(2, "0") : String(second);
        break;
      case AMPM:
        output += hour24 < 12 ? "AM" : "PM";
        break;
    }
  }
  return output;
}

function formatScientific(value: number, decimals: number, exponentDigits: number): string {
  const [mantissa, rawExponent = "0"] = value.toExponential(decimals).toUpperCase().split("E");
  const exponent = Number(rawExponent);
  const sign = exponent >= 0 ? "+" : "-";
  return `${mantissa}E${sign}${String(Math.abs(exponent)).padStart(exponentDigits, "0")}`;
}

/**
 * Deterministic Excel-style number/date formatter. Supports explicit locale
 * separators, percent/scientific notation, UTC date/time tokens, four-section
 * positive/negative/zero/text codes, quoted literals, and backslash escapes.
 */
export function formatNumber(value: number | string, code?: string, locale = "en-US"): string {
  if (typeof value === "string") {
    if (!code) return value;
    const textSection = compileFormat(code)[3];
    return textSection === undefined ? value : textSection[2].replaceAll("@", value);
  }
  if (!Number.isFinite(value)) return "";
  if (!code) return defaultFormatter(locale).format(value);

  const { section, magnitude } = sectionFor(value, compileFormat(code));
  if (section[0]) return renderDate(magnitude, section[0], locale);

  const descriptor = section[1];
  if (!descriptor) return section[2].replaceAll("@", "");
  const scaled = descriptor.percent ? magnitude * 100 : magnitude;
  const body = descriptor.scientific
    ? formatScientific(scaled, descriptor.decimals, descriptor.exponentDigits)
    : formatter(locale, descriptor.decimals, descriptor.grouped).format(scaled);
  return `${descriptor.prefix}${body}${descriptor.suffix}`;
}
