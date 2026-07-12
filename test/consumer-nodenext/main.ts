// Declaration-resolution guard: a strict `moduleResolution: nodenext` consumer
// must be able to follow @sheetwrite/core's d.ts graph (every relative
// specifier inside dist/*.d.ts needs an explicit .js extension).
import type { GridOptions, Theme, Workbook } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { createGridController } from "@sheetwrite/core/adapter";
import "@sheetwrite/core/xlsx";

const workbook: Workbook = {
  activeSheet: "s1",
  sheets: [
    {
      id: "s1",
      name: "Sheet 1",
      rowCount: 1,
      columns: [{ key: "a", header: "A", width: 100, type: "text" }],
    },
  ],
};

const options: GridOptions = { workbook };
const theme: Partial<Theme> = { bg: "#ffffff" };

export { createGrid, createGridController, initSheetwrite, options, theme };
