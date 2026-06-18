const PLACEHOLDER = /[#0.,]/;

/**
 * Best-effort Excel number-format renderer. Supports the common presets — fixed
 * decimals, thousands grouping, percent, and a literal prefix/suffix (currency,
 * `%`) — so the on-screen preview matches the exported value. Not a full Excel
 * format engine (no date codes, no conditional sections).
 */
export function formatNumber(value: number, code?: string): string {
  if (!Number.isFinite(value)) return "";
  if (!code) return value.toLocaleString();

  const percent = code.includes("%");
  const scaled = percent ? value * 100 : value;

  const dot = code.indexOf(".");
  let decimals = 0;
  if (dot >= 0) {
    for (let i = dot + 1; i < code.length; i++) {
      const ch = code[i]!;
      if (ch === "0" || ch === "#") decimals++;
      else break;
    }
  }

  const grouped = code.includes(",");

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

  const body = grouped
    ? scaled.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : scaled.toFixed(decimals);

  return `${prefix}${body}${suffix}`;
}
