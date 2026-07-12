import { beforeAll, describe, expect, it } from "bun:test";
import writeXlsxFile, { type SheetData } from "write-excel-file/universal";
import { dateToSerial } from "../src/date-serial.js";
import { initSheetwrite } from "../src/grid.js";
import { fromXlsx, setXlsxImportBackend, toXlsx, type XlsxImportBackend } from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";
import type { Workbook } from "../src/types.js";
// side-effect import registers both the write and the import backends
import { readExcelFileImportBackend } from "../src/xlsx-backend.js";

beforeAll(async () => {
  await initSheetwrite();
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
          { key: "name", header: "Name", width: 80, type: "text" },
          { key: "amount", header: "Amount", width: 80, type: "number" },
        ],
      },
    ],
  };
}

describe("xlsx import", () => {
  it("toXlsx round-trips through fromXlsx: strings verbatim, numbers, empty → null", async () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "Alice" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: 42.5 },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 1, col: 0 },
          value: { kind: "literal", value: "Bob" },
        },
        // row 1 / amount is intentionally left empty → it must import back as `null`.
        {
          op: "set",
          addr: { sheet: "s", row: 2, col: 0 },
          value: { kind: "literal", value: "Carol" },
        },
        { op: "set", addr: { sheet: "s", row: 2, col: 1 }, value: { kind: "literal", value: -7 } },
      ],
    });

    // toXlsx yields a Uint8Array — exercise the Uint8Array input path.
    const bytes = await toXlsx(store.getWorkbook(), store);
    const data = await fromXlsx(bytes);

    // Columns are keyed by the header-row text ("Name"/"Amount"), not the source keys.
    expect(data.rowCount).toBe(3);
    expect(Array.from(data.columns.Name!)).toEqual(["Alice", "Bob", "Carol"]);
    expect(Array.from(data.columns.Amount!)).toEqual([42.5, null, -7]);
  });

  it("fromXlsx maps date cells to date serials and reads an ArrayBuffer", async () => {
    const day = new Date(Date.UTC(2021, 0, 15));
    const moment = new Date(Date.UTC(2021, 0, 15, 6, 30, 0));
    const rowsIn: SheetData = [
      [
        { type: String, value: "When" },
        { type: String, value: "At" },
        { type: String, value: "Note" },
      ],
      [
        { type: Date, value: day, format: "yyyy-mm-dd" },
        { type: Date, value: moment, format: "yyyy-mm-dd hh:mm:ss" },
        { type: String, value: "  spaced  " },
      ],
    ];

    // blob.arrayBuffer() yields an ArrayBuffer — exercise the ArrayBuffer input path.
    const buffer = await (await writeXlsxFile(rowsIn).toBlob()).arrayBuffer();
    const data = await fromXlsx(buffer);

    expect(data.rowCount).toBe(1);
    // A whole-day date maps to an exact integer serial; a datetime to a fractional one.
    expect(data.columns.When![0]).toBe(dateToSerial(day));
    expect(data.columns.At![0]).toBeCloseTo(dateToSerial(moment), 5);
    // `trim: false` keeps surrounding whitespace verbatim.
    expect(data.columns.Note![0]).toBe("  spaced  ");
  });

  it("exports the XLSX import contract from the package root", async () => {
    const backend: XlsxImportBackend = {
      name: "test",
      fromXlsx: async () => ({ rowCount: 1, columns: { Imported: ["yes"] } }),
    };
    setXlsxImportBackend(backend);
    try {
      await expect(fromXlsx(new Uint8Array())).resolves.toEqual({
        rowCount: 1,
        columns: { Imported: ["yes"] },
      });
    } finally {
      setXlsxImportBackend(readExcelFileImportBackend);
    }
  });
});
