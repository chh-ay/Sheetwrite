const PLACEHOLDER = /[#0.,]/;

/**
 * Parsed shape of an Excel-style number-format `code`. Computed once per distinct
 * code (see {@link parseFormat}) so the per-character scan stays off the paint
 * hot path, where {@link formatNumber} runs for every visible numeric cell.
 */
interface FormatDescriptor {
  /** Whether the value is scaled by 100 and rendered as a percentage. */
  percent: boolean;
  /** Number of fractional digits to render (fixed). */
  decimals: number;
  /** Whether to insert locale thousands separators. */
  grouped: boolean;
  /** Literal text emitted before the formatted number (e.g. a currency symbol). */
  prefix: string;
  /** Literal text emitted after the formatted number (e.g. `%`). */
  suffix: string;
}

// ── Caches ──────────────────────────────────────────────────────────────────
// formatNumber is called once per visible numeric cell on every paint, so both
// the format parse and the Intl formatter construction are memoized: descriptors
// keyed by their raw code, formatters keyed by their (grouped, decimals) shape.

const descriptorCache = new Map<string, FormatDescriptor>();
const formatterCache = new Map<string, Intl.NumberFormat>();
let defaultFormatter: Intl.NumberFormat | undefined;

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

  const descriptor: FormatDescriptor = { percent, decimals, grouped, prefix, suffix };
  descriptorCache.set(code, descriptor);
  return descriptor;
}

/**
 * Return a cached `Intl.NumberFormat` for the given grouping/decimals shape,
 * constructing one only the first time each shape is seen. Used for the grouped
 * rendering path; the ungrouped path uses the cheaper `toFixed`.
 */
function formatterFor(grouped: boolean, decimals: number): Intl.NumberFormat {
  const key = `${grouped ? 1 : 0}:${decimals}`;

  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      useGrouping: grouped,
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
 * Best-effort Excel number-format renderer. Supports the common presets — fixed
 * decimals, thousands grouping, percent, and a literal prefix/suffix (currency,
 * `%`) — so the on-screen preview matches the exported value. Not a full Excel
 * format engine (no date codes, no conditional sections).
 *
 * Both the format parse and the `Intl.NumberFormat` instances are memoized
 * module-side, so repeated calls with the same code (the common paint case)
 * avoid re-parsing and formatter construction.
 */
export function formatNumber(value: number, code?: string): string {
  if (!Number.isFinite(value)) return "";
  if (!code) return getDefaultFormatter().format(value);

  const { percent, decimals, grouped, prefix, suffix } = parseFormat(code);

  const scaled = percent ? value * 100 : value;

  const body = grouped ? formatterFor(grouped, decimals).format(scaled) : scaled.toFixed(decimals);

  return `${prefix}${body}${suffix}`;
}
