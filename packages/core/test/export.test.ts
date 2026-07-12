import { beforeAll, describe, expect, it } from "bun:test";
import type { CellObject } from "write-excel-file/universal";
import {
  downloadBytes,
  fromCsv,
  parseCsv,
  safeHeader,
  toCsv,
  toTsv,
  toXlsx,
} from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Workbook } from "../src/types.js";
// side-effect import registers the write-excel-file backend
import "../src/xlsx-backend.js";
import { buildXlsxModel } from "../src/xlsx-backend.js";

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

  it("xlsx model carries header and cell styles with per-cell precedence", () => {
    const wb = workbook();
    const column = wb.sheets[0]!.columns[0]!;
    column.headerStyle = { bold: true };
    column.cellStyle = { color: "#112233", bold: true };
    const store = new SheetwriteStore(wb);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "styled" },
          style: { bold: false, backgroundColor: "#ff0000" },
        },
      ],
    });

    const model = buildXlsxModel(store.getWorkbook(), store)!;
    expect(model.data[0]![0]).toMatchObject({ fontWeight: "bold" });
    expect(model.data[1]![0]).toMatchObject({
      value: "styled",
      textColor: "#112233",
      backgroundColor: "#ff0000",
    });
    expect((model.data[1]![0] as CellObject).fontWeight).toBeUndefined();
  });

  it("xlsx model emits merge spans and null covered cells", () => {
    const wb = workbook();
    wb.sheets[0]!.merges = [{ r0: 0, c0: 0, r1: 1, c1: 1 }];
    const store = new SheetwriteStore(wb);
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
  });

  it("xlsx model carries number formats on numeric body cells", () => {
    const wb = workbook();
    wb.sheets[0]!.columns[1]!.numberFormat = "#,##0.00";
    const store = new SheetwriteStore(wb);
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
  });

  it("xlsx model excludes hidden columns from data and width options", () => {
    const wb = workbook();
    wb.sheets[0]!.columns[0]!.visible = false;
    wb.sheets[0]!.columns[1]!.width = 75;
    const store = new SheetwriteStore(wb);
    const model = buildXlsxModel(store.getWorkbook(), store)!;

    expect(model.data[0]).toHaveLength(1);
    expect(model.data[0]![0]).toMatchObject({ value: "B" });
    expect(model.options.columns).toEqual([{ width: 10 }]);
  });

  it("xlsx model carries row heights and sheet name", () => {
    const wb = workbook();
    wb.sheets[0]!.rowHeights = new Map([[1, 42]]);
    const store = new SheetwriteStore(wb);
    const model = buildXlsxModel(store.getWorkbook(), store)!;

    expect(model.options.sheet).toBe("S");
    expect(model.data[2]![0]).toMatchObject({ height: 42 });
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

describe("downloadBytes", () => {
  it("appends+removes the anchor and defers the object-URL revoke", () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const clicks: HTMLAnchorElement[] = [];
    const appended: HTMLAnchorElement[] = [];
    const deferred: Array<() => void> = [];

    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    const originalAppend = document.body.appendChild.bind(document.body);
    const originalSetTimeout = globalThis.setTimeout;

    URL.createObjectURL = (() => {
      created.push("blob:sheetwrite-test");
      return "blob:sheetwrite-test";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      revoked.push(url);
    }) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this);
      // The anchor must be in the document when clicked.
      expect(this.isConnected).toBe(true);
    };
    document.body.appendChild = ((node: Node) => {
      if (node instanceof HTMLAnchorElement) appended.push(node);
      return originalAppend(node);
    }) as typeof document.body.appendChild;
    // Deterministic deferral: capture the timeout callback instead of waiting.
    globalThis.setTimeout = ((fn: () => void) => {
      deferred.push(fn);
      return 0;
    }) as unknown as typeof globalThis.setTimeout;

    try {
      downloadBytes(new Uint8Array([1, 2, 3]), "t.bin", "application/octet-stream");

      expect(created).toEqual(["blob:sheetwrite-test"]);
      expect(appended).toHaveLength(1);
      expect(clicks).toHaveLength(1);
      expect(appended[0]!.isConnected).toBe(false); // removed after click
      expect(appended[0]!.download).toBe("t.bin");

      // Revoke is deferred, never synchronous with the click.
      expect(revoked).toEqual([]);
      for (const fn of deferred) fn();
      expect(revoked).toEqual(["blob:sheetwrite-test"]);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
      document.body.appendChild = originalAppend as typeof document.body.appendChild;
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
