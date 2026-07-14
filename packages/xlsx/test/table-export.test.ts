import { beforeAll, describe, expect, it } from "bun:test";
import type { Workbook } from "@sheetwrite/core";
import { initSheetwrite, SheetwriteStore, toXlsxTable } from "@sheetwrite/core";
import type { CellObject } from "write-excel-file/universal";
import { buildXlsxModel, registerXlsxBackends, xlsxStyleOf } from "../src/index.js";

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
          { key: "b", header: "B", width: 80, type: "number" },
        ],
      },
    ],
  };
}

describe("table XLSX export", () => {
  it("produces a valid zip container", async () => {
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
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    store.dispose();
  });

  it("carries header and cell styles with per-cell precedence", () => {
    const source = workbook();
    const column = source.sheets[0]!.columns[0]!;
    column.headerStyle = { bold: true };
    column.cellStyle = { color: "#112233", bold: true };
    const store = new SheetwriteStore(source);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "styled" },
          style: { bold: false, backgroundColor: "#ff0000", fontSize: 18, wrap: true },
        },
      ],
    });

    const model = buildXlsxModel(store.getWorkbook(), store)!;
    expect(model.data[0]![0]).toMatchObject({ fontWeight: "bold" });
    expect(model.data[1]![0]).toMatchObject({
      value: "styled",
      textColor: "#112233",
      backgroundColor: "#ff0000",
      fontSize: 18,
      wrap: true,
    });
    expect((model.data[1]![0] as CellObject).fontWeight).toBeUndefined();
    store.dispose();
  });

  it("emits merge spans and null covered cells", () => {
    const source = workbook();
    source.sheets[0]!.merges = [{ r0: 0, c0: 0, r1: 1, c1: 1 }];
    const store = new SheetwriteStore(source);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "anchor" },
        },
      ],
    });

    const data = buildXlsxModel(store.getWorkbook(), store)!.data;
    expect(data[1]![0]).toMatchObject({ value: "anchor", columnSpan: 2, rowSpan: 2 });
    expect(data[1]![1]).toBeNull();
    expect(data[2]![0]).toBeNull();
    expect(data[2]![1]).toBeNull();
    store.dispose();
  });

  it("carries number formats on numeric body cells", () => {
    const source = workbook();
    source.sheets[0]!.columns[1]!.numberFormat = "#,##0.00";
    const store = new SheetwriteStore(source);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: 1234.5 },
        },
      ],
    });

    expect(buildXlsxModel(store.getWorkbook(), store)!.data[1]![1]).toMatchObject({
      value: 1234.5,
      format: "#,##0.00",
    });
    store.dispose();
  });

  it("excludes hidden columns from data and width options", () => {
    const source = workbook();
    source.sheets[0]!.columns[0]!.visible = false;
    source.sheets[0]!.columns[1]!.width = 75;
    const store = new SheetwriteStore(source);
    const model = buildXlsxModel(store.getWorkbook(), store)!;

    expect(model.data[0]).toHaveLength(1);
    expect(model.data[0]![0]).toMatchObject({ value: "B" });
    expect(model.options.columns).toEqual([{ width: 10 }]);
    store.dispose();
  });

  it("carries row heights and the sheet name", () => {
    const source = workbook();
    source.sheets[0]!.rowHeights = new Map([[1, 42]]);
    const store = new SheetwriteStore(source);
    const model = buildXlsxModel(store.getWorkbook(), store)!;

    expect(model.options.sheet).toBe("S");
    expect(model.data[2]![0]).toMatchObject({ height: 42 });
    store.dispose();
  });
  it("maps border/text decoration variants and date/boolean cells without lossy coercion", () => {
    expect(
      xlsxStyleOf({
        underline: true,
        strikethrough: true,
        italic: true,
        align: "right",
        border: {
          left: { color: "#111111", style: "dashed" },
          right: { style: "dotted" },
          top: { width: 2 },
          all: { width: 1 },
        },
      }),
    ).toMatchObject({
      textDecoration: { underline: true, strikethrough: true },
      fontStyle: "italic",
      align: "right",
      leftBorderColor: "#111111",
      leftBorderStyle: "dashed",
      rightBorderStyle: "dotted",
      topBorderStyle: "medium",
      bottomBorderStyle: "thin",
    });
    expect(xlsxStyleOf({ strikethrough: true })).toMatchObject({
      textDecoration: { strikethrough: true },
    });
    expect(xlsxStyleOf(undefined)).toEqual({});

    const source = workbook();
    source.sheets[0]!.columns[0]!.type = "date";
    const store = new SheetwriteStore(source);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: 45_351 },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: true },
        },
      ],
    });
    const data = buildXlsxModel(store.getWorkbook(), store)!.data;
    expect(data[1]![0]).toMatchObject({
      type: Date,
      value: new Date(Date.UTC(2024, 1, 29)),
    });
    expect(data[1]![1]).toMatchObject({ type: Boolean, value: true });
    store.dispose();
  });

  it("returns null only when no active or fallback sheet exists", () => {
    const empty: Workbook = { activeSheet: "missing", sheets: [] };
    const store = new SheetwriteStore(workbook());
    expect(buildXlsxModel(empty, store)).toBeNull();
    store.dispose();
  });
});
