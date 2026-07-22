import { beforeAll, describe, expect, it } from "bun:test";
import { parseDateInput } from "../src/date-serial.js";
import {
  DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS,
  DelimitedTextOptionsError,
  DelimitedTextResourceError,
} from "../src/delimited-text.js";
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
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
  toCsv,
  toTsv,
  toXlsxTable,
  toXlsxWorkbook,
  XlsxResourceError,
} from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { IncompleteDataError, SheetwriteStore } from "../src/store.js";
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
  it("imports core without resolving the optional XLSX codec", async () => {
    const script = `
      Bun.plugin({
        name: "forbid-xlsx-codec",
        setup(build) {
          build.onResolve(
            { filter: /^fflate$/ },
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

  it("reports the exact optional package remedy when no XLSX backend is registered", async () => {
    const store = new SheetwriteStore(workbook());
    setXlsxTableExportBackend(null as never);
    setXlsxTableImportBackend(null as never);
    setXlsxWorkbookBackend(null as never);

    await expect(toXlsxTable(store.getWorkbook(), store)).rejects.toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling toXlsxTable.",
    );
    await expect(fromXlsxTable(new Uint8Array())).rejects.toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling fromXlsxTable.",
    );
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "s" },
      sheets: [],
    };
    await expect(toXlsxWorkbook(snapshot)).rejects.toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling toXlsxWorkbook.",
    );
    await expect(fromXlsxWorkbook(new Uint8Array())).rejects.toThrow(
      "Install @sheetwrite/xlsx and import @sheetwrite/xlsx/register before calling fromXlsxWorkbook.",
    );
    store.dispose();
  });

  it("reports typed XLSX resource-limit details", () => {
    const error = new XlsxResourceError("maxInputBytes", 32, 33, "import");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("XlsxResourceError");
    expect(error.code).toBe("xlsx-resource-limit");
    expect(error.resource).toBe("maxInputBytes");
    expect(error.limit).toBe(32);
    expect(error.actual).toBe(33);
    expect(error.operation).toBe("xlsx-import");
    expect(error.message).toBe("Sheetwrite: XLSX import maxInputBytes limit is 32; observed 33");
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
    let tableExportOptions: XlsxWorkbookOptions | undefined;
    let tableImportOptions: XlsxWorkbookOptions | undefined;
    let exportedSnapshot: WorkbookSnapshot | undefined;
    let exportedOptions: XlsxWorkbookOptions | undefined;
    let importedOptions: XlsxWorkbookOptions | undefined;

    const tableExportBackend: XlsxTableExportBackend = {
      name: "fake-table-export",
      toXlsxTable: async (actualWorkbook, actualStore, actualOptions) => {
        expect(actualWorkbook).toBe(store.getWorkbook());
        expect(actualStore).toBe(store);
        tableExportOptions = actualOptions;
        return new Uint8Array([1, 2, 3]);
      },
    };
    const tableImportBackend: XlsxTableImportBackend = {
      name: "fake-table-import",
      fromXlsxTable: async (actualInput, actualOptions) => {
        expect(actualInput).toBe(input);
        tableImportOptions = actualOptions;
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
      await expect(toXlsxTable(store.getWorkbook(), store, options)).resolves.toEqual(
        new Uint8Array([1, 2, 3]),
      );
      await expect(fromXlsxTable(input, options)).resolves.toEqual({
        rowCount: 1,
        columns: { Imported: ["yes"] },
      });
      await expect(toXlsxWorkbook({ exportSnapshot: () => snapshot }, options)).resolves.toEqual(
        new Uint8Array([4, 5, 6]),
      );
      await expect(fromXlsxWorkbook(input, options)).resolves.toBe(snapshot);
      expect(tableExportOptions).toBe(options);
      expect(tableImportOptions).toBe(options);
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

  it("csv: omits hidden columns from both headers and rows", () => {
    const wb = workbook();
    wb.sheets[0]!.columns[1]!.visible = false;
    const store = new SheetwriteStore(wb);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "visible" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: 99 },
        },
      ],
    });

    expect(toCsv(store.getWorkbook().sheets[0]!, store).slice(1).split("\r\n")).toEqual([
      "A",
      "visible",
      '""',
      '""',
    ]);
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
    expect(Reflect.get(data.columns, "__proto__")).toEqual(["alpha"]);
    expect(Reflect.get(data.columns, "constructor")).toEqual(["beta"]);
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

  it("csv exports only the sorted, filtered, non-hidden view and never pads filtered rows", () => {
    const wb: Workbook = {
      activeSheet: "view",
      sheets: [
        {
          id: "view",
          name: "View",
          rowCount: 4,
          columns: [
            { key: "a", header: "A", width: 80, type: "text" },
            { key: "b", header: "B", width: 80, type: "number", visible: false },
          ],
        },
      ],
    };
    const store = new SheetwriteStore(wb, {
      rowCount: 4,
      columns: { a: ["keep-a", "drop", "keep-b", "keep-c"], b: [2, 9, 3, 1] },
    });
    store.setColumnFilter("view", 0, { kind: "contains", text: "keep" });
    store.hideRows("view", [2]);
    store.sortBy("view", 1, true);

    expect(toCsv(store.getWorkbook().sheets[0]!, store)).toBe("\ufeffA\r\nkeep-c\r\nkeep-a");

    store.setColumnFilter("view", 0, { kind: "values", values: ["missing"] });
    expect(toCsv(store.getWorkbook().sheets[0]!, store)).toBe("\ufeffA");
    store.dispose();
  });

  it("tsv reads normalized canonical data coordinates despite the active view", () => {
    const store = new SheetwriteStore(workbook(), {
      rowCount: 3,
      columns: { a: ["zero", "one", "two"], b: [0, 1, 2] },
    });
    store.setColumnFilter("s", 0, { kind: "values", values: ["two"] });
    store.sortBy("s", 1, false);

    expect(toTsv({ sheet: "s", start: { row: 2, col: 1 }, end: { row: 0, col: 0 } }, store)).toBe(
      "zero\t0\r\none\t1\r\ntwo\t2",
    );
    store.dispose();
  });

  it("direct CSV and TSV exports reject incomplete paged data before reading sentinels", () => {
    const store = new SheetwriteStore(workbook(), undefined, { storage: "paged" });
    expect(store.queryCapability("s").status).toBe("incomplete");
    expect(() => toCsv(store.getWorkbook().sheets[0]!, store)).toThrow(IncompleteDataError);
    expect(() =>
      toTsv({ sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } }, store),
    ).toThrow(IncompleteDataError);
    store.dispose();
  });

  it("parses both fixed-dialect record breaks, Unicode, quotes, and trailing empties", () => {
    expect(parseCsv('α,"b,c","q""x"\rbare,cr,\r\nlast,,')).toEqual([
      ["α", "b,c", 'q"x'],
      ["bare", "cr", ""],
      ["last", "", ""],
    ]);
    expect(parseCsv('""')).toEqual([[""]]);
    expect(parseCsv("\ufeffa")).toEqual([["a"]]);
    expect(parseCsv("\ufeff\ufeffa")).toEqual([["\ufeffa"]]);
  });

  it("preserves one-column trailing blank records across CSV export and import", () => {
    const wb: Workbook = {
      activeSheet: "blank",
      sheets: [
        {
          id: "blank",
          name: "Blank",
          rowCount: 3,
          columns: [{ key: "only", header: "Only", width: 80, type: "text" }],
        },
      ],
    };
    const store = new SheetwriteStore(wb);
    const csv = toCsv(store.getWorkbook().sheets[0]!, store);
    expect(csv).toBe('\ufeffOnly\r\n""\r\n""\r\n""');
    expect(parseCsv(csv)).toEqual([["Only"], [""], [""], [""]]);
    expect(fromCsv(csv, wb.sheets[0]!.columns)).toEqual({
      rowCount: 3,
      columns: { only: [null, null, null] },
    });
    store.dispose();
  });

  it("projects visible CSV fields around hidden declared columns on reimport", () => {
    const columns: Column[] = [
      { key: "a", header: "A", width: 80, type: "text" },
      { key: "hidden", header: "Hidden", width: 80, type: "number", visible: false },
      { key: "c", header: "C", width: 80, type: "text" },
    ];
    const data = fromCsv("A,C\r\nleft,right", columns);
    expect(data.columns).toEqual({ a: ["left"], hidden: [null], c: ["right"] });

    const store = new SheetwriteStore(
      {
        activeSheet: "projection",
        sheets: [{ id: "projection", name: "Projection", rowCount: 1, columns }],
      },
      data,
    );
    expect(store.getCell({ sheet: "projection", row: 0, col: 0 }).resolved).toBe("left");
    expect(store.getCell({ sheet: "projection", row: 0, col: 1 }).resolved).toBeNull();
    expect(store.getCell({ sheet: "projection", row: 0, col: 2 }).resolved).toBe("right");
    store.dispose();
  });

  it("coerces declared types canonically and loads booleans and dates without type loss", () => {
    const columns: Column[] = [
      { key: "bool", header: "Bool", width: 80, type: "text" },
      { key: "num", header: "Num", width: 80, type: "number" },
      { key: "serial", header: "Serial", width: 80, type: "date" },
      { key: "date", header: "Date", width: 80, type: "date" },
      { key: "money", header: "Money", width: 80, type: "currency" },
      { key: "blank", header: "Blank", width: 80, type: "text" },
      { key: "formula", header: "Formula", width: 80, type: "number" },
    ];
    const data = fromCsv(
      'Bool,Num,Serial,Date,Money,Blank,Formula\r\n TRUE , 42 ,45678.5,2026-07-18,"$1,234.50",   ,=1+1\r\n false ,-2,45679,07/18/2026,"(€2,000.25)",\t,+1+1',
      columns,
    );
    expect(data.columns.bool).toEqual([true, false]);
    expect(data.columns.num).toEqual([42, -2]);
    expect(data.columns.serial).toEqual([45678.5, 45679]);
    expect(data.columns.date).toEqual([parseDateInput("2026-07-18"), parseDateInput("07/18/2026")]);
    expect(data.columns.money).toEqual([1234.5, -2000.25]);
    expect(data.columns.blank).toEqual([null, null]);
    expect(data.columns.formula).toEqual(["=1+1", "+1+1"]);

    const store = new SheetwriteStore(
      {
        activeSheet: "types",
        sheets: [{ id: "types", name: "Types", rowCount: 2, columns }],
      },
      data,
    );
    expect(store.getCell({ sheet: "types", row: 0, col: 0 }).resolved).toBe(true);
    expect(store.getCell({ sheet: "types", row: 1, col: 0 }).resolved).toBe(false);
    expect(store.getCell({ sheet: "types", row: 0, col: 2 }).resolved).toBe(45678.5);
    expect(store.getCell({ sheet: "types", row: 0, col: 3 }).resolved).toBe(
      parseDateInput("2026-07-18"),
    );
    expect(store.getCell({ sheet: "types", row: 0, col: 4 }).resolved).toBe(1234.5);
    expect(store.getCell({ sheet: "types", row: 0, col: 5 }).resolved).toBeNull();
    expect(store.getCell({ sheet: "types", row: 0, col: 6 }).resolved).toBe("=1+1");
    expect(store.getFormula({ sheet: "types", row: 0, col: 6 })).toBeNull();
    store.dispose();
  });

  it("enforces exact defaults and limit+1 before oversized delimited allocations", () => {
    expect(DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS).toEqual({
      maxInputBytes: 32 * 1024 * 1024,
      maxOutputBytes: 64 * 1024 * 1024,
      maxRows: 1_000_000,
      maxColumns: 16_384,
      maxCells: 1_000_000,
      maxFieldBytes: 1 * 1024 * 1024,
      maxWriterWindowRows: 4_096,
    });
    expect(parseCsv("éé", { resourceLimits: { maxInputBytes: 4, maxFieldBytes: 4 } })).toEqual([
      ["éé"],
    ]);

    let inputFailure: unknown;
    try {
      parseCsv("ééx", { resourceLimits: { maxInputBytes: 4 } });
    } catch (error) {
      inputFailure = error;
    }
    expect(inputFailure).toBeInstanceOf(DelimitedTextResourceError);
    expect(inputFailure).toMatchObject({
      resource: "maxInputBytes",
      limit: 4,
      actual: 5,
      operation: "delimited-parse",
    });
    expect(() => parseCsv("ééx", { resourceLimits: { maxFieldBytes: 4 } })).toThrow(
      DelimitedTextResourceError,
    );
    expect(() => parseCsv("a\nb", { resourceLimits: { maxRows: 1 } })).toThrow(
      DelimitedTextResourceError,
    );
    expect(() => parseCsv("a,b", { resourceLimits: { maxColumns: 1 } })).toThrow(
      DelimitedTextResourceError,
    );
    expect(() => parseCsv("a,b\nc", { resourceLimits: { maxCells: 2 } })).toThrow(
      DelimitedTextResourceError,
    );
    expect(() => parseCsv("a", { resourceLimits: { maxRows: 0 } })).toThrow(
      DelimitedTextOptionsError,
    );

    const store = new SheetwriteStore(
      {
        activeSheet: "limit",
        sheets: [
          {
            id: "limit",
            name: "Limit",
            rowCount: 1,
            columns: [{ key: "a", header: "A", width: 80, type: "text" }],
          },
        ],
      },
      { rowCount: 1, columns: { a: ["a"] } },
    );
    const range = { sheet: "limit", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };
    expect(toTsv(range, store, { resourceLimits: { maxOutputBytes: 1 } })).toBe("a");
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "limit", row: 0, col: 0 },
          value: { kind: "literal", value: "ab" },
        },
      ],
    });
    expect(() => toTsv(range, store, { resourceLimits: { maxOutputBytes: 1 } })).toThrow(
      DelimitedTextResourceError,
    );
    store.dispose();
  });

  it("bounds CSV and TSV store reads by maxWriterWindowRows", () => {
    const store = new SheetwriteStore(workbook(), {
      rowCount: 3,
      columns: { a: ["a", "b", "c"], b: [1, 2, 3] },
    });
    const windows: number[] = [];
    const readWindow = store.getVisibleWindow.bind(store);
    store.getVisibleWindow = ((sheet, rows, columns) => {
      windows.push(rows.end - rows.start);
      return readWindow(sheet, rows, columns);
    }) as typeof store.getVisibleWindow;
    const dataWindows: number[] = [];
    const readDataWindow = store.getDataWindow.bind(store);
    store.getDataWindow = ((sheet, rows, columns) => {
      dataWindows.push(rows.end - rows.start);
      return readDataWindow(sheet, rows, columns);
    }) as typeof store.getDataWindow;

    expect(
      toCsv(store.getWorkbook().sheets[0]!, store, {
        resourceLimits: { maxWriterWindowRows: 1 },
      }),
    ).toContain("a,1\r\nb,2\r\nc,3");
    expect(windows).toEqual([1, 1, 1]);
    expect(
      toTsv({ sheet: "s", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } }, store, {
        resourceLimits: { maxWriterWindowRows: 1 },
      }),
    ).toBe("a\t1\r\nb\t2\r\nc\t3");
    expect(dataWindows).toEqual([1, 1, 1]);
    store.dispose();
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

  it("cleans up the anchor and object URL when click throws", () => {
    const revoked: string[] = [];
    const deferred: Array<() => void> = [];
    let anchor: HTMLAnchorElement | null = null;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    const originalAppend = document.body.appendChild.bind(document.body);
    const originalSetTimeout = globalThis.setTimeout;

    URL.createObjectURL = (() => "blob:sheetwrite-failure") as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => revoked.push(url)) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = () => {
      throw new Error("click failed");
    };
    document.body.appendChild = ((node: Node) => {
      if (node instanceof HTMLAnchorElement) anchor = node;
      return originalAppend(node);
    }) as typeof document.body.appendChild;
    globalThis.setTimeout = ((fn: () => void) => {
      deferred.push(fn);
      return 0;
    }) as unknown as typeof globalThis.setTimeout;

    try {
      expect(() => downloadBytes("x", "failure.txt", "text/plain")).toThrow("click failed");
      expect(anchor).not.toBeNull();
      expect(anchor!.isConnected).toBe(false);
      expect(revoked).toEqual([]);
      for (const callback of deferred) callback();
      expect(revoked).toEqual(["blob:sheetwrite-failure"]);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
      document.body.appendChild = originalAppend as typeof document.body.appendChild;
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
