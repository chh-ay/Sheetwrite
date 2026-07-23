import type { CellScalar, ColumnarData, XlsxTableImportBackend } from "@sheetwrite/core";
import { readWorkbook } from "./reader.js";
import { assertResource, createCodecContext, xlsxFailure } from "./resources.js";

function headerKeys(header: readonly CellScalar[]): string[] {
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

/** Default bounded first-sheet table import backend. */
export const sheetwriteTableImportBackend: XlsxTableImportBackend = {
  name: "sheetwrite-ooxml-table",
  async fromXlsxTable(data, options): Promise<ColumnarData> {
    try {
      const context = createCodecContext("import", options);
      const snapshot = readWorkbook(data, context);
      const sheet = snapshot.sheets[0];
      const columns: Record<string, CellScalar[]> = Object.create(null);
      if (!sheet) return { rowCount: 0, columns };
      const values = new Map<number, CellScalar>();
      for (const block of sheet.cells) {
        for (const cell of block.cells) {
          const row = block.startRow + cell.rowOffset;
          const col = block.startCol + cell.colOffset;
          const value =
            cell.value.kind === "literal"
              ? cell.value.value
              : cell.value.kind === "formula"
                ? cell.value.src
                : null;
          values.set(row * sheet.columns.length + col, value);
        }
      }
      const header = sheet.columns.map((_column, col) => values.get(col) ?? null);
      const keys = headerKeys(header);
      const rowCount = Math.max(0, sheet.rowCount - 1);
      assertResource(context, "maxCells", rowCount * keys.length);
      for (const key of keys) columns[key] = new Array<CellScalar>(rowCount).fill(null);
      for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < keys.length; col++) {
          columns[keys[col]!]![row] = values.get((row + 1) * sheet.columns.length + col) ?? null;
        }
      }
      return { rowCount, columns };
    } catch (error) {
      throw xlsxFailure(error, "import", "sheetwrite-ooxml-table");
    }
  },
};
