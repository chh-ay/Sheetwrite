import { beforeAll, describe, expect, it } from "bun:test";
import type {
  Workbook,
  WorkbookSnapshot,
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
} from "@sheetwrite/core";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";

beforeAll(async () => {
  await initSheetwrite();
});

function workbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "Table",
        rowCount: 1,
        columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
      },
    ],
  };
}

function workbookSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Workbook",
        order: 0,
        rowCount: 1,
        columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
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
                value: { kind: "literal", value: "registered" },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("XLSX package registration", () => {
  it("keeps the root side-effect free and registers every backend idempotently", async () => {
    const store = new SheetwriteStore(workbook());
    const snapshot = workbookSnapshot();
    const tableExportBackend: XlsxTableExportBackend = {
      name: "root-side-effect-tripwire-export",
      toXlsxTable: async () => new Uint8Array([1]),
    };
    const tableImportBackend: XlsxTableImportBackend = {
      name: "root-side-effect-tripwire-import",
      fromXlsxTable: async () => ({ rowCount: 0, columns: {} }),
    };
    const workbookBackend: XlsxWorkbookBackend = {
      name: "root-side-effect-tripwire-workbook",
      toXlsxWorkbook: async () => new Uint8Array([2]),
      fromXlsxWorkbook: async () => snapshot,
    };
    setXlsxTableExportBackend(tableExportBackend);
    setXlsxTableImportBackend(tableImportBackend);
    setXlsxWorkbookBackend(workbookBackend);

    // Dynamic import is the behavior under test: registration must not occur on root load.
    const xlsx = await import("../src/index.js");
    await expect(toXlsxTable(store.getWorkbook(), store)).resolves.toEqual(new Uint8Array([1]));
    await expect(fromXlsxTable(new Uint8Array())).resolves.toEqual({ rowCount: 0, columns: {} });
    await expect(toXlsxWorkbook(snapshot)).resolves.toEqual(new Uint8Array([2]));
    await expect(fromXlsxWorkbook(new Uint8Array())).resolves.toBe(snapshot);

    xlsx.registerXlsxBackends();
    xlsx.registerXlsxBackends();
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "registered" },
        },
      ],
    });
    const tableBytes = await toXlsxTable(store.getWorkbook(), store);
    expect(tableBytes[0]).toBe(0x50);
    expect(await fromXlsxTable(tableBytes)).toEqual({
      rowCount: 1,
      columns: { Value: ["registered"] },
    });
    const workbookBytes = await toXlsxWorkbook(snapshot);
    expect((await fromXlsxWorkbook(workbookBytes)).sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: "registered",
    });

    setXlsxTableExportBackend(null as never);
    setXlsxTableImportBackend(null as never);
    setXlsxWorkbookBackend(null as never);
    store.dispose();
  });
});
