import { beforeAll, describe, expect, it } from "bun:test";
import type { WorkbookSnapshot, XlsxWorkbookWarning } from "@sheetwrite/core";
import { fromXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";
import { registerXlsxBackends } from "../src/index.js";

interface ExternalFixture {
  file: string;
  path: string;
  sha256: string;
  producer: string;
  appVersion: string;
}
interface GoogleExternalFixture {
  file: string;
  sourcePage: string;
  downloadUrl: string;
  contentSha256: string;
  producer: "Google Sheets";
  redistributed: false;
}

interface ExternalManifest {
  commit: string;
  license: { name: string; url: string };
  notice: { url: string; text: string };
  fixtures: ExternalFixture[];
  googleFixtures: GoogleExternalFixture[];
}

const manifest = (await Bun.file(
  new URL("fixtures/external-corpus.json", import.meta.url),
).json()) as ExternalManifest;
const externalDirectory = process.env.SHEETWRITE_EXTERNAL_XLSX_DIR;
const scheduledIt =
  process.env.SHEETWRITE_EXTERNAL_XLSX === "1" || externalDirectory ? it : it.skip;

function populatedCells(snapshot: WorkbookSnapshot) {
  return snapshot.sheets.flatMap((sheet) => sheet.cells.flatMap((block) => block.cells));
}

function warningCounts(warnings: readonly XlsxWorkbookWarning[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const warning of warnings) counts[warning.message] = (counts[warning.message] ?? 0) + 1;
  return counts;
}

function archiveContentSha256(archive: Record<string, Uint8Array>): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of Object.keys(archive).sort()) {
    hasher.update(name);
    hasher.update("\0");
    hasher.update(archive[name]!);
    hasher.update("\0");
  }
  return hasher.digest("hex");
}

async function fixtureBytes(fixture: ExternalFixture | GoogleExternalFixture): Promise<Uint8Array> {
  if (externalDirectory) {
    return new Uint8Array(await Bun.file(`${externalDirectory}/${fixture.file}`).arrayBuffer());
  }
  const url =
    "downloadUrl" in fixture
      ? fixture.downloadUrl
      : `https://raw.githubusercontent.com/apache/poi/${manifest.commit}/${fixture.path}`;
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return new Uint8Array(await response.arrayBuffer());
}

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

describe("scheduled independent Microsoft Excel corpus", () => {
  it("records the pinned Apache POI legal license and NOTICE paths", () => {
    expect(manifest.license).toEqual({
      name: "Apache-2.0",
      url: "https://github.com/apache/poi/blob/913c78891bd0cd20945b050c63abfb8c66c88009/legal/LICENSE",
    });
    expect(manifest.notice.url).toBe(
      "https://github.com/apache/poi/blob/913c78891bd0cd20945b050c63abfb8c66c88009/legal/NOTICE",
    );
    expect(manifest.notice.text).toContain("The Apache Software Foundation");
  });

  for (const fixture of manifest.fixtures) {
    scheduledIt(`imports checksum-locked ${fixture.file}`, async () => {
      const bytes = await fixtureBytes(fixture);
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);

      const archive = unzipSync(bytes);
      const appXml = strFromU8(archive["docProps/app.xml"]!);
      expect(appXml).toContain(`<Application>${fixture.producer}</Application>`);
      expect(appXml).toContain(`<AppVersion>${fixture.appVersion}</AppVersion>`);

      const warnings: XlsxWorkbookWarning[] = [];
      const snapshot = await fromXlsxWorkbook(bytes, {
        onWarning: (warning) => warnings.push(warning),
      });
      const cells = populatedCells(snapshot);

      if (fixture.file === "FormulaSheetRange.xlsx") {
        expect(archive["xl/sharedStrings.xml"]).toBeDefined();
        expect(snapshot.workbook.activeSheet).toBe("test");
        expect(snapshot.sheets.map((sheet) => sheet.name)).toEqual([
          "test",
          "Sheet2",
          "Sheet3",
          "Sheet4",
          "Sheet5",
        ]);
        expect(cells[0]?.value).toEqual({
          kind: "literal",
          value: "POI Formulae Test",
        });
        expect(
          cells.flatMap((cell) => (cell.value.kind === "formula" ? [cell.value.src] : [])),
        ).toEqual(["=SUM(Sheet2:Sheet5!A11)", "=SUM(Sheet2:Sheet5!A12:C12)"]);
        expect(cells.some((cell) => cell.style?.bold === true)).toBe(true);
        expect(warnings).toEqual([]);
      } else if (fixture.file === "DateFormatTests.xlsx") {
        expect(cells.filter((cell) => cell.value.kind === "formula")).toHaveLength(45);
        expect(snapshot.sheets[0]!.frozenRows).toBe(1);
        expect(snapshot.sheets[1]!.frozenRows).toBe(1);
        expect(snapshot.sheets[1]!.columns[2]!.numberFormat).toBe("dd\\-mmm\\-yyyy\\ hh:mm:ss.000");
        expect(cells.some((cell) => cell.style?.italic === true)).toBe(true);
        expect(cells.some((cell) => cell.style?.wrap === true)).toBe(true);
        expect(warnings).toEqual([
          {
            code: "rich-text",
            message: "Phonetic guide text was omitted from the displayed shared string",
            part: "xl/sharedStrings.xml",
          },
        ]);
      } else if (fixture.file === "DataValidations-49244.xlsx") {
        expect(snapshot.sheets[0]!.merges).toHaveLength(3);
        expect(snapshot.sheets[0]!.validationRules).toHaveLength(25);
        expect(
          snapshot.sheets[0]!.validationRules?.find(
            (validation) => validation.condition.kind === "list",
          )?.condition,
        ).toEqual({
          kind: "list",
          values: ["IN", "US", "UK"],
        });
        const comparisonRules = [...snapshot.sheets[0]!.validationRules!]
          .sort((left, right) => left.range.start.row - right.range.start.row)
          .map((validation) => ({
            row: validation.range.start.row,
            condition: validation.condition,
          }));
        expect(comparisonRules).toEqual([
          { row: 1, condition: { kind: "list", values: ["IN", "US", "UK"] } },
          {
            row: 5,
            condition: {
              kind: "number",
              comparison: { operator: "greaterThan", value: 0 },
              integer: true,
            },
          },
          { row: 7, condition: { kind: "number", min: 2, integer: true } },
          {
            row: 9,
            condition: {
              kind: "number",
              comparison: { operator: "lessThan", value: 4 },
              integer: true,
            },
          },
          { row: 10, condition: { kind: "number", max: 6, integer: true } },
          { row: 11, condition: { kind: "number", min: 8, max: 8, integer: true } },
          {
            row: 12,
            condition: {
              kind: "number",
              comparison: { operator: "notEqual", value: 10 },
              integer: true,
            },
          },
          { row: 13, condition: { kind: "number", min: 1, max: 5, integer: true } },
          {
            row: 14,
            condition: {
              kind: "number",
              comparison: { operator: "notBetween", min: 1, max: 5 },
              integer: true,
            },
          },
          {
            row: 18,
            condition: {
              kind: "number",
              comparison: { operator: "greaterThan", value: 0.05 },
            },
          },
          { row: 19, condition: { kind: "number", min: 2.05 } },
          {
            row: 20,
            condition: {
              kind: "number",
              comparison: { operator: "lessThan", value: 4.05 },
            },
          },
          { row: 21, condition: { kind: "number", max: 6.05 } },
          { row: 22, condition: { kind: "number", min: 8.01, max: 8.01 } },
          {
            row: 23,
            condition: {
              kind: "number",
              comparison: { operator: "notEqual", value: 1.01 },
            },
          },
          { row: 24, condition: { kind: "number", min: 1.01, max: 4.99 } },
          {
            row: 25,
            condition: {
              kind: "number",
              comparison: { operator: "notBetween", min: 1.01, max: 4.99 },
            },
          },
          {
            row: 28,
            condition: {
              kind: "textLength",
              comparison: { operator: "greaterThan", value: 0 },
            },
          },
          { row: 29, condition: { kind: "textLength", min: 2 } },
          {
            row: 30,
            condition: {
              kind: "textLength",
              comparison: { operator: "lessThan", value: 4 },
            },
          },
          { row: 31, condition: { kind: "textLength", max: 6 } },
          { row: 32, condition: { kind: "textLength", min: 8, max: 8 } },
          {
            row: 33,
            condition: {
              kind: "textLength",
              comparison: { operator: "notEqual", value: 10 },
            },
          },
          { row: 34, condition: { kind: "textLength", min: 1, max: 5 } },
          {
            row: 35,
            condition: {
              kind: "textLength",
              comparison: { operator: "notBetween", min: 1, max: 5 },
            },
          },
        ]);
        expect(cells.some((cell) => cell.style?.align === "center")).toBe(true);
        expect(warningCounts(warnings)).toEqual({
          "Formula-based Excel validation was dropped": 25,
          "Excel validation type custom was dropped": 1,
          "Excel validation type list was dropped": 1,
          "Distinct Excel validation prompt and error text were reduced to the prompt": 1,
        });
      } else if (fixture.file === "55814.xlsx") {
        expect(snapshot.workbook.activeSheet).toBe("example");
        expect(snapshot.sheets[0]!.notes).toEqual([
          {
            addr: { sheet: "example", row: 0, col: 0 },
            text: "Comment Here\r\n",
          },
        ]);
        expect(warnings).toEqual([
          {
            code: "rich-text",
            message: "Comment rich text formatting was flattened",
            part: "xl/comments1.xml",
            cell: "A1",
          },
        ]);
      } else {
        expect(snapshot.workbook.namedRanges).toEqual([
          {
            name: "NonTable",
            range: {
              sheet: "exceltable",
              start: { row: 0, col: 0 },
              end: { row: 3, col: 2 },
            },
          },
        ]);
        expect(warningCounts(warnings)).toEqual({
          "Unsupported worksheet relationship table was dropped": 1,
          "Defined name TableAsRangeName was not a single rectangular range": 1,
        });
      }
    });
  }
});

describe("scheduled independent Google Sheets corpus", () => {
  for (const fixture of manifest.googleFixtures) {
    scheduledIt(`imports checksum-locked ${fixture.file}`, async () => {
      expect(fixture.sourcePage).toContain("highviewapps.com");
      expect(fixture.downloadUrl).toContain("docs.google.com/spreadsheets/");
      expect(fixture.producer).toBe("Google Sheets");
      expect(fixture.redistributed).toBe(false);

      const bytes = await fixtureBytes(fixture);
      const archive = unzipSync(bytes);
      expect(archiveContentSha256(archive)).toBe(fixture.contentSha256);
      expect(archive["xl/sharedStrings.xml"]).toBeDefined();

      const warnings: XlsxWorkbookWarning[] = [];
      const snapshot = await fromXlsxWorkbook(bytes, {
        onWarning: (warning) => warnings.push(warning),
      });
      const cells = populatedCells(snapshot);
      const formulas = cells.flatMap((cell) =>
        cell.value.kind === "formula" ? [cell.value.src] : [],
      );

      expect(snapshot.workbook.activeSheet).toBe("dashboard");
      expect(snapshot.sheets.map((sheet) => sheet.name)).toEqual([
        "Dashboard",
        "Sheet12",
        "Todays Orders",
        "Unfulfilled Orders",
        "Refunds",
        "Customer LTV",
        "Inventory",
        "VIP Customers",
        "Costs",
        "Dtypes Test",
      ]);
      expect(cells).toHaveLength(3_202);
      expect(cells.filter((cell) => cell.style !== undefined)).toHaveLength(3_202);
      expect(formulas).toHaveLength(230);
      expect(formulas[0]).toBe('=COUNTIF(Inventory!F2:F1000, "<=0")');
      expect(snapshot.sheets.find((sheet) => sheet.name === "Inventory")?.frozenRows).toBe(1);
      expect(warningCounts(warnings)).toEqual({
        "Reserved Excel fill 1 had pattern lightGray; it was treated as gray125": 1,
        "Unsupported worksheet relationship drawing was dropped": 10,
      });
    });
  }
});
