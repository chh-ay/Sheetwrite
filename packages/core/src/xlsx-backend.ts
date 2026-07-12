import { readSheet } from "read-excel-file/universal";
import writeXlsxFile from "write-excel-file/universal";
import { dateToSerial } from "./date-serial.js";
import {
  setXlsxBackend,
  setXlsxImportBackend,
  type XlsxBackend,
  type XlsxImportBackend,
} from "./export.js";
import type { CellScalar, ColumnarData, Store, Workbook } from "./types.js";

// write-excel-file row cell: a typed object, or null for an empty cell.
type Cell = { type: typeof Number; value: number } | { type: typeof String; value: string } | null;

function cellOf(value: CellScalar): Cell {
  if (typeof value === "number") return { type: Number, value };
  if (typeof value === "string") return { type: String, value };
  return null;
}

async function toXlsxBytes(workbook: Workbook, store: Store): Promise<Uint8Array> {
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheet) ?? workbook.sheets[0];
  if (!sheet) return new Uint8Array();

  const cols: number[] = [];
  for (let c = 0; c < sheet.columns.length; c++) {
    if (sheet.columns[c]!.visible !== false) cols.push(c);
  }
  const n = cols.length;
  const view = store.getVisibleWindow(sheet.id, { start: 0, end: sheet.rowCount }, cols);

  const data: Cell[][] = [];
  data.push(cols.map((c) => ({ type: String, value: sheet.columns[c]!.header })));
  for (let r = 0; r < sheet.rowCount; r++) {
    const row: Cell[] = new Array(n);
    for (let cj = 0; cj < n; cj++) row[cj] = cellOf(view.values[r * n + cj] ?? null);
    data.push(row);
  }

  const blob = await writeXlsxFile(data).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Default xlsx backend (MIT `write-excel-file`). Importing this module registers it. */
export const writeExcelFileBackend: XlsxBackend = {
  name: "write-excel-file",
  toXlsx: toXlsxBytes,
};

setXlsxBackend(writeExcelFileBackend);

// ── xlsx import ──────────────────────────────────────────────────────────────

// read-excel-file yields a `Date` for date-formatted cells, a `number` for
// numbers, a `string` for text, and `null` for empty cells. Anything else (e.g.
// a boolean) degrades to its string form so the value is never dropped.
function scalarOfCell(value: unknown): CellScalar {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateToSerial(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  return String(value);
}

// Turn the header row into one key per column: its cell text, or a positional
// `column<N>` fallback when blank, disambiguated so no column overwrites another.
function headerKeys(header: readonly unknown[]): string[] {
  const keys = new Array<string>(header.length);
  const seen = new Set<string>();
  for (let c = 0; c < header.length; c++) {
    const raw = header[c];
    let key = raw === null || raw === undefined ? "" : String(raw);
    if (key === "") key = `column${c + 1}`;
    while (seen.has(key)) key = `${key}_${c + 1}`;
    seen.add(key);
    keys[c] = key;
  }
  return keys;
}

// `read-excel-file/universal` accepts a Blob or an ArrayBuffer. A Uint8Array's
// backing `.buffer` may be shared or subarray-backed, which the DOM/BufferSource
// types reject, so copy into a standalone ArrayBuffer for that input.
function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!(data instanceof Uint8Array)) return data;
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

async function fromXlsxBytes(data: ArrayBuffer | Uint8Array): Promise<ColumnarData> {
  // `trim: false` keeps string cells verbatim. Only the first sheet is read.
  const rows = await readSheet(toArrayBuffer(data), { trim: false });
  if (rows.length === 0) return { rowCount: 0, columns: {} };

  const header = rows[0] ?? [];
  const keys = headerKeys(header);
  const n = keys.length;

  // The first row is the header; the body is every row after it.
  const body = rows.slice(1);
  const rowCount = body.length;

  const columns: Record<string, CellScalar[]> = {};
  for (const key of keys) columns[key] = new Array<CellScalar>(rowCount);

  for (let r = 0; r < rowCount; r++) {
    const row = body[r] ?? [];
    for (let c = 0; c < n; c++) columns[keys[c]!]![r] = scalarOfCell(row[c]);
  }

  return { rowCount, columns };
}

/** Default xlsx import backend (MIT `read-excel-file`). Importing this module registers it. */
export const readExcelFileImportBackend: XlsxImportBackend = {
  name: "read-excel-file",
  fromXlsx: fromXlsxBytes,
};

setXlsxImportBackend(readExcelFileImportBackend);
