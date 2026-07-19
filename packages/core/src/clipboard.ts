import { cellScalarToText } from "./cell-input.js";
import {
  type DelimitedTextOptions,
  encodeDelimitedText,
  parseDelimitedText,
} from "./delimited-text.js";
import type { CellScalar, CellStyle, CellValue } from "./types/cell.js";

// Values beginning with any of these are neutralized on paste so a pasted
// "=cmd|..." or "+...", "-...", "@..." can't become an executable formula.
const INJECTION = /^[=+\-@\t\r]/;

export function neutralizeInjection(value: string): string {
  return INJECTION.test(value) ? `'${value}` : value;
}

/**
 * Serialize a rectangular block to external Excel/Sheets-compatible TSV.
 * Formula-sensitive string prefixes are neutralized; numbers (including
 * negatives) remain numeric text. The result is one synchronous in-memory
 * string and has no BOM because it is a clipboard flavor.
 */
export function toTsv(
  rows: readonly (readonly CellScalar[])[],
  options: DelimitedTextOptions = {},
): string {
  function* externalRows(): Generator<readonly string[]> {
    for (const row of rows) {
      yield row.map((value) =>
        typeof value === "string" ? neutralizeInjection(value) : cellScalarToText(value),
      );
    }
  }
  return encodeDelimitedText(externalRows(), "\t", options);
}

/**
 * Parse external clipboard TSV with the shared bounded delimited parser. Quoted
 * tabs/newlines, doubled quotes, bare CR, LF, CRLF, Unicode, trailing empty
 * fields, syntactically present empty records, and one leading BOM are handled.
 * The synchronous input and returned grid are both fully in memory.
 */
export function parseTsv(text: string, options: DelimitedTextOptions = {}): string[][] {
  return parseDelimitedText(text, "\t", options);
}

// ── Internal snapshot ────────────────────────────────────────────────────────

/**
 * One copied cell in an internal clipboard snapshot: its source value (a formula
 * whose src is preserved, or a literal), the scalar it resolved to at copy time
 * (used by paste-values), and the style painted on it.
 */
export interface ClipboardCell {
  value: CellValue;
  resolved: CellScalar;
  style: CellStyle;
}

/**
 * Richer-than-TSV snapshot captured on every copy/cut. Paste reuses it —
 * re-anchoring formulas and carrying styles — when the system clipboard still
 * holds the {@link ClipboardSnapshot.tsv} this snapshot wrote; otherwise paste
 * falls back to parsing whatever external TSV the system clipboard now holds.
 */
export interface ClipboardSnapshot {
  /** Top-left source cell in data coordinates — the formula re-anchor origin. */
  anchor: { row: number; col: number };
  /** Row-major copied cells in the source's view order. */
  cells: ClipboardCell[][];
  /** The exact TSV written to the system clipboard; the paste-time identity check. */
  tsv: string;
  /** True when produced by cut: formulas paste verbatim (Sheets shifts on copy, not cut). */
  cut: boolean;
}
