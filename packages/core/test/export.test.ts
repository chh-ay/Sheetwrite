import { beforeAll, describe, expect, it } from "bun:test";
import { fromCsv, parseCsv, safeHeader, toCsv, toTsv, toXlsx } from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Workbook } from "../src/types.js";
// side-effect import registers the write-excel-file backend
import "../src/xlsx-backend.js";

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
          { key: "a", header: "A", width: 80, type: "text" },
          { key: "b", header: "B", width: 80, type: "number" },
        ],
      },
    ],
  };
}

describe("export", () => {
  it("csv: BOM + CRLF + header + injection hardening + quoting", () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "=cmd" },
        },
        { op: "set", addr: { sheet: "s", row: 0, col: 1 }, value: { kind: "literal", value: 42 } },
        {
          op: "set",
          addr: { sheet: "s", row: 1, col: 0 },
          value: { kind: "literal", value: "a,b" },
        },
      ],
    });
    const csv = toCsv(store.getWorkbook().sheets[0]!, store);
    expect(csv.startsWith("\ufeff")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("A,B");
    expect(lines[1]).toBe("'=cmd,42");
    expect(lines[2]).toBe('"a,b",');
  });

  it("tsv: range serialization", () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "s", row: 0, col: 0 }, value: { kind: "literal", value: "x" } },
        { op: "set", addr: { sheet: "s", row: 0, col: 1 }, value: { kind: "literal", value: 1 } },
      ],
    });
    expect(toTsv({ sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } }, store)).toBe(
      "x\t1",
    );
  });

  it("xlsx: write-excel-file backend produces a valid zip container", async () => {
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
    const bytes = await toXlsx(store.getWorkbook(), store);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K' — zip magic
  });

  it("csv: a cell value beginning with a formula char is neutralized", () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "+1+1" },
        },
      ],
    });
    const lines = toCsv(store.getWorkbook().sheets[0]!, store).slice(1).split("\r\n");
    expect(lines[1]).toBe("'+1+1,");
  });

  it("csv: a column header beginning with a formula char is neutralized", () => {
    const wb: Workbook = {
      activeSheet: "s",
      sheets: [
        {
          id: "s",
          name: "S",
          rowCount: 1,
          columns: [
            { key: "a", header: "=HYPERLINK(1)", width: 80, type: "text" },
            { key: "b", header: "B", width: 80, type: "number" },
          ],
        },
      ],
    };
    const store = new SheetwriteStore(wb);
    const header = toCsv(store.getWorkbook().sheets[0]!, store).slice(1).split("\r\n")[0];
    expect(header).toBe("'=HYPERLINK(1),B");
  });

  it("tsv: a cell value beginning with a formula char is neutralized", () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "=1+1" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: 7 },
        },
      ],
    });
    const range = { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } };
    expect(toTsv(range, store)).toBe("'=1+1\t7");
  });

  it("tsv: header text is hardened through the shared safeHeader path", () => {
    expect(safeHeader("=cmd")).toBe("'=cmd");
    expect(safeHeader("@danger")).toBe("'@danger");
    expect(safeHeader("\tlead-tab")).toBe("'\tlead-tab");
    expect(safeHeader("Plain")).toBe("Plain");
  });

  it("export: a negative number is left intact (not mistaken for injection)", () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: -5 },
        },
      ],
    });
    const sheet = store.getWorkbook().sheets[0]!;
    const range = { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } };
    expect(toCsv(sheet, store).slice(1).split("\r\n")[1]).toBe(",-5");
    expect(toTsv(range, store)).toBe("\t-5");
  });

  it("csv import: parseCsv handles the BOM, quoted commas/newlines and CRLF", () => {
    const text = '\ufeffName,Note\r\nAlice,"a,b"\r\n"multi\nline","say ""hi"""';
    expect(parseCsv(text)).toEqual([
      ["Name", "Note"],
      ["Alice", "a,b"],
      ["multi\nline", 'say "hi"'],
    ]);
  });

  it("csv import: fromCsv round-trips toCsv, consumes the header and coerces numbers", () => {
    const store = new SheetwriteStore(workbook());
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "hello" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: 42 },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 1, col: 0 },
          value: { kind: "literal", value: "a,b" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 1, col: 1 },
          value: { kind: "literal", value: -5 },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 2, col: 0 },
          value: { kind: "literal", value: "multi\nline" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 2, col: 1 },
          value: { kind: "literal", value: 0 },
        },
      ],
    });
    const sheet = store.getWorkbook().sheets[0]!;
    const data = fromCsv(toCsv(sheet, store), sheet.columns);

    expect(data.rowCount).toBe(3);
    expect(Array.from(data.columns.a!)).toEqual(["hello", "a,b", "multi\nline"]);
    expect(Array.from(data.columns.b!)).toEqual([42, -5, 0]);
  });
});
