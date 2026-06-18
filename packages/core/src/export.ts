import { neutralizeInjection } from "./clipboard";
import type { CellScalar, Range, Sheet, Store, Workbook } from "./types";

function scalarToText(value: CellScalar): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  return value;
}

function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tsvField(value: CellScalar): string {
  const s = scalarToText(value);
  return /[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function visibleColumns(sheet: Sheet): number[] {
  const out: number[] = [];
  for (let c = 0; c < sheet.columns.length; c++) {
    if (sheet.columns[c]!.visible !== false) out.push(c);
  }
  return out;
}

/**
 * CSV (UTF-8 BOM, CRLF). String values are injection-hardened (a leading
 * `= + - @ \t \r` is prefixed with `'`). Reads the whole sheet as one bulk
 * window, not cell-by-cell.
 */
export function toCsv(sheet: Sheet, store: Store): string {
  const cols = visibleColumns(sheet);
  const n = cols.length;
  const view = store.getVisibleWindow(sheet.id, { start: 0, end: sheet.rowCount }, cols);

  const lines: string[] = [cols.map((c) => csvField(sheet.columns[c]!.header)).join(",")];
  for (let r = 0; r < sheet.rowCount; r++) {
    const row: string[] = new Array(n);
    for (let cj = 0; cj < n; cj++) {
      const value = view.values[r * n + cj] ?? null;
      const text = typeof value === "string" ? neutralizeInjection(value) : scalarToText(value);
      row[cj] = csvField(text);
    }
    lines.push(row.join(","));
  }
  return `\ufeff${lines.join("\r\n")}`;
}

/** TSV for a rectangular range (Excel/Sheets clipboard format). */
export function toTsv(range: Range, store: Store): string {
  const cols: number[] = [];
  for (let c = range.start.col; c <= range.end.col; c++) cols.push(c);
  const n = cols.length;
  const nRows = range.end.row - range.start.row + 1;
  const view = store.getVisibleWindow(
    range.sheet,
    { start: range.start.row, end: range.end.row + 1 },
    cols,
  );

  const rows: string[] = [];
  for (let r = 0; r < nRows; r++) {
    const cells: string[] = new Array(n);
    for (let cj = 0; cj < n; cj++) cells[cj] = tsvField(view.values[r * n + cj] ?? null);
    rows.push(cells.join("\t"));
  }
  return rows.join("\r\n");
}

/** Framework/runtime-agnostic save (separate from "produce bytes"). */
export function downloadBytes(bytes: Uint8Array | string, filename: string, mime: string): void {
  const part: BlobPart = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Pluggable xlsx backend (Plan: `write-excel-file` first, Rust xlsx later
 * without changing this contract).
 */
export interface XlsxBackend {
  name: string;
  toXlsx(workbook: Workbook, store: Store): Promise<Uint8Array>;
}

let backend: XlsxBackend | null = null;

export function setXlsxBackend(b: XlsxBackend): void {
  backend = b;
}

export function toXlsx(workbook: Workbook, store: Store): Promise<Uint8Array> {
  if (!backend) {
    throw new Error("Sheetwrite: no xlsx backend configured (import and register one first)");
  }
  return backend.toXlsx(workbook, store);
}
