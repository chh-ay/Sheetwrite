import type {
  CellBorder,
  CellScalar,
  CellStyle,
  Column,
  Store,
  Workbook,
  XlsxTableExportBackend,
} from "@sheetwrite/core";
import { serialToDate } from "@sheetwrite/core";
import type { CellObject, SheetData, SheetOptions } from "write-excel-file/universal";
import writeXlsxFile from "write-excel-file/universal";

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
    if (column.type === "date") {
      return { type: Date, value: serialToDate(value), format: column.numberFormat };
    }
    return { type: Number, value, format: column.numberFormat };
  }
  if (typeof value === "boolean") return { type: Boolean, value };
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
  const sheet =
    workbook.sheets.find((candidate) => candidate.id === workbook.activeSheet) ??
    workbook.sheets[0];
  if (!sheet) return null;

  const cols: number[] = [];
  for (let col = 0; col < sheet.columns.length; col++) {
    if (sheet.columns[col]!.visible !== false) cols.push(col);
  }
  const columnCount = cols.length;
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
    mergeByAnchor.set(merge.r0 * columnCount + anchorCol, {
      columnSpan: spanCols.length,
      rowSpan,
    });
    for (let row = merge.r0; row < merge.r0 + rowSpan; row++) {
      for (const col of spanCols) {
        const visible = outputCol.get(col)!;
        if (row !== merge.r0 || visible !== anchorCol) {
          covered.add(row * columnCount + visible);
        }
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
    const row: XlsxCell[] = new Array(columnCount);
    for (let visibleCol = 0; visibleCol < columnCount; visibleCol++) {
      const flat = rowIndex * columnCount + visibleCol;
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
      columns: cols.map((col) => ({ width: pxToChars(sheet.columns[col]!.width) })),
    },
  };
}

async function toXlsxTableBytes(workbook: Workbook, store: Store): Promise<Uint8Array> {
  const model = buildXlsxModel(workbook, store);
  if (!model) return new Uint8Array();

  const blob = await writeXlsxFile(model.data, model.options).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Default first-sheet table export backend. */
export const writeExcelFileTableExportBackend: XlsxTableExportBackend = {
  name: "write-excel-file",
  toXlsxTable: toXlsxTableBytes,
};
