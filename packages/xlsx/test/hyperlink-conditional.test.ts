import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  isSheetwriteError,
  type WorkbookSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";

const ECMA_376_SOURCES = {
  spreadsheetMl: {
    edition: "5th edition, December 2016",
    clauses: ["18.3.1.10", "18.3.1.18", "18.3.1.47", "18.3.1.48"],
    url: "https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip",
    sha256: "9d0bcad9cf06054785b03762fcfadbf6bab7e54a5f9d69434e34b7fd464d4129",
  },
  opc: {
    edition: "5th edition, December 2021",
    clauses: ["6.5.2.3", "6.5.3.4"],
    url: "https://ecma-international.org/wp-content/uploads/ECMA-376-2_5th_edition_december_2021.zip",
    sha256: "1d489dc491168ea1f9e9a59063acc8dd5f02b4ad1d21aa7ec19ba9a58d020c70",
  },
} as const;
const FIXED_ZIP_TIME = new Date(1980, 0, 1);
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const HYPERLINK_REL = `${OFFICE_REL_NS}/hyperlink`;

interface OriginalVectorOptions {
  readonly conditionalFormatting?: string;
  readonly hyperlinks?: string;
  readonly extensions?: string;
  readonly relationship?: {
    readonly target: string;
    readonly external: boolean;
  };
}

/**
 * Original minimal OPC/SpreadsheetML vector. The XML is authored for this test from the
 * clauses recorded above; it is not copied from a producer fixture or emitted by Sheetwrite.
 */
function originalEcmaVector(options: OriginalVectorOptions): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns="${MAIN_NS}" xmlns:r="${OFFICE_REL_NS}"><sheets><sheet name="Source" sheetId="1" r:id="rId1"/><sheet name="Destination Sheet" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet xmlns="${MAIN_NS}" xmlns:r="${OFFICE_REL_NS}"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Report</t></is></c></row></sheetData>${options.conditionalFormatting ?? ""}${options.hyperlinks ? `<hyperlinks>${options.hyperlinks}</hyperlinks>` : ""}${options.extensions ?? ""}</worksheet>`,
    ),
    "xl/worksheets/sheet2.xml": strToU8(
      `<?xml version="1.0"?><worksheet xmlns="${MAIN_NS}"><dimension ref="A1:B2"/><sheetData/></worksheet>`,
    ),
  };
  if (options.relationship) {
    files["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${HYPERLINK_REL}" Target="${options.relationship.target}"${options.relationship.external ? ' TargetMode="External"' : ""}/></Relationships>`,
    );
  }
  return zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "source" },
    sheets: [
      {
        id: "source",
        name: "Source",
        order: 0,
        rowCount: 2,
        columns: [
          { key: "a", header: "A", width: 100, type: "text" },
          { key: "b", header: "B", width: 100, type: "number" },
        ],
        hyperlinks: [
          {
            id: "external-link",
            range: { sheet: "source", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
            target: { kind: "external", url: "https://example.com/report?q=1" },
            display: "Report",
            style: { color: "#123456", underline: true },
          },
          {
            id: "internal-link",
            range: { sheet: "source", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
            target: {
              kind: "internal",
              range: {
                sheet: "destination",
                start: { row: 1, col: 1 },
                end: { row: 1, col: 1 },
              },
            },
            display: "Destination",
          },
        ],
        conditionalFormats: [
          {
            range: { sheet: "source", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
            when: { kind: "formula", source: '=A1<>""' },
            style: { backgroundColor: "#ABCDEF", bold: true },
            stopIfTrue: true,
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 2,
            colCount: 2,
            cells: [
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "Report" } },
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: "Destination" } },
            ],
          },
        ],
      },
      {
        id: "destination",
        name: "Destination Sheet",
        order: 1,
        rowCount: 2,
        columns: [
          { key: "a", header: "A", width: 100, type: "text" },
          { key: "b", header: "B", width: 100, type: "number" },
        ],
        cells: [],
      },
    ],
  };
}

describe("XLSX hyperlink and conditional-format fidelity", () => {
  it("round-trips external relationships, stable internal targets, display/style, formula, and stop", async () => {
    const source = sourceSnapshot();
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source);
    const parts = unzipSync(bytes);
    const sheetXml = strFromU8(parts["xl/worksheets/sheet1.xml"]!);
    const rels = strFromU8(parts["xl/worksheets/_rels/sheet1.xml.rels"]!);
    expect(sheetXml).toContain('<hyperlink ref="A1" r:id="rId1" display="Report"/>');
    expect(sheetXml).toContain('location="&apos;Destination Sheet&apos;!B2"');
    expect(sheetXml).toContain('type="expression"');
    expect(sheetXml).toContain('stopIfTrue="1"');
    expect(rels).toContain('Target="https://example.com/report?q=1" TargetMode="External"');

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.hyperlinks).toEqual(source.sheets[0]!.hyperlinks);
    expect(imported.sheets[0]!.conditionalFormats).toEqual(source.sheets[0]!.conditionalFormats);
  });

  it("imports an original clause-derived OPC vector with fixed byte identity", async () => {
    const bytes = originalEcmaVector({
      conditionalFormatting:
        '<conditionalFormatting sqref="B1:B2"><cfRule type="expression" priority="1" stopIfTrue="1"><formula>A1&lt;&gt;""</formula></cfRule></conditionalFormatting>',
      hyperlinks:
        '<hyperlink ref="A1" r:id="rId1" display="Report"/><hyperlink ref="B1" location="&apos;Destination Sheet&apos;!B2" display="Destination"/>',
      relationship: { target: "https://example.com/report", external: true },
    });
    expect(ECMA_376_SOURCES.spreadsheetMl.clauses).toEqual([
      "18.3.1.10",
      "18.3.1.18",
      "18.3.1.47",
      "18.3.1.48",
    ]);
    expect(ECMA_376_SOURCES.opc.clauses).toEqual(["6.5.2.3", "6.5.3.4"]);
    expect(sha256(bytes)).toBe("5fb633b8b4571db525829cf7dc18929cc6408d8ab785d1227d09752de3208adf");

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.hyperlinks).toEqual([
      expect.objectContaining({
        range: { sheet: "source", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        target: { kind: "external", url: "https://example.com/report" },
        display: "Report",
      }),
      expect.objectContaining({
        range: { sheet: "source", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
        target: {
          kind: "internal",
          range: {
            sheet: "destination-sheet",
            start: { row: 1, col: 1 },
            end: { row: 1, col: 1 },
          },
        },
        display: "Destination",
      }),
    ]);
    expect(imported.sheets[0]!.conditionalFormats).toEqual([
      {
        range: { sheet: "source", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
        when: { kind: "formula", source: '=A1<>""' },
        style: {},
        stopIfTrue: true,
      },
    ]);
  });

  it("drops unsafe external schemes with an exact warning before snapshot mutation", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const bytes = originalEcmaVector({
      hyperlinks: '<hyperlink ref="A1" r:id="rId1" display="Unsafe"/>',
      relationship: { target: "javascript:alert(1)", external: true },
    });
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(imported.sheets[0]!.hyperlinks ?? []).toEqual([]);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "hyperlink",
        message: "Hyperlink external target is not an absolute HTTPS or mailto URL and was dropped",
        sheet: "Source",
        cell: "A1",
      }),
    );
  });

  it("rejects an internal relationship target that traverses outside the package", async () => {
    const bytes = originalEcmaVector({
      hyperlinks: '<hyperlink ref="A1" r:id="rId1"/>',
      relationship: { target: "../../../escape.xml", external: false },
    });
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
      throw new Error("expected traversal rejection");
    } catch (error) {
      expect(isSheetwriteError(error)).toBe(true);
      if (isSheetwriteError(error)) expect(error.operation).toBe("xlsx-import");
    }
  });

  it("emits exact per-kind warnings and keeps only the bounded 32-rule prefix", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const rules = Array.from(
      { length: 33 },
      (_, index) =>
        `<conditionalFormatting sqref="A1"><cfRule type="expression" priority="${index + 10}"><formula>TRUE</formula></cfRule></conditionalFormatting>`,
    ).join("");
    const bytes = originalEcmaVector({
      conditionalFormatting: `<conditionalFormatting sqref="A1"><cfRule type="colorScale" priority="2"><colorScale/></cfRule></conditionalFormatting><conditionalFormatting sqref="A1"><cfRule type="dataBar" priority="3"><dataBar/></cfRule></conditionalFormatting>${rules}`,
    });
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(imported.sheets[0]!.conditionalFormats).toHaveLength(32);
    expect(warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        "Excel conditional-format rule type colorScale is unsupported and was dropped",
        "Excel conditional-format rule type dataBar is unsupported and was dropped",
        "Excel conditional-format rule limit 32 was exceeded; later rules were dropped",
      ]),
    );
  });

  it("drops malformed, unsafe, and over-budget conditional rules independently", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const oversizedFormula = `=${"A".repeat(8_192)}`;
    const rules = [
      '<cfRule type="cellIs" priority="-1" operator="equal"><formula>1</formula></cfRule>',
      '<cfRule type="cellIs" priority="2" operator="between"><formula>1</formula></cfRule>',
      `<cfRule type="expression" priority="3"><formula>${oversizedFormula}</formula></cfRule>`,
      '<cfRule type="expression" priority="4"><formula>[1]Sheet1!A1</formula></cfRule>',
      '<cfRule type="containsBlanks" priority="5" dxfId="bad"/>',
      '<cfRule type="containsBlanks" priority="6" dxfId="999"/>',
    ].join("");
    const bytes = originalEcmaVector({
      conditionalFormatting: `<conditionalFormatting sqref="A1">${rules}</conditionalFormatting>`,
    });

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });

    expect(imported.sheets[0]!.conditionalFormats).toBeUndefined();
    expect(warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        "Excel conditional-format rule has an invalid priority and was dropped",
        "Excel conditional-format rule type cellIs is unsupported and was dropped",
        "Excel conditional-format formula exceeds 8192 characters and was dropped",
        "External-data conditional-format formula was dropped",
        "Excel conditional-format rule type containsBlanks has an invalid differential style and was dropped",
      ]),
    );
  });

  it("caps oversized hyperlinks and reports extension loss exactly", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const hyperlinks = Array.from(
      { length: 4_097 },
      (_, index) => `<hyperlink ref="A1" r:id="rId1" display="Link ${index}"/>`,
    ).join("");
    const bytes = originalEcmaVector({
      hyperlinks,
      relationship: { target: "https://example.com", external: true },
      extensions:
        '<extLst><ext uri="{78C0D931-6437-407D-A8EE-F0AAD7539E65}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:conditionalFormattings/></ext></extLst>',
    });
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });
    expect(imported.sheets[0]!.hyperlinks).toHaveLength(4_096);
    expect(warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        "Excel hyperlink limit 4096 was exceeded; later hyperlinks were dropped",
        "Extended conditional formatting is unsupported and was dropped",
      ]),
    );
  });

  it("rejects malformed hyperlink source ranges", async () => {
    const bytes = originalEcmaVector({
      hyperlinks: '<hyperlink ref="A0" r:id="rId1"/>',
      relationship: { target: "https://example.com", external: true },
    });
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes)).rejects.toMatchObject({
      operation: "xlsx-import",
    });
  });
});
