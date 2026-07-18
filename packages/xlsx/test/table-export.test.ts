import { beforeAll, describe, expect, it } from "bun:test";
import type { Workbook } from "@sheetwrite/core";
import {
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  XlsxResourceError,
} from "@sheetwrite/core";
import {
  buildXlsxModel,
  registerXlsxBackends,
  sheetwriteTableExportBackend,
} from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

function workbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "S",
        rowCount: 3,
        columns: [
          { key: "a", header: "A", width: 80, type: "text" },
          { key: "b", header: "B", width: 75, type: "number" },
        ],
      },
    ],
  };
}

describe("table XLSX export", () => {
  it("publishes the implementation-neutral backend and produces a ZIP container", async () => {
    expect(sheetwriteTableExportBackend.name).toBe("sheetwrite-ooxml-table");
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "hi" },
        },
      ],
    });
    const bytes = await toXlsxTable(store.getWorkbook(), store);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    store.dispose();
  });

  it("carries styles, formats, dimensions, merges, and hidden-column projection", async () => {
    const source = workbook();
    source.sheets[0]!.columns[0]!.headerStyle = { bold: true };
    source.sheets[0]!.columns[0]!.cellStyle = { color: "#112233", bold: true };
    source.sheets[0]!.columns[1]!.numberFormat = "#,##0.00";
    source.sheets[0]!.merges = [{ r0: 0, c0: 0, r1: 1, c1: 1 }];
    source.sheets[0]!.rowHeights = new Map([[1, 42]]);
    const store = new SheetwriteStore(source);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "styled" },
          style: { bold: false, backgroundColor: "#ff0000", fontSize: 18, wrap: true },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 2, col: 1 },
          value: { kind: "literal", value: 1234.5 },
        },
      ],
    });
    const model = buildXlsxModel(store.getWorkbook(), store)!;
    expect(model.sheetName).toBe("S");
    expect(model.columnWidths).toEqual([80, 75]);
    expect(model.rows[0]![0]).toMatchObject({ value: "A", style: { bold: true } });
    expect(model.rows[1]![0]).toMatchObject({
      value: "styled",
      style: {
        bold: false,
        color: "#112233",
        backgroundColor: "#ff0000",
        fontSize: 18,
        wrap: true,
      },
      columnSpan: 2,
      rowSpan: 2,
    });
    expect(model.rows[1]![1]).toBeNull();
    expect(model.rows[2]![0]).toBeNull();
    expect(model.rows[2]![1]).toBeNull();
    expect(model.rows[3]![1]).toMatchObject({ value: 1234.5, numberFormat: "#,##0.00" });
    expect(model.rowHeights[2]).toBe(42);
    const roundTripped = await fromXlsxWorkbook(await toXlsxTable(store.getWorkbook(), store));
    expect(roundTripped.sheets[0]?.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    store.dispose();

    const projected = workbook();
    projected.sheets[0]!.columns[0]!.visible = false;
    const projectedStore = new SheetwriteStore(projected);
    const projectedModel = buildXlsxModel(projectedStore.getWorkbook(), projectedStore)!;
    expect(projectedModel.columnWidths).toEqual([75]);
    expect(projectedModel.rows[0]!.map((cell) => cell?.value)).toEqual(["B"]);
    projectedStore.dispose();
  });

  it("bounds the dense table model before store allocation", () => {
    const source = workbook();
    source.sheets[0]!.rowCount = 10;
    const store = new SheetwriteStore(source);
    expect(() => buildXlsxModel(store.getWorkbook(), store, { maxCells: 10 })).toThrow(
      XlsxResourceError,
    );
    try {
      buildXlsxModel(store.getWorkbook(), store, { maxCells: 10 });
    } catch (error) {
      expect(error).toMatchObject({
        code: "XLSX_RESOURCE_LIMIT",
        resource: "maxCells",
        actual: 22,
        limit: 10,
        operation: "export",
      });
    }
    store.dispose();
  });

  it("returns null only when no active or fallback sheet exists", () => {
    const store = new SheetwriteStore(workbook());
    expect(buildXlsxModel({ activeSheet: "missing", sheets: [] }, store)).toBeNull();
    store.dispose();
  });
});
