import { cellScalarToText } from "./cell-input.js";
import { neutralizeInjection } from "./clipboard.js";
import type {
  CellFormat,
  CellScalar,
  Column,
  ColumnarData,
  Grid,
  Range,
  Sheet,
  Store,
  Workbook,
  WorkbookSnapshot,
} from "./types.js";

function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tsvField(text: string): string {
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Neutralize a TEXT field before it is quoted: a string beginning with one of
 * `= + - @ \t \r` is prefixed with `'` so it cannot execute as a formula when the
 * file is reopened in Excel/Sheets. Numeric values are legitimate data and pass
 * through untouched — a negative number is a number, not an attack vector.
 */
export function safeText(value: CellScalar): string {
  return typeof value === "string" ? neutralizeInjection(value) : cellScalarToText(value);
}

/** Harden a column header (always text) exactly as a text cell value. */
export function safeHeader(header: string): string {
  return neutralizeInjection(header);
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

  const headerLine = cols.map((c) => csvField(safeHeader(sheet.columns[c]!.header))).join(",");
  const lines: string[] = [headerLine];
  for (let r = 0; r < sheet.rowCount; r++) {
    const row: string[] = new Array(n);
    for (let cj = 0; cj < n; cj++) {
      const value = view.values[r * n + cj] ?? null;
      row[cj] = csvField(safeText(value));
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
    for (let cj = 0; cj < n; cj++) cells[cj] = tsvField(safeText(view.values[r * n + cj] ?? null));
    rows.push(cells.join("\t"));
  }
  return rows.join("\r\n");
}

// ── CSV / TSV import ─────────────────────────────────────────────────────────

/**
 * Parse RFC-4180-style CSV into a grid of raw strings: comma-delimited, with
 * `"`-quoted fields that may embed commas, newlines, and doubled quotes, plus
 * CR / LF / CRLF row breaks. A leading UTF-8 BOM is stripped. This mirrors
 * `parseTsv` from clipboard.ts exactly, but splits on commas instead of tabs.
 */
export function parseCsv(text: string): string[][] {
  // Drop a leading UTF-8 BOM so the first header cell is not "\ufeffName".
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

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

  while (i < input.length) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
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
    } else if (ch === ",") {
      endField();
      i++;
    } else if (ch === "\r") {
      // swallow CRLF as one row break
      if (input[i + 1] === "\n") i++;
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

/**
 * Coerce one raw CSV field into a `CellScalar` for a column of the given type.
 * A missing or empty field becomes `null`; a `number` column parses a finite
 * number/currency (non-numeric text falls back to `null`); every other type
 * keeps the raw string.
 */
function coerceField(raw: string | undefined, type: CellFormat): CellScalar {
  if (raw === undefined || raw === "") return null;

  if (type === "number" || type === "currency") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return raw;
}

/**
 * Parse CSV `text` into `ColumnarData` keyed by `columns[i].key` — the symmetric
 * counterpart to `toCsv`. The first parsed row is treated as the header and
 * consumed; each remaining row maps positionally onto `columns`. CSV columns
 * beyond `columns.length` are ignored, missing trailing cells become `null`, and
 * `number` columns coerce their fields to finite numbers.
 */
export function fromCsv(text: string, columns: readonly Column[]): ColumnarData {
  const grid = parseCsv(text);

  // The first parsed row is the header; the body is everything after it.
  const body = grid.slice(1);
  const rowCount = body.length;

  // One output array per declared column, sized to the body up front.
  const result: Record<string, CellScalar[]> = {};
  for (const column of columns) {
    result[column.key] = new Array<CellScalar>(rowCount);
  }

  for (let r = 0; r < rowCount; r++) {
    const cells = body[r]!;
    for (let c = 0; c < columns.length; c++) {
      const column = columns[c]!;
      result[column.key]![r] = coerceField(cells[c], column.type);
    }
  }

  return { rowCount, columns: result };
}

/** Browser-only download helper; throws in non-DOM runtimes. */
export function downloadBytes(bytes: Uint8Array | string, filename: string, mime: string): void {
  if (typeof document === "undefined") {
    throw new Error("Sheetwrite: downloadBytes requires a browser environment");
  }

  // A view over a SharedArrayBuffer is rejected by Blob; copy only then.
  const needsCopy =
    typeof bytes !== "string" &&
    typeof SharedArrayBuffer !== "undefined" &&
    bytes.buffer instanceof SharedArrayBuffer;
  const part: BlobPart = needsCopy ? new Uint8Array(bytes) : (bytes as BlobPart);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // A synchronous revoke can race the download navigation in some engines.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Pluggable first-row-header, first-sheet table export backend.
 */
export interface XlsxTableExportBackend {
  name: string;
  toXlsxTable(workbook: Workbook, store: Store): Promise<Uint8Array>;
}

let tableExportBackend: XlsxTableExportBackend | null = null;

export function setXlsxTableExportBackend(next: XlsxTableExportBackend): void {
  tableExportBackend = next;
}

function missingXlsxBackend(functionName: string): Error {
  return new Error(
    `Sheetwrite: XLSX backend not registered. Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling ${functionName}.`,
  );
}

export function toXlsxTable(workbook: Workbook, store: Store): Promise<Uint8Array> {
  if (!tableExportBackend) throw missingXlsxBackend("toXlsxTable");
  return tableExportBackend.toXlsxTable(workbook, store);
}

// ── xlsx import ──────────────────────────────────────────────────────────────

/**
 * Pluggable table import backend. Parses raw `.xlsx` bytes into the same
 * `ColumnarData` shape `fromCsv` returns, so host ingestion code can stay
 * format-agnostic.
 */
export interface XlsxTableImportBackend {
  name: string;
  fromXlsxTable(data: ArrayBuffer | Uint8Array): Promise<ColumnarData>;
}

let tableImportBackend: XlsxTableImportBackend | null = null;

export function setXlsxTableImportBackend(next: XlsxTableImportBackend): void {
  tableImportBackend = next;
}

/**
 * Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
 * row is treated as the header and its cell text becomes each column's key.
 * Numbers stay numbers, date cells use the date-serial convention, strings are
 * verbatim, and empty cells become `null`.
 */
export function fromXlsxTable(data: ArrayBuffer | Uint8Array): Promise<ColumnarData> {
  if (!tableImportBackend) throw missingXlsxBackend("fromXlsxTable");
  return tableImportBackend.fromXlsxTable(data);
}

// ── Workbook-level XLSX round-trip ───────────────────────────────────────────

export interface XlsxWorkbookWarning {
  code:
    | "boolean-literal"
    | "rich-text"
    | "hyperlink"
    | "unsupported-cell-value"
    | "unsupported-feature";
  message: string;
  sheet?: string;
  cell?: string;
}

export interface XlsxWorkbookOptions {
  /** Abort before or between workbook model operations. */
  signal?: AbortSignal;
  /**
   * Maximum populated cells accepted by the in-memory ExcelJS document model.
   * Defaults to 1,000,000. Use a lower host-specific bound for constrained
   * browsers; table APIs remain available for larger streaming interchange.
   */
  maxCells?: number;
  onWarning?: (warning: XlsxWorkbookWarning) => void;
}

export interface XlsxWorkbookBackend {
  name: string;
  toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
  fromXlsxWorkbook(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<WorkbookSnapshot>;
}

let workbookBackend: XlsxWorkbookBackend | null = null;

export function setXlsxWorkbookBackend(next: XlsxWorkbookBackend): void {
  workbookBackend = next;
}

function workbookSnapshotOf(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
): WorkbookSnapshot {
  return "schemaVersion" in input ? input : input.exportSnapshot();
}

/** Formula-preserving, multi-sheet workbook export through the optional XLSX backend. */
export function toXlsxWorkbook(
  input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  if (!workbookBackend) throw missingXlsxBackend("toXlsxWorkbook");
  return workbookBackend.toXlsxWorkbook(workbookSnapshotOf(input), options);
}

/** Formula-preserving, multi-sheet workbook import through the optional XLSX backend. */
export function fromXlsxWorkbook(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  if (!workbookBackend) throw missingXlsxBackend("fromXlsxWorkbook");
  return workbookBackend.fromXlsxWorkbook(data, options);
}
