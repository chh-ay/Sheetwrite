import writeXlsxFile from "write-excel-file/universal";
import { setXlsxBackend, type XlsxBackend } from "./export";
import type { CellScalar, Store, Workbook } from "./types";

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
