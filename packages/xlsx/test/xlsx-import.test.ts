import { beforeAll, describe, expect, it } from "bun:test";
import type { Workbook, WorkbookSnapshot, XlsxWorkbookWarning } from "@sheetwrite/core";
import {
  dateToSerial,
  formatNumber,
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
  XlsxResourceError,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  registerXlsxBackends,
  sheetwriteTableImportBackend,
  sheetwriteWorkbookBackend,
} from "../src/index.js";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const FIXED_ZIP_TIME = new Date(1980, 0, 1);

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(new URL(name, FIXTURES)).arrayBuffer());
}

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
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 45_000 } },
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
                  border: { all: { color: "#334455", width: 2, style: "dashed" } },
                },
              },
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: 45_001.5 } },
              { rowOffset: 1, colOffset: 1, value: { kind: "literal", value: 6 } },
              { rowOffset: 2, colOffset: 0, value: { kind: "literal", value: "Merged note" } },
            ],
          },
        ],
      },
      {
        id: "calc",
        name: "Calc",
        order: 1,
        rowCount: 2,
        columns: [
          { key: "result", header: "Result", width: 100, type: "number", numberFormat: "0.00" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 2,
            colCount: 1,
            cells: [
              { rowOffset: 0, colOffset: 0, value: { kind: "formula", src: "=SUM(Inputs!B1:B2)" } },
              {
                rowOffset: 1,
                colOffset: 0,
                value: { kind: "ref", target: { sheet: "inputs", row: 0, col: 1 } },
              },
            ],
          },
        ],
      },
    ],
  };
}

function manualWorkbook(
  sheetXml: string,
  extras: { sharedStrings?: string; sheetRelationships?: string } = {},
): Uint8Array {
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    ...(extras.sharedStrings
      ? [
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
        ]
      : []),
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="External" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${extras.sharedStrings ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' : ""}</Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  };
  if (extras.sharedStrings) files["xl/sharedStrings.xml"] = strToU8(extras.sharedStrings);
  if (extras.sheetRelationships)
    files["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(extras.sheetRelationships);
  return zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME });
}

describe("independent XLSX corpus", () => {
  it("verifies every committed checksum and provenance record", async () => {
    const manifest = (await Bun.file(new URL("manifest.json", FIXTURES)).json()) as {
      positive: {
        file: string;
        sha256: string;
        source: { file: string; sha256: string };
        producer: { name: string; version: string; build: string };
      }[];
      adversarial: { file: string; sha256: string }[];
      specPositive: {
        file: string;
        sha256: string;
        source: { file: string; sha256: string };
      }[];
    };
    expect(manifest.positive[0]!.producer).toEqual({
      name: "LibreOffice",
      version: "26.2.4.2",
      build: "64a984c51f4702dbd3710b13428c673a2f1292e7",
    });
    const entries = [
      ...manifest.positive.map((entry) => ({ file: entry.file, sha256: entry.sha256 })),
      ...manifest.positive.map((entry) => entry.source),
      ...manifest.adversarial,
      ...manifest.specPositive.map((entry) => ({ file: entry.file, sha256: entry.sha256 })),
      ...manifest.specPositive.map((entry) => entry.source),
    ];
    for (const entry of entries) {
      const bytes = await fixture(entry.file);
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(bytes);
      expect(hasher.digest("hex")).toBe(entry.sha256);
    }
  });

  it("imports the LibreOffice-produced reader oracle", async () => {
    const bytes = await fixture("sheetwrite-libreoffice-positive.xlsx");
    const table = await fromXlsxTable(bytes);
    expect(table).toEqual({
      rowCount: 2,
      columns: {
        Name: ["Alice", "Bob"],
        Amount: [42.5, -7],
        Active: ["TRUE", "FALSE"],
        When: [
          dateToSerial(new Date(Date.UTC(2024, 1, 29))),
          dateToSerial(new Date(Date.UTC(2024, 2, 1))),
        ],
        Note: ["  spaced  ", "LibreOffice fixture"],
      },
    });
    const imported = await fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]).toMatchObject({
      name: "sheetwrite-libreoffice-positive",
      rowCount: 3,
    });
    expect(imported.sheets[0]!.columns[3]).toMatchObject({
      type: "date",
      numberFormat: "yyyy\\-mm\\-dd",
    });
  });

  it("imports LibreOffice-native formulas, styles, validations, comments, merges, and views", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await fromXlsxWorkbook(await fixture("libreoffice-rich.xlsx"), {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "rich-text",
        cell: "C2",
        message: expect.stringContaining("Comment rich text"),
      }),
    );
    expect(imported.workbook.activeSheet).toBe("calc");
    expect(imported.workbook.namedRanges).toEqual([
      {
        name: "InputAmounts",
        range: {
          sheet: "inputs",
          start: { row: 1, col: 0 },
          end: { row: 3, col: 0 },
        },
      },
    ]);
    expect(imported.sheets.map((sheet) => [sheet.id, sheet.name])).toEqual([
      ["inputs", "Inputs"],
      ["calc", "Calc"],
      ["hidden", "Hidden"],
    ]);
    expect(imported.sheets[2]!.visibility).toBe("hidden");
    const inputs = imported.sheets[0]!;
    expect([inputs.frozenRows, inputs.frozenCols]).toEqual([1, 1]);
    expect(inputs.merges).toContainEqual({ r0: 1, c0: 3, r1: 1, c1: 4 });
    const currencyFormat = inputs.columns[1]!.numberFormat;
    expect(inputs.columns[1]).toMatchObject({
      type: "currency",
      numberFormat: expect.stringContaining("$#,##0.00"),
    });
    expect(inputs.columns[4]!.visible).toBe(false);
    expect({
      format: currencyFormat,
      rendered: formatNumber(2, currencyFormat),
    }).toEqual({
      format: expect.stringContaining("$#,##0.00"),
      rendered: "$2.00",
    });
    expect(inputs.validationRules?.[0]).toMatchObject({
      range: {
        sheet: "inputs",
        start: { row: 1, col: 0 },
        end: { row: 3, col: 0 },
      },
      condition: { kind: "number", min: 0, max: 10 },
    });
    expect(inputs.notes).toEqual([
      {
        addr: { sheet: "inputs", row: 1, col: 2 },
        text: "LibreOffice-authored note",
      },
    ]);
    const styled = inputs.cells[0]!.cells.find(
      (cell) => cell.rowOffset === 1 && cell.colOffset === 2,
    );
    expect(styled?.style).toMatchObject({
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      align: "center",
      border: {
        top: { color: "#334455", style: "dotted" },
        right: { color: "#334455", style: "dotted" },
        bottom: { color: "#334455", style: "dotted" },
        left: { color: "#334455", style: "dotted" },
      },
    });
    expect(imported.sheets[1]!.cells[0]!.cells.map((cell) => cell.value)).toEqual([
      { kind: "formula", src: "=SUM(Inputs!A2:A4)" },
      { kind: "formula", src: "=Inputs!B2+Inputs!B3" },
    ]);
  });

  it("reads versioned metadata only after LibreOffice preserves the hidden metadata sheet", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await fromXlsxWorkbook(await fixture("libreoffice-metadata.xlsx"), {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(imported).toMatchObject({
      documentId: "libreoffice-rich-oracle",
      version: 42,
      workbook: { activeSheet: "calc" },
    });
    expect(imported.sheets.map((sheet) => sheet.id)).toEqual(["inputs", "calc", "hidden"]);
    expect(imported.sheets[0]!.columns[0]).toMatchObject({
      key: "input",
      header: "Input",
      type: "number",
    });
    expect(imported.sheets[0]!.validationRules?.[0]?.condition).toEqual({
      kind: "number",
      min: 0,
      max: 10,
    });
    expect(imported.sheets[0]!.notes?.[0]?.text).toBe("LibreOffice-authored note");
    expect(warnings.map((warning) => warning.code)).toEqual(["rich-text"]);
    expect(imported.sheets[2]!.visibility).toBe("hidden");
  });
});

describe("table XLSX interchange", () => {
  it("round-trips values, empty cells, and reserved or duplicate headers", async () => {
    const source = workbook();
    source.sheets[0]!.columns = [
      { key: "a", header: "__proto__", width: 80, type: "text" },
      { key: "b", header: "__proto__", width: 80, type: "number" },
      { key: "c", header: "constructor", width: 80, type: "text" },
    ];
    const store = new SheetwriteStore(source);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "first" },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 1 },
          value: { kind: "literal", value: 42.5 },
        },
        {
          op: "set",
          addr: { sheet: "s", row: 2, col: 2 },
          value: { kind: "literal", value: "third" },
        },
      ],
    });
    const data = await fromXlsxTable(await toXlsxTable(store.getWorkbook(), store));
    expect(Object.getPrototypeOf(data.columns)).toBeNull();
    expect(Object.keys(data.columns)).toEqual(["__proto__", "__proto___2", "constructor"]);
    expect(Reflect.get(data.columns, "__proto__")).toEqual(["first", null, null]);
    expect(data.columns.__proto___2).toEqual([42.5, null, null]);
    expect(Reflect.get(data.columns, "constructor")).toEqual([null, null, "third"]);
    store.dispose();
  });
});

describe("workbook OOXML fidelity", () => {
  it("is byte-deterministic and preserves supported workbook semantics", async () => {
    const source = roundTripWorkbook();
    const warnings: XlsxWorkbookWarning[] = [];
    const first = await toXlsxWorkbook(source, { onWarning: (warning) => warnings.push(warning) });
    const second = await toXlsxWorkbook(source);
    expect(first).toEqual(second);
    expect(warnings.map((warning) => warning.code)).toEqual([
      "unsupported-feature",
      "unsupported-feature",
    ]);
    const parts = unzipSync(first);
    expect(strFromU8(parts["xl/workbook.xml"]!)).toContain('fullCalcOnLoad="1"');
    expect(strFromU8(parts["xl/workbook.xml"]!)).toContain('name="InputAmounts"');
    const inputsXml = strFromU8(parts["xl/worksheets/sheet1.xml"]!);
    expect(inputsXml).toContain('<mergeCell ref="A3:B3"/>');
    expect(inputsXml).toContain('state="frozen"');
    expect(inputsXml).toContain('type="decimal"');
    expect(inputsXml).toContain("<conditionalFormatting");
    expect(strFromU8(parts["xl/styles.xml"]!)).toContain("<dxfs count=");
    expect(strFromU8(parts["xl/comments1.xml"]!)).toContain("Imported source date");
    expect(strFromU8(parts["xl/worksheets/sheet2.xml"]!)).toContain("SUM(Inputs!B1:B2)");

    const imported = await fromXlsxWorkbook(first);
    expect(imported.documentId).toBe("xlsx-round-trip");
    expect(imported.version).toBe(7);
    expect(imported.workbook).toEqual(source.workbook);
    expect(imported.sheets.map((sheet) => [sheet.id, sheet.name])).toEqual([
      ["inputs", "Inputs"],
      ["calc", "Calc"],
    ]);
    const inputs = imported.sheets[0]!;
    expect(inputs.columns).toEqual(source.sheets[0]!.columns);
    expect(inputs.frozenRows).toBe(1);
    expect(inputs.frozenCols).toBe(1);
    expect(inputs.rowMeta).toEqual([[1, { height: 31, hidden: true }]]);
    expect(inputs.merges).toEqual(source.sheets[0]!.merges);
    expect(inputs.validationRules).toEqual(source.sheets[0]!.validationRules);
    expect(inputs.notes).toEqual(source.sheets[0]!.notes);
    expect(inputs.conditionalFormats).toEqual(source.sheets[0]!.conditionalFormats);
    expect(inputs.rowGroups).toEqual(source.sheets[0]!.rowGroups);
    expect(inputs.protectedRanges).toEqual(source.sheets[0]!.protectedRanges);
    expect(inputs.filters).toEqual(source.sheets[0]!.filters);
    expect(inputs.sortKeys).toEqual(source.sheets[0]!.sortKeys);
    expect(inputs.cells[0]!.cells[1]!.style).toMatchObject({
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
    expect(imported.sheets[1]!.cells[0]!.cells.map((cell) => cell.value)).toEqual([
      { kind: "formula", src: "=SUM(Inputs!B1:B2)" },
      { kind: "ref", target: { sheet: "inputs", row: 0, col: 1 } },
    ]);
  });

  it("extends metadata when an external editor adds rows and columns", async () => {
    const parts = unzipSync(await toXlsxWorkbook(roundTripWorkbook()));
    const part = "xl/worksheets/sheet1.xml";
    const xml = strFromU8(parts[part]!);
    parts[part] = strToU8(
      xml
        .replace('dimension ref="A1:B3"', 'dimension ref="A1:D5"')
        .replace("</sheetData>", '<row r="5"><c r="D5"><v>99</v></c></row></sheetData>'),
    );
    const edited = zipSync(parts, { level: 6, mtime: FIXED_ZIP_TIME });
    const imported = await fromXlsxWorkbook(edited);
    expect(imported.sheets[0]).toMatchObject({ id: "inputs", rowCount: 5 });
    expect(imported.sheets[0]!.columns).toHaveLength(4);
    expect(
      imported.sheets[0]!.cells[0]!.cells.find(
        (cell) => cell.rowOffset === 4 && cell.colOffset === 3,
      )?.value,
    ).toEqual({ kind: "literal", value: 99 });
  });

  it("expands independently authored shared formula slaves", async () => {
    const bytes = await fixture("shared-formula.xlsx");
    const imported = await fromXlsxWorkbook(bytes);
    expect(
      imported.sheets[0]!.cells[0]!.cells.filter((cell) => cell.colOffset === 1).map(
        (cell) => cell.value,
      ),
    ).toEqual([
      { kind: "formula", src: "=A1*2" },
      { kind: "formula", src: "=A2*2" },
      { kind: "formula", src: "=A3*2" },
    ]);
    expect(
      imported.sheets[0]!.cells[0]!.cells.filter((cell) => cell.colOffset === 0).map(
        (cell) => cell.value,
      ),
    ).toEqual([
      { kind: "literal", value: 1 },
      { kind: "literal", value: 2 },
      { kind: "literal", value: 3 },
    ]);
  });

  it("emits structured warnings while preserving supported external content", async () => {
    const bytes = manualWorkbook(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData><dataValidations count="1"><dataValidation type="whole" operator="between" sqref="A1" showErrorMessage="1"><formula1>0</formula1><formula2>10</formula2></dataValidation></dataValidations><hyperlinks><hyperlink ref="A1" r:id="rId1"/></hyperlinks></worksheet>`,
      {
        sharedStrings:
          '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><r><t>rich</t></r><r><t> text</t></r></si></sst>',
        sheetRelationships:
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://sheetwrite.example" TargetMode="External"/></Relationships>',
      },
    );
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings.map((warning) => warning.code).sort()).toEqual([
      "external-relationship",
      "hyperlink",
      "rich-text",
    ]);
    expect(warnings.every((warning) => warning.message.length > 0)).toBe(true);
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: "rich text",
    });
    expect(imported.sheets[0]!.validationRules?.[0]).toMatchObject({
      condition: { kind: "number", min: 0, max: 10 },
      policy: "reject",
    });
  });
});

describe("bounded and corrupt XLSX inputs", () => {
  it("rejects adversarial corpus entries at typed, deterministic boundaries", async () => {
    await expect(fromXlsxWorkbook(await fixture("traversal.xlsx"))).rejects.toThrow(
      "unsafe part name",
    );
    await expect(fromXlsxWorkbook(await fixture("doctype.xlsx"))).rejects.toThrow(
      "DTDs and entities are forbidden",
    );
    await expect(fromXlsxWorkbook(await fixture("corrupt-deflate.xlsx"))).rejects.toThrow(
      /corrupt|CRC mismatch/,
    );
    for (const [file, resource] of [
      ["deep-xml.xlsx", "maxXmlDepth"],
      ["compression-ratio.xlsx", "maxCompressionRatio"],
    ] as const) {
      try {
        await fromXlsxWorkbook(await fixture(file));
        throw new Error(`Expected ${file} to fail`);
      } catch (error) {
        expect(error).toBeInstanceOf(XlsxResourceError);
        expect(error).toMatchObject({ code: "XLSX_RESOURCE_LIMIT", resource, operation: "import" });
      }
    }
  });

  it("validates the shared table/workbook resource contract before codec allocation", async () => {
    const positive = await fixture("sheetwrite-libreoffice-positive.xlsx");
    for (const operation of [
      () => fromXlsxWorkbook(positive, { resourceLimits: { maxInputBytes: 16 } }),
      () => fromXlsxTable(positive, { resourceLimits: { maxInputBytes: 16 } }),
    ]) {
      try {
        await operation();
        throw new Error("Expected input limit to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(XlsxResourceError);
        expect(error).toMatchObject({
          resource: "maxInputBytes",
          actual: positive.byteLength,
          limit: 16,
        });
      }
    }
    await expect(fromXlsxWorkbook(positive, { maxCells: 0 })).rejects.toThrow(
      "maxCells must be a positive integer",
    );
    await expect(
      fromXlsxWorkbook(positive, { resourceLimits: { maxXmlDepth: 1.5 } }),
    ).rejects.toThrow("maxXmlDepth must be a positive integer");
    await expect(
      fromXlsxWorkbook(positive, {
        resourceLimits: { maxRowsPerSheet: Number.MAX_SAFE_INTEGER + 1 },
      }),
    ).rejects.toThrow("maxRowsPerSheet must be a positive integer");
    await expect(
      fromXlsxWorkbook(positive, { resourceLimits: { maxXmlTextBytes: 4 } }),
    ).rejects.toThrow(XlsxResourceError);
    await expect(
      fromXlsxWorkbook(
        manualWorkbook(
          '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2:C3"/><sheetData/></worksheet>',
        ),
      ),
    ).rejects.toThrow("range A1:B2:C3 is invalid");
    await expect(toXlsxWorkbook(roundTripWorkbook(), { maxCells: 1 })).rejects.toThrow(
      XlsxResourceError,
    );
    const controller = new AbortController();
    controller.abort(new Error("cancelled workbook import"));
    await expect(fromXlsxWorkbook(positive, { signal: controller.signal })).rejects.toThrow(
      "cancelled workbook import",
    );
  });

  it("uses seeded round-trips and central-directory corruption without circular reader fixtures", async () => {
    let seed = 0x5eed1234;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    for (let iteration = 0; iteration < 12; iteration++) {
      const cells = [];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 4; col++) {
          const value = random();
          if ((value & 3) === 0) continue;
          cells.push({
            rowOffset: row,
            colOffset: col,
            value: {
              kind: "literal" as const,
              value: value & 1 ? `s-${value.toString(16)}` : value % 10_000,
            },
            ...((value & 15) === 1 ? { style: { bold: true, backgroundColor: "#DDEEFF" } } : {}),
          });
        }
      }
      const snapshot: WorkbookSnapshot = {
        schemaVersion: 1,
        version: iteration,
        workbook: { activeSheet: "seed" },
        sheets: [
          {
            id: "seed",
            name: "Seeded",
            order: 0,
            rowCount: 8,
            columns: Array.from({ length: 4 }, (_unused, col) => ({
              key: `c${col}`,
              header: `C${col}`,
              width: 80 + col,
              type: "text" as const,
            })),
            cells: [{ startRow: 0, startCol: 0, rowCount: 8, colCount: 4, cells }],
          },
        ],
      };
      const bytes = await toXlsxWorkbook(snapshot);
      expect(await toXlsxWorkbook(snapshot)).toEqual(bytes);
      const imported = await fromXlsxWorkbook(bytes);
      expect(imported.version).toBe(iteration);
      expect(imported.sheets[0]!.cells[0]!.cells.map((cell) => cell.value)).toEqual(
        cells.map((cell) => cell.value),
      );
      const corrupt = bytes.slice();
      let eocd = corrupt.length - 22;
      while (
        eocd >= 0 &&
        new DataView(corrupt.buffer, corrupt.byteOffset, corrupt.byteLength).getUint32(
          eocd,
          true,
        ) !== 0x06054b50
      )
        eocd -= 1;
      const centralOffset = new DataView(
        corrupt.buffer,
        corrupt.byteOffset,
        corrupt.byteLength,
      ).getUint32(eocd + 16, true);
      corrupt[centralOffset] = corrupt[centralOffset]! ^ 0xff;
      await expect(fromXlsxWorkbook(corrupt)).rejects.toThrow("central directory");
    }
  });
});

it("exports the clean backend names without compatibility aliases", () => {
  expect(sheetwriteWorkbookBackend.name).toBe("sheetwrite-ooxml");
  expect(sheetwriteTableImportBackend.name).toBe("sheetwrite-ooxml-table");
});
