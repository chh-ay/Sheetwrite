import type { CellScalar, ColumnarData, XlsxTableImportBackend } from "@sheetwrite/core";
import { dateToSerial } from "@sheetwrite/core";
import { readSheet } from "read-excel-file/universal";

function scalarOfCell(value: unknown): CellScalar {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateToSerial(value);
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function headerKeys(header: readonly unknown[]): string[] {
  const keys = new Array<string>(header.length);
  const seen = new Set<string>();
  for (let column = 0; column < header.length; column++) {
    const raw = header[column];
    let key = raw === null || raw === undefined ? "" : String(raw);
    if (key === "") key = `column${column + 1}`;
    while (seen.has(key)) key = `${key}_${column + 1}`;
    seen.add(key);
    keys[column] = key;
  }
  return keys;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!(data instanceof Uint8Array)) return data;
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

async function fromXlsxTableBytes(data: ArrayBuffer | Uint8Array): Promise<ColumnarData> {
  const rows = await readSheet(toArrayBuffer(data), { trim: false });
  const columns: Record<string, CellScalar[]> = Object.create(null);
  if (rows.length === 0) return { rowCount: 0, columns };

  const header = rows[0] ?? [];
  const keys = headerKeys(header);
  const columnCount = keys.length;
  const body = rows.slice(1);
  const rowCount = body.length;
  for (const key of keys) columns[key] = new Array<CellScalar>(rowCount);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row = body[rowIndex] ?? [];
    for (let column = 0; column < columnCount; column++) {
      columns[keys[column]!]![rowIndex] = scalarOfCell(row[column]);
    }
  }

  return { rowCount, columns };
}

/** Default first-sheet table import backend. */
export const readExcelFileTableImportBackend: XlsxTableImportBackend = {
  name: "read-excel-file",
  fromXlsxTable: fromXlsxTableBytes,
};
