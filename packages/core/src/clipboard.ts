import { cellScalarToText } from "./cell-input.js";
import type { CellScalar, CellStyle, CellValue } from "./types/cell.js";

// Values beginning with any of these are neutralized on paste so a pasted
// "=cmd|..." or "+...", "-...", "@..." can't become an executable formula.
const INJECTION = /^[=+\-@\t\r]/;

export function neutralizeInjection(value: string): string {
  return INJECTION.test(value) ? `'${value}` : value;
}

function encodeField(value: CellScalar): string {
  if (value === null) return "";
  const s = cellScalarToText(value);
  if (/[\t\n\r"]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize a rectangular block (row-major) to Excel/Sheets-compatible TSV. */
export function toTsv(rows: readonly (readonly CellScalar[])[]): string {
  return rows.map((row) => row.map(encodeField).join("\t")).join("\r\n");
}

/**
 * Parse clipboard TSV into a grid of raw strings. Handles quoted fields that
 * embed tabs/newlines and doubled quotes, matching how spreadsheets emit them.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i++;
    } else if (ch === "\t") {
      endField();
      i++;
    } else if (ch === "\r") {
      // swallow CRLF as one row break
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
    } else if (ch === "\n") {
      endRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // trailing field/row unless the text ended exactly on a row break
  if (field !== "" || row.length > 0) endRow();
  return rows;
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
  /** Row-major matrix of copied cells, in the source's view order. */
  cells: ClipboardCell[][];
  /** The exact TSV written to the system clipboard; the paste-time identity check. */
  tsv: string;
  /** True when produced by cut: formulas paste verbatim (Sheets shifts on copy, not cut). */
  cut: boolean;
}
