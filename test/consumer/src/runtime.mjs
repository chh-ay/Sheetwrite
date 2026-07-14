import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as Core from "@sheetwrite/core";
import * as Adapter from "@sheetwrite/core/adapter";
import * as Shell from "@sheetwrite/core/shell";
import * as Xlsx from "@sheetwrite/xlsx";
import "@sheetwrite/xlsx/register";
import * as ReactAdapter from "@sheetwrite/react";
import * as VueAdapter from "@sheetwrite/vue";
import { load } from "@sheetwrite/wasm";

const entries = {
  "@sheetwrite/core": Core,
  "@sheetwrite/xlsx": Xlsx,
  "@sheetwrite/core/adapter": Adapter,
  "@sheetwrite/core/shell": Shell,
  "@sheetwrite/react": ReactAdapter,
  "@sheetwrite/vue": VueAdapter,
};

for (const [name, entry] of Object.entries(entries)) {
  if (Object.keys(entry).length === 0) {
    throw new Error(`${name} has no runtime exports`);
  }
}

const forbiddenCoreExports = [
  "Patch",
  "LegacyDataSource",
  "toXlsx",
  "fromXlsx",
  "XlsxBackend",
  "XlsxImportBackend",
  "setXlsxBackend",
  "setXlsxImportBackend",
];
for (const name of forbiddenCoreExports) {
  if (name in Core) throw new Error(`@sheetwrite/core still exports removed ${name}`);
}
for (const name of [
  "toXlsxTable",
  "fromXlsxTable",
  "setXlsxTableExportBackend",
  "setXlsxTableImportBackend",
  "toXlsxWorkbook",
  "fromXlsxWorkbook",
  "setXlsxWorkbookBackend",
]) {
  if (typeof Reflect.get(Core, name) !== "function") {
    throw new Error(`@sheetwrite/core is missing canonical runtime export ${name}`);
  }
}

await load();

const cssUrl = import.meta.resolve("@sheetwrite/core/styles.css");
const css = await readFile(fileURLToPath(cssUrl), "utf8");
if (!css.includes(".sheetwrite")) {
  throw new Error("The packed core stylesheet is missing Sheetwrite rules");
}

const shellCssUrl = import.meta.resolve("@sheetwrite/core/shell.css");
const shellCss = await readFile(fileURLToPath(shellCssUrl), "utf8");
if (!shellCss.includes(".sheetwrite-shell")) {
  throw new Error("The packed shell stylesheet is missing shell rules");
}

const wasmUrl = import.meta.resolve("@sheetwrite/wasm/wasm");
const wasm = await readFile(fileURLToPath(wasmUrl));
if (wasm.length < 8 || wasm.subarray(0, 4).toString("hex") !== "0061736d") {
  throw new Error("The packed WASM export is not a WebAssembly binary");
}

const tableWorkbook = {
  activeSheet: "table",
  sheets: [
    {
      id: "table",
      name: "Table",
      rowCount: 1,
      columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
    },
  ],
};
const store = new Core.SheetwriteStore(tableWorkbook);
store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "table", row: 0, col: 0 },
      value: { kind: "literal", value: "packed" },
    },
  ],
});
const tableBytes = await Core.toXlsxTable(store.getWorkbook(), store);
const tableData = await Core.fromXlsxTable(tableBytes);
if (tableData.columns.Value?.[0] !== "packed") {
  throw new Error("Packed table XLSX round-trip changed the value");
}
store.dispose();

const workbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "calc" },
  sheets: [
    {
      id: "calc",
      name: "Calc",
      order: 0,
      rowCount: 1,
      columns: [{ key: "result", header: "Result", width: 80, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [
            {
              rowOffset: 0,
              colOffset: 0,
              value: { kind: "formula", src: "=1+1" },
            },
          ],
        },
      ],
    },
  ],
};
const workbookBytes = await Core.toXlsxWorkbook(workbookSnapshot);
const importedWorkbook = await Core.fromXlsxWorkbook(workbookBytes);
if (importedWorkbook.sheets[0]?.cells[0]?.cells[0]?.value?.src !== "=1+1") {
  throw new Error("Packed workbook XLSX round-trip changed the formula");
}

console.log("Packed runtime, CSS, and WASM checks passed");
