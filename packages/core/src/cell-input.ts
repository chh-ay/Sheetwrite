import { parseDateInput } from "./date-serial.js";
import type { CellFormat, CellScalar, CellValue } from "./types/cell.js";

/** Spreadsheet display text for a resolved scalar. */
export function cellScalarToText(value: CellScalar): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/**
 * Coerce raw text input into a {@link CellValue}, following spreadsheet
 * input-bar conventions:
 *
 * - blank (after trimming) clears the cell to a `null` literal;
 * - text longer than one character beginning with `=` becomes a formula;
 * - in a `number` column a finite numeric string becomes a number literal;
 * - in a `date` column a recognized date string ({@link parseDateInput}) becomes
 *   its serial-number literal;
 * - in a `currency` column a currency string ({@link parseCurrencyInput}) becomes
 *   a plain number literal;
 * - anything else is stored verbatim as a text literal (the untrimmed `raw`).
 *
 * Shared by the grid's inline editor and any host-built formula bar, so input
 * parsing is identical everywhere instead of re-derived per consumer.
 */

export function parseCellInput(raw: string, type: CellFormat): CellValue {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { kind: "literal", value: null };
  }

  if (trimmed.length > 1 && trimmed.startsWith("=")) {
    return { kind: "formula", src: trimmed };
  }

  if (/^(TRUE|FALSE)$/i.test(trimmed)) {
    return { kind: "literal", value: trimmed.toUpperCase() === "TRUE" };
  }

  if (type === "number" || type === "currency") {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return { kind: "literal", value: parsed };
    }
  }

  if (type === "date") {
    const serial = parseDateInput(trimmed);
    if (serial !== null) {
      return { kind: "literal", value: serial };
    }
  }

  if (type === "currency") {
    const amount = parseCurrencyInput(trimmed);
    if (amount !== null) {
      return { kind: "literal", value: amount };
    }
  }

  return { kind: "literal", value: raw };
}

/**
 * Parse imported text as a literal using the same boolean, number, date, and
 * currency rules as {@link parseCellInput}. Unlike interactive entry, a leading
 * `=` remains inert text. Declared date columns also accept an existing finite
 * date serial so delimited export/import preserves numeric dates.
 */
export function parseCellLiteralInput(raw: string, type: CellFormat): CellScalar {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (type === "date") {
    const serial = Number(trimmed);
    if (Number.isFinite(serial)) return serial;
  }
  const parsed = parseCellInput(raw, type);
  return parsed.kind === "literal" ? parsed.value : raw;
}

/**
 * Parse a currency-formatted string into a plain number, or `null` when the
 * remaining text is not numeric. Strips currency symbols (`$ € £ ¥ ¤`), thousands
 * grouping (`,`), and whitespace, and reads accounting-style parentheses
 * (`(1,234.50)`) as a negative amount. Grouping/decimals follow the US locale the
 * renderer uses.
 */
export function parseCurrencyInput(raw: string): number | null {
  let body = raw.replace(/[$€£¥¤,\s]/g, "");
  if (body === "") return null;

  let sign = 1;
  if (body.startsWith("(") && body.endsWith(")")) {
    sign = -1;
    body = body.slice(1, -1);
  }
  if (body === "") return null;

  const parsed = Number(body);
  return Number.isFinite(parsed) ? sign * parsed : null;
}
