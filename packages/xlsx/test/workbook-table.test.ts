import { describe, expect, it } from "bun:test";
import type { WorkbookSnapshot, XlsxWorkbookWarning } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { rawXlsx, TRANSITIONAL_MAIN, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";

const TABLE_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";
const SPEC_AUTHORED_TABLE_VECTOR = Object.freeze({
  provenance: {
    evidence: "specification-derived",
    part1: {
      edition: "ECMA-376-1 5th edition (December 2016)",
      clauses: ["18.5.1.2 table", "18.5.1.4 tableColumns", "18.5.1.5 tableStyleInfo"],
      url: "https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip",
      archiveSha256: "9d0bcad9cf06054785b03762fcfadbf6bab7e54a5f9d69434e34b7fd464d4129",
    },
    part2: {
      edition: "ECMA-376-2 5th edition (December 2021)",
      clauses: ["6.2 Parts", "6.5.2.3 Part Relationships part", "6.5.3.4 Relationship element"],
      url: "https://ecma-international.org/wp-content/uploads/ECMA-376-2_5th_edition_december_2021.zip",
    },
  },
  tableXml: `<?xml version="1.0"?><table xmlns="${TRANSITIONAL_MAIN}" id="7" name="Sales" displayName="Sales" ref="A1:A3" totalsRowCount="1"><autoFilter ref="A1:A2"><sortState ref="A2:A2"/></autoFilter><tableColumns count="1"><tableColumn id="4" name="Amount" totalsRowFunction="sum"><calculatedColumnFormula>[#This Row]</calculatedColumnFormula></tableColumn></tableColumns><tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/><extLst/></table>`,
});

function nativeTablePackage(tableXml: string, workbookExtra = ""): Uint8Array {
  return rawXlsx({
    sheets: [
      {
        name: "Raw",
        xml: worksheet(
          '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Amount</t></is></c></row></sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts>',
        ),
        relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/table" Target="../tables/table1.xml"/>`,
      },
    ],
    workbookExtra,
    extraOverrides: [`<Override PartName="/xl/tables/table1.xml" ContentType="${TABLE_CONTENT}"/>`],
    extraFiles: { "xl/tables/table1.xml": tableXml },
  });
}

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "sheet-stable" },
    sheets: [
      {
        id: "sheet-stable",
        name: "Data",
        order: 0,
        rowCount: 4,
        columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
        tables: [
          {
            id: "table-stable",
            name: "Sales",
            range: {
              sheet: "sheet-stable",
              start: { row: 0, col: 0 },
              end: { row: 3, col: 0 },
            },
            columns: [{ id: "column-stable", name: "Amount", totalsRowLabel: "Total" }],
            headerRow: true,
            totalsRow: true,
            style: { name: "TableStyleMedium2", showRowStripes: true },
          },
        ],
        cells: [],
      },
    ],
  };
}

describe("native XLSX workbook tables", () => {
  it("round-trips Sheetwrite stable identities through native table parts and sidecar metadata", async () => {
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot());
    const parts = unzipSync(bytes);
    const tableXml = strFromU8(parts["xl/tables/table1.xml"]!);
    const sheetXml = strFromU8(parts["xl/worksheets/sheet1.xml"]!);

    expect(sheetXml).toContain('<tableParts count="1"><tablePart r:id="rId3"/></tableParts>');
    expect(tableXml).toContain('displayName="Sales"');
    expect(tableXml).toContain('ref="A1:A4"');
    expect(tableXml).toContain('totalsRowLabel="Total"');
    expect(tableXml).toContain('name="TableStyleMedium2"');

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.tables).toEqual(snapshot().sheets[0]!.tables);
  });

  it("imports and safely re-saves the specification-derived ECMA-376 table subset", async () => {
    expect(SPEC_AUTHORED_TABLE_VECTOR.provenance).toEqual({
      evidence: "specification-derived",
      part1: {
        edition: "ECMA-376-1 5th edition (December 2016)",
        clauses: ["18.5.1.2 table", "18.5.1.4 tableColumns", "18.5.1.5 tableStyleInfo"],
        url: "https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip",
        archiveSha256: "9d0bcad9cf06054785b03762fcfadbf6bab7e54a5f9d69434e34b7fd464d4129",
      },
      part2: {
        edition: "ECMA-376-2 5th edition (December 2021)",
        clauses: ["6.2 Parts", "6.5.2.3 Part Relationships part", "6.5.3.4 Relationship element"],
        url: "https://ecma-international.org/wp-content/uploads/ECMA-376-2_5th_edition_december_2021.zip",
      },
    });
    const warnings: XlsxWorkbookWarning[] = [];
    const bytes = nativeTablePackage(SPEC_AUTHORED_TABLE_VECTOR.tableXml);
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });

    expect(imported.sheets[0]!.tables).toEqual([
      expect.objectContaining({
        id: "xlsx-table-7",
        name: "Sales",
        headerRow: true,
        totalsRow: true,
        columns: [{ id: "xlsx-table-7-column-4", name: "Amount" }],
        unsupportedFeatures: [
          "auto-filter",
          "sort-state",
          "calculated-columns",
          "totals-functions",
          "extensions",
        ],
      }),
    ]);
    expect(warnings.map((warning) => warning.message)).toEqual([
      "Excel table autoFilter was preserved as unsupported metadata on table Sales and was not activated",
      "Excel table sortState was preserved as unsupported metadata on table Sales and was not activated",
      "Excel table calculated columns was preserved as unsupported metadata on table Sales and was not activated",
      "Excel table totals functions was preserved as unsupported metadata on table Sales and was not activated",
      "Excel table extensions was preserved as unsupported metadata on table Sales and was not activated",
    ]);

    const exportWarnings: XlsxWorkbookWarning[] = [];
    const resaved = await sheetwriteWorkbookBackend.toXlsxWorkbook(imported, {
      onWarning: (warning) => exportWarnings.push(warning),
    });
    expect(exportWarnings.map((warning) => warning.message)).toEqual([
      "Workbook table Sales declares unsupported feature auto-filter; it remains in Sheetwrite metadata and was not emitted",
      "Workbook table Sales declares unsupported feature sort-state; it remains in Sheetwrite metadata and was not emitted",
      "Workbook table Sales declares unsupported feature calculated-columns; it remains in Sheetwrite metadata and was not emitted",
      "Workbook table Sales declares unsupported feature totals-functions; it remains in Sheetwrite metadata and was not emitted",
      "Workbook table Sales declares unsupported feature extensions; it remains in Sheetwrite metadata and was not emitted",
    ]);
    const resavedTableXml = strFromU8(unzipSync(resaved)["xl/tables/table1.xml"]!);
    for (const unsupportedMarkup of [
      "<autoFilter",
      "<sortState",
      "<calculatedColumnFormula",
      'totalsRowFunction="',
      "<extLst",
    ]) {
      expect(resavedTableXml).not.toContain(unsupportedMarkup);
    }
    const reimported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(resaved);
    expect(reimported.sheets[0]!.tables).toEqual(imported.sheets[0]!.tables);
  });

  it("rejects malformed and oversized table declarations before materializing table models", async () => {
    const malformed = nativeTablePackage(
      `<?xml version="1.0"?><table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="Sales" ref="A1:B2"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`,
    );
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(malformed)).rejects.toThrow(
      "column count does not match its range",
    );

    const oversizedParts = Array.from({ length: 1_025 }, () => '<tablePart r:id="rId1"/>').join("");
    const oversized = rawXlsx({
      sheets: [
        {
          name: "Raw",
          xml: worksheet(`<sheetData/><tableParts count="1025">${oversizedParts}</tableParts>`),
        },
      ],
    });
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(oversized)).rejects.toThrow(
      "exceeds the workbook table limit 1024",
    );
  });

  it("drops a native table that collides with a defined name and emits an exact ambiguity warning", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const bytes = nativeTablePackage(
      `<?xml version="1.0"?><table xmlns="${TRANSITIONAL_MAIN}" id="1" displayName="sales" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`,
      '<definedNames><definedName name="Sales">Raw!$A$1</definedName></definedNames>',
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
      onWarning: (warning) => warnings.push(warning),
    });

    expect(imported.sheets[0]!.tables).toBeUndefined();
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("Sales");
    expect(warnings.at(-1)?.message).toBe(
      "Excel table sales was dropped because its name conflicts case-insensitively with workbook defined name Sales; the defined name was retained to keep formula resolution unambiguous",
    );
  });
});
