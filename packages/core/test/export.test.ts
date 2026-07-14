import { beforeAll, describe, expect, it } from "bun:test";
import type {
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
  XlsxWorkbookOptions,
} from "../src/export.js";
import {
  downloadBytes,
  fromCsv,
  fromXlsxTable,
  fromXlsxWorkbook,
  parseCsv,
  safeHeader,
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
  toCsv,
  toTsv,
  toXlsxTable,
  toXlsxWorkbook,
} from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { Column, Workbook, WorkbookSnapshot } from "../src/types.js";

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
  it("imports core without resolving any concrete Excel package", async () => {
    const script = `
      Bun.plugin({
        name: "forbid-excel-packages",
        setup(build) {
          build.onResolve(
            { filter: /^(exceljs|read-excel-file|write-excel-file)/ },
            (args) => { throw new Error(\`core resolved forbidden package \${args.path}\`); },
          );
        },
      });
      // Dynamic import is required so the resolver tripwire is installed first.
      await import("./packages/core/src/index.ts");
    `;
    const child = Bun.spawn(["bun", "--eval", script], {
      cwd: new URL("../../../", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });
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

  it("reports the exact optional package remedy when no XLSX backend is registered", () => {
    const store = new SheetwriteStore(workbook());
    setXlsxTableExportBackend(null as never);
    setXlsxTableImportBackend(null as never);
    setXlsxWorkbookBackend(null as never);

    expect(() => toXlsxTable(store.getWorkbook(), store)).toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling toXlsxTable.",
    );
    expect(() => fromXlsxTable(new Uint8Array())).toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling fromXlsxTable.",
    );
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "s" },
      sheets: [],
    };
    expect(() => toXlsxWorkbook(snapshot)).toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling toXlsxWorkbook.",
    );
    expect(() => fromXlsxWorkbook(new Uint8Array())).toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling fromXlsxWorkbook.",
    );
    store.dispose();
  });

  it("forwards table and workbook calls through independently injected backends", async () => {
    const store = new SheetwriteStore(workbook());
    const input = new Uint8Array([9, 8, 7]);
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "s" },
      sheets: [],
    };
    const options: XlsxWorkbookOptions = { maxCells: 17 };
    let exportedSnapshot: WorkbookSnapshot | undefined;
    let exportedOptions: XlsxWorkbookOptions | undefined;
    let importedOptions: XlsxWorkbookOptions | undefined;

    const tableExportBackend: XlsxTableExportBackend = {
      name: "fake-table-export",
      toXlsxTable: async (actualWorkbook, actualStore) => {
        expect(actualWorkbook).toBe(store.getWorkbook());
        expect(actualStore).toBe(store);
        return new Uint8Array([1, 2, 3]);
      },
    };
    const tableImportBackend: XlsxTableImportBackend = {
      name: "fake-table-import",
      fromXlsxTable: async (actualInput) => {
        expect(actualInput).toBe(input);
        return { rowCount: 1, columns: { Imported: ["yes"] } };
      },
    };
    const workbookBackend: XlsxWorkbookBackend = {
      name: "fake-workbook",
      toXlsxWorkbook: async (actualSnapshot, actualOptions) => {
        exportedSnapshot = actualSnapshot;
        exportedOptions = actualOptions;
        return new Uint8Array([4, 5, 6]);
      },
      fromXlsxWorkbook: async (actualInput, actualOptions) => {
        expect(actualInput).toBe(input);
        importedOptions = actualOptions;
        return snapshot;
      },
    };

    setXlsxTableExportBackend(tableExportBackend);
    setXlsxTableImportBackend(tableImportBackend);
    setXlsxWorkbookBackend(workbookBackend);
    try {
      await expect(toXlsxTable(store.getWorkbook(), store)).resolves.toEqual(
        new Uint8Array([1, 2, 3]),
      );
      await expect(fromXlsxTable(input)).resolves.toEqual({
        rowCount: 1,
        columns: { Imported: ["yes"] },
      });
      await expect(toXlsxWorkbook({ exportSnapshot: () => snapshot }, options)).resolves.toEqual(
        new Uint8Array([4, 5, 6]),
      );
      await expect(fromXlsxWorkbook(input, options)).resolves.toBe(snapshot);
      expect(exportedSnapshot).toBe(snapshot);
      expect(exportedOptions).toBe(options);
      expect(importedOptions).toBe(options);
    } finally {
      setXlsxTableExportBackend(null as never);
      setXlsxTableImportBackend(null as never);
      setXlsxWorkbookBackend(null as never);
      store.dispose();
    }
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

  it("csv import preserves reserved declared keys as enumerable own properties", () => {
    const columns: Column[] = [
      { key: "__proto__", header: "Prototype", width: 100, type: "text" },
      { key: "constructor", header: "Constructor", width: 100, type: "text" },
      { key: "ordinary", header: "Ordinary", width: 100, type: "text" },
    ];
    const data = fromCsv("Prototype,Constructor,Ordinary\r\nalpha,beta,gamma", columns);

    expect(Object.getPrototypeOf(data.columns)).toBeNull();
    expect(Object.keys(data.columns)).toEqual(["__proto__", "constructor", "ordinary"]);
    expect(Object.hasOwn(data.columns, "__proto__")).toBe(true);
    expect(data.columns.__proto__).toEqual(["alpha"]);
    expect(data.columns.constructor).toEqual(["beta"]);
    expect(JSON.stringify(data.columns)).toBe(
      '{"__proto__":["alpha"],"constructor":["beta"],"ordinary":["gamma"]}',
    );

    const imported = new SheetwriteStore(
      {
        activeSheet: "reserved",
        sheets: [
          {
            id: "reserved",
            name: "Reserved",
            rowCount: 1,
            columns,
          },
        ],
      },
      data,
    );
    expect(imported.getCell({ sheet: "reserved", row: 0, col: 0 }).resolved).toBe("alpha");
    expect(imported.getCell({ sheet: "reserved", row: 0, col: 1 }).resolved).toBe("beta");
    imported.dispose();
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
