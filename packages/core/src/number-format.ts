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

type DateTokenKind =
  | "year4"
  | "year2"
  | "month"
  | "monthShort"
  | "monthLong"
  | "minute"
  | "day"
  | "weekdayShort"
  | "weekdayLong"
  | "hour"
  | "second"
  | "ampm"
  | "literal";

interface DateToken {
  kind: DateTokenKind;
  pad: boolean;
  text: string;
}

interface CompiledSection {
  readonly source: string;
  readonly dateTokens: readonly DateToken[] | null;
  readonly numeric: NumericDescriptor | null;
  readonly literal: string;
}

interface CompiledFormat {
  readonly sections: readonly CompiledSection[];
}

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
let compiledFormats = 0;
let numberFormatters = 0;
let dateTimeFormatters = 0;
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
  const sections = format.sections;
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
  compiledFormats = 0;
  numberFormatters = 0;
  dateTimeFormatters = 0;
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
      const currency = /^\$([^-]*)-[0-9A-F]+$/i.exec(source.slice(index + 1, close));
      if (close >= 0) {
        if (currency?.[1]) output += currency[1];
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
    else if (char === "[" && !quoted) {
      const close = section.indexOf("]", index + 1);
      if (close >= 0) index = close;
    } else if (char === "\\") index++;
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
  numberFormatters += 1;
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
  numberFormatters += 1;
  return cacheValue(
    numberFormatterCache,
    key,
    new Intl.NumberFormat(locale),
    NUMBER_FORMATTER_CACHE_LIMIT,
  );
}

function getCurrencySymbol(): string {
  if (currencySymbol === undefined) {
    numberFormatters += 1;
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
      tokens.push({ kind: "literal", pad: false, text: section.slice(index + 1, end) });
      index = close < 0 ? section.length : close + 1;
      continue;
    }
    if (section[index] === "\\" && index + 1 < section.length) {
      tokens.push({ kind: "literal", pad: false, text: section[index + 1]! });
      index += 2;
      continue;
    }
    const ampm = section.slice(index).match(/^(am\/pm|a\/p)/i)?.[0];
    if (ampm) {
      tokens.push({ kind: "ampm", pad: false, text: "" });
      index += ampm.length;
      continue;
    }
    const lower = section[index]!.toLowerCase();
    if (lower === "y" || lower === "m" || lower === "d" || lower === "h" || lower === "s") {
      let end = index + 1;
      while (end < section.length && section[end]!.toLowerCase() === lower) end++;
      const run = end - index;
      if (lower === "y") tokens.push({ kind: run >= 3 ? "year4" : "year2", pad: false, text: "" });
      else if (lower === "m") {
        tokens.push({
          kind: run >= 4 ? "monthLong" : run === 3 ? "monthShort" : "month",
          pad: run === 2,
          text: "",
        });
      } else if (lower === "d") {
        tokens.push({
          kind: run >= 4 ? "weekdayLong" : run === 3 ? "weekdayShort" : "day",
          pad: run === 2,
          text: "",
        });
      } else if (lower === "h") tokens.push({ kind: "hour", pad: run >= 2, text: "" });
      else tokens.push({ kind: "second", pad: run >= 2, text: "" });
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
    tokens.push({ kind: "literal", pad: false, text: decodeLiteral(literal) });
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
    if (tokens[index]!.kind !== "month") continue;
    let minute = false;
    for (let previous = index - 1; previous >= 0; previous--) {
      if (tokens[previous]!.kind === "literal") continue;
      minute = tokens[previous]!.kind === "hour";
      break;
    }
    if (!minute) {
      for (let next = index + 1; next < tokens.length; next++) {
        if (tokens[next]!.kind === "literal") continue;
        minute = tokens[next]!.kind === "second";
        break;
      }
    }

    if (minute) tokens[index]!.kind = "minute";
  }
}

function compileFormat(code: string): CompiledFormat {
  const cached = formatCache.get(code);
  if (cached) return cached;
  const sections = splitRawSections(code).map(
    (source): CompiledSection => ({
      source,
      dateTokens: compileDateFormat(source),
      numeric: parseNumericFormat(source),
      literal: decodeLiteral(source),
    }),
  );
  const compiled = { sections };
  compiledFormats += 1;
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
  dateTimeFormatters += 1;
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
  const usesAmPm = tokens.some((token) => token.kind === "ampm");
  let output = "";
  for (const token of tokens) {
    switch (token.kind) {
      case "literal":
        output += token.text;
        break;
      case "year4":
        output += String(year).padStart(4, "0");
        break;
      case "year2":
        output += String(((year % 100) + 100) % 100).padStart(2, "0");
        break;
      case "month":
        output += token.pad ? String(month).padStart(2, "0") : String(month);
        break;
      case "monthShort":
      case "monthLong":
        output += calendarFormatter(
          locale,
          "month",
          token.kind === "monthLong" ? "long" : "short",
        ).format(date);
        break;
      case "minute":
        output += token.pad ? String(minute).padStart(2, "0") : String(minute);
        break;
      case "day":
        output += token.pad ? String(day).padStart(2, "0") : String(day);
        break;
      case "weekdayShort":
      case "weekdayLong":
        output += calendarFormatter(
          locale,
          "weekday",
          token.kind === "weekdayLong" ? "long" : "short",
        ).format(date);
        break;
      case "hour": {
        const hour = usesAmPm ? hour24 % 12 || 12 : hour24;
        output += token.pad ? String(hour).padStart(2, "0") : String(hour);
        break;
      }
      case "second":
        output += token.pad ? String(second).padStart(2, "0") : String(second);
        break;
      case "ampm":
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
    const textSection = compileFormat(code).sections[3];
    return textSection === undefined ? value : textSection.literal.replaceAll("@", value);
  }
  if (!Number.isFinite(value)) return "";
  if (!code) return defaultFormatter(locale).format(value);

  const { section, magnitude } = sectionFor(value, compileFormat(code));
  if (section.dateTokens) return renderDate(magnitude, section.dateTokens, locale);

  const descriptor = section.numeric;
  if (!descriptor) return section.literal.replaceAll("@", "");
  const scaled = descriptor.percent ? magnitude * 100 : magnitude;
  const body = descriptor.scientific
    ? formatScientific(scaled, descriptor.decimals, descriptor.exponentDigits)
    : formatter(locale, descriptor.decimals, descriptor.grouped).format(scaled);
  return `${descriptor.prefix}${body}${descriptor.suffix}`;
}
