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

const descriptorCache = new Map<string, NumericDescriptor>();
const dateFormatCache = new Map<string, DateToken[] | null>();
const formatterCache = new Map<string, Intl.NumberFormat>();
const defaultFormatterCache = new Map<string, Intl.NumberFormat>();
let currencySymbol: string | undefined;

function splitSections(code: string): string[] {
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

function sectionFor(value: number, code: string): { section: string; magnitude: number } {
  const sections = splitSections(code);
  if (value > 0 || sections.length === 1) return { section: sections[0] ?? "", magnitude: value };
  if (value < 0) {
    return sections[1] !== undefined
      ? { section: sections[1], magnitude: Math.abs(value) }
      : { section: sections[0] ?? "", magnitude: value };
  }
  return { section: sections[2] ?? sections[0] ?? "", magnitude: 0 };
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
  return output.replaceAll("¤", getCurrencySymbol());
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
  const cached = descriptorCache.get(section);
  if (cached) return cached;
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
  descriptorCache.set(section, descriptor);
  return descriptor;
}

function formatter(locale: string, decimals: number, grouped: boolean): Intl.NumberFormat {
  const key = `${locale}:${decimals}:${grouped ? 1 : 0}`;
  let value = formatterCache.get(key);
  if (!value) {
    value = new Intl.NumberFormat(locale, {
      useGrouping: grouped,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatterCache.set(key, value);
  }
  return value;
}

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
  const cached = dateFormatCache.get(section);
  if (cached !== undefined) return cached;
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
  dateFormatCache.set(section, tokens);
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
        output += new Intl.DateTimeFormat(locale, {
          month: token.kind === "monthLong" ? "long" : "short",
          timeZone: "UTC",
        }).format(date);
        break;
      case "minute":
        output += token.pad ? String(minute).padStart(2, "0") : String(minute);
        break;
      case "day":
        output += token.pad ? String(day).padStart(2, "0") : String(day);
        break;
      case "weekdayShort":
      case "weekdayLong":
        output += new Intl.DateTimeFormat(locale, {
          weekday: token.kind === "weekdayLong" ? "long" : "short",
          timeZone: "UTC",
        }).format(date);
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
    const textSection = splitSections(code)[3];
    return textSection === undefined ? value : decodeLiteral(textSection).replaceAll("@", value);
  }
  if (!Number.isFinite(value)) return "";
  if (!code) {
    let formatter = defaultFormatterCache.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale);
      defaultFormatterCache.set(locale, formatter);
    }
    return formatter.format(value);
  }

  const { section, magnitude } = sectionFor(value, code);
  const dateTokens = compileDateFormat(section);
  if (dateTokens) return renderDate(magnitude, dateTokens, locale);

  const descriptor = parseNumericFormat(section);
  if (!descriptor) return decodeLiteral(section).replaceAll("@", "");
  const scaled = descriptor.percent ? magnitude * 100 : magnitude;
  const body = descriptor.scientific
    ? formatScientific(scaled, descriptor.decimals, descriptor.exponentDigits)
    : formatter(locale, descriptor.decimals, descriptor.grouped).format(scaled);
  return `${descriptor.prefix}${body}${descriptor.suffix}`;
}
