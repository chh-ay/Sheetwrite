import type { CellFormat, CellValue } from "./types";

/**
 * Coerce raw text input into a {@link CellValue}, following spreadsheet
 * input-bar conventions:
 *
 * - blank (after trimming) clears the cell to a `null` literal;
 * - text longer than one character beginning with `=` becomes a formula;
 * - in a `number` column a finite numeric string becomes a number literal;
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

  if (type === "number") {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return { kind: "literal", value: parsed };
    }
  }

  return { kind: "literal", value: raw };
}
