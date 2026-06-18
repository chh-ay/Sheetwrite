import type { CellScalar } from "./types";

// Values beginning with any of these are neutralized on paste so a pasted
// "=cmd|..." or "+...", "-...", "@..." can't become an executable formula.
const INJECTION = /^[=+\-@\t\r]/;

export function neutralizeInjection(value: string): string {
  return INJECTION.test(value) ? `'${value}` : value;
}

function encodeField(value: CellScalar): string {
  if (value === null) return "";
  const s = typeof value === "number" ? String(value) : value;
  // Excel/Sheets quote a field that contains tab, newline, or a quote.
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
