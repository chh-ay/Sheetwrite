import { readSheet } from "read-excel-file/universal";
import writeXlsxFile, {
  type CellObject,
  type SheetData,
  type SheetOptions,
} from "write-excel-file/universal";
import { dateToSerial, serialToDate } from "./date-serial.js";
import {
  setXlsxBackend,
  setXlsxImportBackend,
  type XlsxBackend,
  type XlsxImportBackend,
} from "./export.js";
import type {
  CellBorder,
  CellScalar,
  CellStyle,
  Column,
  ColumnarData,
  Store,
  Workbook,
} from "./types.js";

type XlsxCell = CellObject | null;

const PIXELS_PER_CHARACTER = 7;
const XLSX_WIDTH_PADDING = 5;

function borderStyle(border: CellBorder): "thin" | "medium" | "dashed" | "dotted" {
  if (border.style === "dashed") return "dashed";
  if (border.style === "dotted") return "dotted";
  return (border.width ?? 1) >= 2 ? "medium" : "thin";
}

/** Translate Sheetwrite's style model into write-excel-file cell properties. */
export function xlsxStyleOf(style: CellStyle | undefined): CellObject {
  if (!style) return {};

  const out: CellObject = {};
  if (style.bold) out.fontWeight = "bold";
  if (style.italic) out.fontStyle = "italic";
  if (style.underline || style.strikethrough) {
    out.textDecoration = style.underline
      ? { underline: true, strikethrough: style.strikethrough }
      : { strikethrough: true };
  }
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.color !== undefined) out.textColor = style.color;
  if (style.backgroundColor !== undefined) out.backgroundColor = style.backgroundColor;
  if (style.align !== undefined) out.align = style.align;
  if (style.wrap !== undefined) out.wrap = style.wrap;

  const borders = style.border;
  if (borders) {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const border = borders[side] ?? borders.all;
      if (!border) continue;
      const colorKey = `${side}BorderColor` as const;
      const styleKey = `${side}BorderStyle` as const;
      if (border.color !== undefined) out[colorKey] = border.color;
      out[styleKey] = borderStyle(border);
    }
  }
  return out;
}

function cellOf(value: CellScalar, column: Column): XlsxCell {
  if (typeof value === "number") {
    // Excel dates are real Date cells so workbook consumers preserve date
    // semantics; Sheetwrite's serial remains the storage representation.
    if (column.type === "date") {
      return { type: Date, value: serialToDate(value), format: column.numberFormat };
    }
    return { type: Number, value, format: column.numberFormat };
  }
  if (typeof value === "string") return { type: String, value };
  return null;
}

function pxToChars(px: number): number {
  return Math.max(1, Math.round((px - XLSX_WIDTH_PADDING) / PIXELS_PER_CHARACTER));
}

export interface XlsxModel {
  data: SheetData;
  options: SheetOptions<Blob>;
}

/** Build the default writer's complete active-sheet model without serializing it. */
export function buildXlsxModel(workbook: Workbook, store: Store): XlsxModel | null {
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheet) ?? workbook.sheets[0];
  if (!sheet) return null;

  const cols: number[] = [];
  for (let c = 0; c < sheet.columns.length; c++) {
    if (sheet.columns[c]!.visible !== false) cols.push(c);
  }
  const n = cols.length;
  const view = store.getVisibleWindow(sheet.id, { start: 0, end: sheet.rowCount }, cols);
  const outputCol = new Map(cols.map((col, index) => [col, index]));
  const mergeByAnchor = new Map<number, { columnSpan: number; rowSpan: number }>();
  const covered = new Set<number>();

  for (const merge of sheet.merges ?? []) {
    const anchorCol = outputCol.get(merge.c0);
    if (anchorCol === undefined || merge.r0 < 0 || merge.r0 >= sheet.rowCount) continue;
    const spanCols = cols.filter((col) => col >= merge.c0 && col <= merge.c1);
    if (spanCols.length === 0) continue;
    const rowSpan = Math.min(merge.r1, sheet.rowCount - 1) - merge.r0 + 1;
    mergeByAnchor.set(merge.r0 * n + anchorCol, {
      columnSpan: spanCols.length,
      rowSpan,
    });
    for (let row = merge.r0; row < merge.r0 + rowSpan; row++) {
      for (const col of spanCols) {
        const visible = outputCol.get(col)!;
        if (row !== merge.r0 || visible !== anchorCol) covered.add(row * n + visible);
      }
    }
  }

  const data: SheetData = [
    cols.map((col) => ({
      type: String,
      value: sheet.columns[col]!.header,
      ...xlsxStyleOf(sheet.columns[col]!.headerStyle),
    })),
  ];
  for (let rowIndex = 0; rowIndex < sheet.rowCount; rowIndex++) {
    const row: XlsxCell[] = new Array(n);
    for (let visibleCol = 0; visibleCol < n; visibleCol++) {
      const flat = rowIndex * n + visibleCol;
      if (covered.has(flat)) {
        row[visibleCol] = null;
        continue;
      }

      const column = sheet.columns[cols[visibleCol]!]!;
      const style = { ...column.cellStyle, ...view.styles[view.styleIds[flat] ?? 0] };
      const cell = cellOf(view.values[flat] ?? null, column);
      if (cell) Object.assign(cell, xlsxStyleOf(style), mergeByAnchor.get(flat));
      if (visibleCol === 0 && sheet.rowHeights?.has(rowIndex)) {
        row[visibleCol] ??= {};
        row[visibleCol]!.height = sheet.rowHeights.get(rowIndex);
      }
      row[visibleCol] = cell ?? row[visibleCol] ?? null;
    }
    data.push(row);
  }

  return {
    data,
    options: {
      sheet: sheet.name,
      // Writer widths are character units; 7 px/glyph plus 5 px padding is
      // the inverse of the conventional spreadsheet width approximation.
      columns: cols.map((col) => ({ width: pxToChars(sheet.columns[col]!.width) })),
    },
  };
}

async function toXlsxBytes(workbook: Workbook, store: Store): Promise<Uint8Array> {
  const model = buildXlsxModel(workbook, store);
  if (!model) return new Uint8Array();

  const blob = await writeXlsxFile(model.data, model.options).toBlob();
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
