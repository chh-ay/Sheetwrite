import { beforeAll, describe, expect, it } from "bun:test";
import { toCsv, toTsv, toXlsx } from "../src/export";
import { initSheetwrite } from "../src/grid";
import { SheetwriteStore } from "../src/store";
import type { Workbook } from "../src/types";
// side-effect import registers the write-excel-file backend
import "../src/xlsx-backend";

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
});
