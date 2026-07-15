import { beforeAll, describe, expect, it } from "bun:test";
import type { DataValidationCondition, Workbook, WorkbookSnapshot } from "@sheetwrite/core";
import {
  dateToSerial,
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readSheet } from "read-excel-file/universal";
import type { SheetData } from "write-excel-file/universal";
import writeXlsxFile from "write-excel-file/universal";
import { registerXlsxBackends } from "../src/index.js";

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
          { key: "name", header: "Name", width: 80, type: "text" },
          { key: "amount", header: "Amount", width: 80, type: "number" },
        ],
      },
    ],
  };
}

describe("table XLSX interchange", () => {
  it("round-trips table XLSX strings, numbers, and empty cells", async () => {
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

    // Exercise the Uint8Array input path returned by the table exporter.
    const bytes = await toXlsxTable(store.getWorkbook(), store);
    const data = await fromXlsxTable(bytes);

    // Columns are keyed by the header-row text ("Name"/"Amount"), not the source keys.
    expect(data.rowCount).toBe(3);
    expect(Array.from(data.columns.Name!)).toEqual(["Alice", "Bob", "Carol"]);
    expect(Array.from(data.columns.Amount!)).toEqual([42.5, null, -7]);
  });

  it("maps table XLSX date cells to serials and reads an ArrayBuffer", async () => {
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
    const data = await fromXlsxTable(buffer);

    expect(data.rowCount).toBe(1);
    // A whole-day date maps to an exact integer serial; a datetime to a fractional one.
    expect(data.columns.When![0]).toBe(dateToSerial(day));
    expect(data.columns.At![0]).toBeCloseTo(dateToSerial(moment), 5);
    // `trim: false` keeps surrounding whitespace verbatim.
    expect(data.columns.Note![0]).toBe("  spaced  ");
  });

  it("preserves reserved and duplicate headers as enumerable own properties", async () => {
    const fixture = new ExcelJS.Workbook();
    const sheet = fixture.addWorksheet("Reserved");
    sheet.addRow(["__proto__", "__proto__", "constructor", "ordinary"]);
    sheet.addRow(["first", "second", "third", "fourth"]);
    const bytes = await fixture.xlsx.writeBuffer();
    const data = await fromXlsxTable(new Uint8Array(bytes));

    expect(Object.getPrototypeOf(data.columns)).toBeNull();
    expect(Object.keys(data.columns)).toEqual([
      "__proto__",
      "__proto___2",
      "constructor",
      "ordinary",
    ]);
    expect(Object.hasOwn(data.columns, "__proto__")).toBe(true);
    expect(Reflect.get(data.columns, "__proto__")).toEqual(["first"]);
    expect(data.columns.__proto___2).toEqual(["second"]);
    expect(Reflect.get(data.columns, "constructor")).toEqual(["third"]);
    expect(JSON.stringify(data.columns)).toBe(
      '{"__proto__":["first"],"__proto___2":["second"],"constructor":["third"],"ordinary":["fourth"]}',
    );

    const imported = new SheetwriteStore(
      {
        activeSheet: "reserved",
        sheets: [
          {
            id: "reserved",
            name: "Reserved",
            rowCount: 1,
            columns: Object.keys(data.columns).map((key) => ({
              key,
              header: key,
              width: 100,
              type: "text",
            })),
          },
        ],
      },
      data,
    );
    expect(imported.getCell({ sheet: "reserved", row: 0, col: 0 }).resolved).toBe("first");
    expect(imported.getCell({ sheet: "reserved", row: 0, col: 2 }).resolved).toBe("third");
    imported.dispose();
  });
});

function roundTripWorkbook(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "xlsx-round-trip",
    version: 7,
    workbook: {
      activeSheet: "calc",
      namedRanges: [
        {
          name: "InputAmounts",
          range: {
            sheet: "inputs",
            start: { row: 0, col: 1 },
            end: { row: 1, col: 1 },
          },
        },
      ],
    },
    sheets: [
      {
        id: "inputs",
        name: "Inputs",
        order: 0,
        rowCount: 3,
        columns: [
          {
            key: "when",
            header: "When",
            width: 111,
            type: "date",
            numberFormat: "mmm d, yyyy h:mm AM/PM",
            numberLocale: "en-US",
            headerStyle: { bold: true, backgroundColor: "#EEEEEE" },
            cellStyle: { align: "center" },
          },
          {
            key: "amount",
            header: "Amount",
            width: 88,
            type: "currency",
            numberFormat: '$#,##0.00;[Red]($#,##0.00);"-"',
          },
        ],
        frozenRows: 1,
        frozenCols: 1,
        rowMeta: [[1, { height: 31, hidden: true }]],
        merges: [{ r0: 2, c0: 0, r1: 2, c1: 1 }],
        conditionalFormats: [
          {
            range: {
              sheet: "inputs",
              start: { row: 0, col: 1 },
              end: { row: 1, col: 1 },
            },
            when: { kind: "greaterThan", value: 5 },
            style: { backgroundColor: "#FFEEAA" },
          },
        ],
        rowGroups: [{ start: 0, end: 1, collapsed: false }],
        validationRules: [
          {
            id: "amount-range",
            range: {
              sheet: "inputs",
              start: { row: 0, col: 1 },
              end: { row: 1, col: 1 },
            },
            condition: { kind: "number", min: 0, max: 10 },
            policy: "reject",
            helpText: "Enter an amount from 0 to 10",
          },
        ],
        protectedRanges: [
          {
            id: "locked-date",
            range: {
              sheet: "inputs",
              start: { row: 0, col: 0 },
              end: { row: 1, col: 0 },
            },
          },
        ],
        notes: [
          {
            addr: { sheet: "inputs", row: 1, col: 0 },
            text: "Imported source date",
          },
        ],
        sortKeys: [{ col: 1, ascending: false }],
        filters: [[1, { kind: "compare", op: "gte", value: 1 }]],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 3,
            colCount: 2,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "literal", value: 45_000 },
              },
              {
                rowOffset: 0,
                colOffset: 1,
                value: { kind: "literal", value: 4 },
                style: {
                  bold: true,
                  color: "#112233",
                  backgroundColor: "#DDEEFF",
                  align: "right",
                  wrap: true,
                  border: {
                    all: { color: "#334455", width: 2, style: "dashed" },
                  },
                },
              },
              {
                rowOffset: 1,
                colOffset: 0,
                value: { kind: "literal", value: 45_001.5 },
              },
              {
                rowOffset: 1,
                colOffset: 1,
                value: { kind: "literal", value: 6 },
              },
              {
                rowOffset: 2,
                colOffset: 0,
                value: { kind: "literal", value: "Merged note" },
              },
            ],
          },
        ],
      },
      {
        id: "calc",
        name: "Calc",
        order: 1,
        rowCount: 3,
        columns: [
          {
            key: "result",
            header: "Result",
            width: 100,
            type: "number",
            numberFormat: "0.00",
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 3,
            colCount: 1,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "formula", src: "=SUM(Inputs!B1:B2)" },
              },
              {
                rowOffset: 1,
                colOffset: 0,
                value: { kind: "formula", src: "=A1+Inputs!B1" },
              },
              {
                rowOffset: 2,
                colOffset: 0,
                value: {
                  kind: "formula",
                  src: "='Executive Summary'!A1+Inputs!B1",
                },
              },
            ],
          },
        ],
      },
      {
        id: "summary",
        name: "Executive Summary",
        order: 2,
        rowCount: 2,
        columns: [
          {
            key: "total",
            header: "Total",
            width: 120,
            type: "number",
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 2,
            colCount: 1,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "formula", src: "=Calc!A1" },
              },
              {
                rowOffset: 1,
                colOffset: 0,
                value: {
                  kind: "ref",
                  target: { sheet: "inputs", row: 0, col: 1 },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("workbook XLSX round-trip", () => {
  it("rejects empty workbooks and duplicate names but preserves an empty sheet", async () => {
    const emptyWorkbook: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "missing" },
      sheets: [],
    };
    await expect(toXlsxWorkbook(emptyWorkbook)).rejects.toThrow("invalid workbook snapshot");

    const duplicateNames = roundTripWorkbook();
    duplicateNames.sheets[1]!.name = "Inputs";
    await expect(toXlsxWorkbook(duplicateNames)).rejects.toThrow(
      "duplicate XLSX sheet name: Inputs",
    );

    const invalidName = roundTripWorkbook();
    invalidName.sheets[0]!.name = "Bad/Name";
    await expect(toXlsxWorkbook(invalidName)).rejects.toThrow("invalid XLSX sheet name: Bad/Name");

    const emptySheet: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "empty" },
      sheets: [
        {
          id: "empty",
          name: "Empty",
          order: 0,
          rowCount: 0,
          columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
          cells: [],
        },
      ],
    };
    const imported = await fromXlsxWorkbook(await toXlsxWorkbook(emptySheet));
    expect(imported).toMatchObject(emptySheet);
  });

  it("extends stale Sheetwrite metadata to include rows and columns added in Excel", async () => {
    const exported = await toXlsxWorkbook(roundTripWorkbook());
    const edited = new ExcelJS.Workbook();
    type ExcelLoadInput = Parameters<typeof edited.xlsx.load>[0];
    const editInput = exported as unknown as ExcelLoadInput;
    await edited.xlsx.load(editInput);
    edited.getWorksheet("Inputs")!.getCell("D5").value = 99;
    const output = await edited.xlsx.writeBuffer();
    // ExcelJS's Buffer declaration omits its runtime Uint8Array inheritance.
    const editedBytes = output as unknown as Uint8Array;

    const imported = await fromXlsxWorkbook(editedBytes);
    const inputs = imported.sheets[0]!;
    expect(inputs.id).toBe("inputs");
    expect(inputs.rowCount).toBe(5);
    expect(inputs.columns).toHaveLength(4);
    expect(
      inputs.cells[0]!.cells.find((cell) => cell.rowOffset === 4 && cell.colOffset === 3)?.value,
    ).toEqual({ kind: "literal", value: 99 });
  });

  it("preserves formulas, sheets, supported styles, views, dimensions, and metadata", async () => {
    const source = roundTripWorkbook();
    const warnings: string[] = [];
    const bytes = await toXlsxWorkbook(source, {
      onWarning: (warning) => warnings.push(warning.code),
    });
    const externalInput = bytes.buffer;
    if (!(externalInput instanceof ArrayBuffer)) {
      throw new TypeError("Expected a standalone XLSX ArrayBuffer");
    }
    const externalRows = await readSheet(externalInput, "Inputs", { trim: false });
    expect(externalRows).toHaveLength(3);
    expect(externalRows[0]?.[1]).toBe(4);
    const inspected = new ExcelJS.Workbook();
    type ExcelLoadInput = Parameters<typeof inspected.xlsx.load>[0];
    const inspectInput = externalInput as unknown as ExcelLoadInput;
    await inspected.xlsx.load(inspectInput);
    expect(inspected.worksheets.map((sheet) => sheet.name)).toEqual([
      "Inputs",
      "Calc",
      "Executive Summary",
      "__sheetwrite_meta__",
    ]);
    expect(inspected.getWorksheet("Calc")!.getCell("A1").formula).toBe("SUM(Inputs!B1:B2)");
    expect(inspected.getWorksheet("__sheetwrite_meta__")!.state).toBe("veryHidden");
    expect(inspected.getWorksheet("Inputs")!.getCell("A1").numFmt).toBe("mmm d, yyyy h:mm AM/PM");
    expect(inspected.getWorksheet("Inputs")!.getCell("B1").numFmt).toBe(
      '$#,##0.00;[Red]($#,##0.00);"-"',
    );
    expect(inspected.getWorksheet("Inputs")!.getCell("B1").dataValidation).toMatchObject({
      type: "decimal",
      operator: "between",
      formulae: [0, 10],
    });
    expect(inspected.getWorksheet("Inputs")!.getCell("A2").note).toBe("Imported source date");
    const archive = await JSZip.loadAsync(bytes);
    const workbookXml = await archive.file("xl/workbook.xml")?.async("text");
    expect(workbookXml).toContain('fullCalcOnLoad="1"');
    const imported = await fromXlsxWorkbook(bytes);

    expect(warnings).toEqual(["unsupported-feature", "unsupported-feature"]);
    expect(imported.documentId).toBe("xlsx-round-trip");
    expect(imported.version).toBe(7);
    expect(imported.workbook.activeSheet).toBe("calc");
    expect(imported.workbook.namedRanges).toEqual(source.workbook.namedRanges);
    expect(imported.sheets.map((sheet) => [sheet.id, sheet.name])).toEqual([
      ["inputs", "Inputs"],
      ["calc", "Calc"],
      ["summary", "Executive Summary"],
    ]);

    const inputs = imported.sheets[0]!;
    expect(inputs.rowCount).toBe(3);
    expect(inputs.columns).toEqual(source.sheets[0]!.columns);
    expect(inputs.frozenRows).toBe(1);
    expect(inputs.frozenCols).toBe(1);
    expect(inputs.rowMeta).toEqual([[1, { height: 31, hidden: true }]]);
    expect(inputs.merges).toEqual([{ r0: 2, c0: 0, r1: 2, c1: 1 }]);
    expect(inputs.conditionalFormats).toEqual(source.sheets[0]!.conditionalFormats);
    expect(inputs.rowGroups).toEqual(source.sheets[0]!.rowGroups);
    expect(inputs.validationRules).toEqual(source.sheets[0]!.validationRules);
    expect(inputs.protectedRanges).toEqual(source.sheets[0]!.protectedRanges);
    expect(inputs.notes).toEqual(source.sheets[0]!.notes);
    expect(inputs.sortKeys).toEqual(source.sheets[0]!.sortKeys);
    expect(inputs.filters).toEqual(source.sheets[0]!.filters);

    const inputCells = inputs.cells[0]!.cells;
    expect(inputCells[0]!.value).toEqual({ kind: "literal", value: 45_000 });
    expect(inputCells[2]!.value).toEqual({ kind: "literal", value: 45_001.5 });
    expect(inputCells[1]!.style).toMatchObject({
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      align: "right",
      wrap: true,
      border: {
        top: { color: "#334455", width: 2, style: "dashed" },
        right: { color: "#334455", width: 2, style: "dashed" },
        bottom: { color: "#334455", width: 2, style: "dashed" },
        left: { color: "#334455", width: 2, style: "dashed" },
      },
    });

    const calc = imported.sheets[1]!;
    expect(calc.cells[0]!.cells.map((cell) => cell.value)).toEqual([
      { kind: "formula", src: "=SUM(Inputs!B1:B2)" },
      { kind: "formula", src: "=A1+Inputs!B1" },
      {
        kind: "formula",
        src: "='Executive Summary'!A1+Inputs!B1",
      },
    ]);
    expect(imported.sheets[2]!.cells[0]!.cells.map((cell) => cell.value)).toEqual([
      { kind: "formula", src: "=Calc!A1" },
      {
        kind: "ref",
        target: { sheet: "inputs", row: 0, col: 1 },
      },
    ]);

    const store = SheetwriteStore.fromSnapshot(imported);
    try {
      expect(store.getFormula({ sheet: "calc", row: 0, col: 0 })).toBe("=SUM(Inputs!B1:B2)");
      expect(store.exportSnapshot().sheets[1]!.cells[0]!.cells[0]!.value).toEqual({
        kind: "formula",
        src: "=SUM(Inputs!B1:B2)",
      });
      expect(store.getRefTarget({ sheet: "summary", row: 1, col: 0 })).toEqual({
        sheet: "inputs",
        row: 0,
        col: 1,
      });
    } finally {
      store.dispose();
    }
  });

  it("exports neutralized external formula text as an inert cell value", async () => {
    const source = roundTripWorkbook();
    source.sheets[1]!.cells[0]!.cells[0]!.value = {
      kind: "literal",
      value: `'=IF(1,WEBSERVICE("https://example.test"),0)`,
    };
    const bytes = await toXlsxWorkbook(source);
    const inspected = new ExcelJS.Workbook();
    await inspected.xlsx.load(bytes.buffer as ArrayBuffer);
    const cell = inspected.getWorksheet("Calc")!.getCell("A1");
    expect(cell.formula).toBeUndefined();
    expect(cell.value).toBe(`'=IF(1,WEBSERVICE("https://example.test"),0)`);
  });

  it("expands shared-formula slaves instead of importing cached literals", async () => {
    const fixture = new ExcelJS.Workbook();
    const sheet = fixture.addWorksheet("Shared");
    sheet.getCell("A1").value = 1;
    sheet.getCell("A2").value = 2;
    sheet.getCell("A3").value = 3;
    sheet.fillFormula("B1:B3", "A1*2", [2, 4, 6]);
    sheet.getCell("C1").value = {
      formula: "XLOOKUP(2,A1:A3,B1:B3)",
      result: 4,
    };
    sheet.getCell("D1").value = {
      formula: "1/0",
      result: { error: "#DIV/0!" },
    };
    const output = await fixture.xlsx.writeBuffer();
    // ExcelJS's Buffer declaration omits its runtime Uint8Array inheritance.
    const fixtureBytes = output as unknown as Uint8Array;

    const inspected = new ExcelJS.Workbook();
    type ExcelLoadInput = Parameters<typeof inspected.xlsx.load>[0];
    const inspectInput = fixtureBytes as unknown as ExcelLoadInput;
    await inspected.xlsx.load(inspectInput);
    expect(inspected.getWorksheet("Shared")!.getCell("B2").value).toMatchObject({
      sharedFormula: "B1",
      result: 4,
    });

    const imported = await fromXlsxWorkbook(fixtureBytes);
    expect(
      imported.sheets[0]!.cells[0]!.cells.filter((cell) => cell.colOffset === 1).map(
        (cell) => cell.value,
      ),
    ).toEqual([
      { kind: "formula", src: "=A1*2" },
      { kind: "formula", src: "=A2*2" },
      { kind: "formula", src: "=A3*2" },
    ]);
    expect(imported.sheets[0]!.cells[0]!.cells.find((cell) => cell.colOffset === 2)?.value).toEqual(
      {
        kind: "formula",
        src: "=XLOOKUP(2,A1:A3,B1:B3)",
      },
    );
    expect(imported.sheets[0]!.cells[0]!.cells.find((cell) => cell.colOffset === 3)?.value).toEqual(
      {
        kind: "formula",
        src: "=1/0",
      },
    );
  });

  it("round-trips compact and alpha colors with per-side border styles", async () => {
    const source = roundTripWorkbook();
    source.sheets[0]!.cells[0]!.cells[0]!.style = {
      color: "#abc",
      backgroundColor: "#11223344",
      border: {
        top: { color: "#123456", style: "dotted" },
        right: { color: "#654321", style: "solid", width: 2 },
        bottom: { color: "not-a-color", style: "solid" },
      },
    };
    const imported = await fromXlsxWorkbook(await toXlsxWorkbook(source));
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.style).toMatchObject({
      color: "#AABBCC",
      backgroundColor: "#223344",
      border: {
        top: { color: "#123456", style: "dotted" },
        right: { color: "#654321", style: "solid", width: 2 },
      },
    });
    await expect(toXlsxWorkbook(source, { maxCells: 0 })).rejects.toThrow(
      "maxCells must be a positive integer",
    );
    await expect(toXlsxWorkbook(source, { maxCells: 1.5 })).rejects.toThrow(
      "maxCells must be a positive integer",
    );
  });

  it("maps every supported validation shape and warns when an inline list is too large", async () => {
    const source = roundTripWorkbook();
    const conditions: DataValidationCondition[] = [
      { kind: "list", values: [null, true, false, 'a"b'] },
      { kind: "checkbox", checkedValue: "yes", uncheckedValue: 0 },
      { kind: "date", min: 1, max: 2 },
      { kind: "textLength", min: 2 },
      { kind: "number", max: 10 },
      { kind: "list", values: ["x".repeat(256)] },
    ];
    source.sheets[0]!.validationRules = conditions.map((condition, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      return {
        id: `validation-${index}`,
        range: {
          sheet: "inputs",
          start: { row, col },
          end: { row, col },
        },
        condition,
        policy: "reject",
        allowBlank: false,
        helpText: "Contract validation",
      };
    });
    const warnings: string[] = [];
    const bytes = await toXlsxWorkbook(source, {
      onWarning: (warning) => warnings.push(warning.code),
    });
    const inspected = new ExcelJS.Workbook();
    type ExcelLoadInput = Parameters<typeof inspected.xlsx.load>[0];
    await inspected.xlsx.load(bytes as unknown as ExcelLoadInput);
    const sheet = inspected.getWorksheet("Inputs")!;

    expect(sheet.getCell("A1").dataValidation).toMatchObject({
      type: "list",
    });
    expect(sheet.getCell("B1").dataValidation).toMatchObject({
      type: "list",
      formulae: ['"yes,0"'],
    });
    expect(sheet.getCell("A2").dataValidation).toMatchObject({
      type: "date",
      operator: "between",
    });
    expect(sheet.getCell("B2").dataValidation).toMatchObject({
      type: "textLength",
      operator: "greaterThanOrEqual",
      formulae: [2],
    });
    expect(sheet.getCell("A3").dataValidation).toMatchObject({
      type: "decimal",
      operator: "lessThanOrEqual",
      formulae: [10],
    });
    expect(sheet.getCell("B3").dataValidation).toBeUndefined();
    expect(warnings).toContain("unsupported-feature");
  });

  it("reports lossy external cell values and enforces cancellation and allocation limits", async () => {
    const fixture = new ExcelJS.Workbook();
    const sheet = fixture.addWorksheet("Unsupported");
    sheet.getCell("A1").value = true;
    sheet.getCell("A1").dataValidation = {
      type: "whole",
      operator: "between",
      formulae: [0, 1],
    };
    sheet.getCell("A2").value = {
      richText: [{ text: "rich" }, { text: " text" }],
    };
    sheet.getCell("A3").value = {
      text: "Sheetwrite",
      hyperlink: "https://sheetwrite.example",
    };
    const output = await fixture.xlsx.writeBuffer();
    // ExcelJS's Buffer declaration omits its runtime Uint8Array inheritance.
    const fixtureBytes = output as unknown as Uint8Array;
    const warnings: string[] = [];
    const imported = await fromXlsxWorkbook(fixtureBytes, {
      onWarning: (warning) => warnings.push(warning.code),
    });

    expect(warnings).toEqual(["rich-text", "hyperlink", "unsupported-feature"]);
    expect(imported.sheets[0]!.cells[0]!.cells.map((cell) => cell.value)).toEqual([
      { kind: "literal", value: true },
      { kind: "literal", value: "rich text" },
      { kind: "literal", value: "Sheetwrite" },
    ]);
    await expect(fromXlsxWorkbook(fixtureBytes, { maxCells: 2 })).rejects.toThrow(
      "exceeds maxCells 2",
    );

    const controller = new AbortController();
    controller.abort(new Error("cancelled workbook import"));
    await expect(fromXlsxWorkbook(fixtureBytes, { signal: controller.signal })).rejects.toThrow(
      "cancelled workbook import",
    );
    await expect(toXlsxWorkbook(roundTripWorkbook(), { maxCells: 1 })).rejects.toThrow(
      "maxCells is 1",
    );
  });

  it("round-trips native boolean literals without text coercion", async () => {
    const source = roundTripWorkbook();
    source.sheets[0]!.cells = [
      {
        startRow: 0,
        startCol: 0,
        rowCount: 1,
        colCount: 1,
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "literal", value: true },
          },
        ],
      },
    ];

    const imported = await fromXlsxWorkbook(await toXlsxWorkbook(source));
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: true,
    });
  });
});
