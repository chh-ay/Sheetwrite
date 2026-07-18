import { describe, expect, it } from "bun:test";
import {
  type DataValidationComparison,
  dateToSerial,
  type WorkbookSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";

const FIXED_ZIP_TIME = new Date(1980, 0, 1);
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const TRANSITIONAL_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const STRICT_MAIN = "http://purl.oclc.org/ooxml/spreadsheetml/main";
const TRANSITIONAL_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const STRICT_REL = "http://purl.oclc.org/ooxml/officeDocument/relationships";

interface RawOptions {
  strict?: boolean;
  workbookPr?: string;
  styles?: string;
  theme?: string;
  workbookExtra?: string;
  workbookRelationships?: string;
  sheetName?: string;
}

function rawWorkbook(sheetXml: string, options: RawOptions = {}): Uint8Array {
  const main = options.strict ? STRICT_MAIN : TRANSITIONAL_MAIN;
  const rel = options.strict ? STRICT_REL : TRANSITIONAL_REL;
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    ...(options.styles
      ? [
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        ]
      : []),
    ...(options.theme
      ? [
          '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
        ]
      : []),
  ];
  const workbookRelationships = [
    `<Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>`,
    ...(options.styles
      ? [`<Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/>`]
      : []),
    ...(options.theme
      ? [`<Relationship Id="rId3" Type="${rel}/theme" Target="theme/theme1.xml"/>`]
      : []),
    options.workbookRelationships ?? "",
  ].join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook xmlns="${main}" xmlns:r="${rel}">${options.workbookPr ?? ""}<sheets><sheet name="${options.sheetName ?? "Raw"}" sheetId="1" r:id="rId1"/></sheets>${options.workbookExtra ?? ""}</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}">${workbookRelationships}</Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  };
  if (options.styles) files["xl/styles.xml"] = strToU8(options.styles);
  if (options.theme) files["xl/theme/theme1.xml"] = strToU8(options.theme);
  return zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME });
}

function sheet(body: string, strict = false): string {
  return `<?xml version="1.0"?><worksheet xmlns="${strict ? STRICT_MAIN : TRANSITIONAL_MAIN}">${body}</worksheet>`;
}

function oneColumnSnapshot(overrides: Partial<WorkbookSnapshot> = {}): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Sheet1",
        order: 0,
        rowCount: 2,
        columns: [{ key: "a", header: "A", width: 80, type: "number" }],
        cells: [],
      },
    ],
    ...overrides,
  };
}

describe("raw spec-authored OOXML fidelity", () => {
  it("accepts Strict namespaces and relationship types", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Strict</t></is></c></row></sheetData>',
          true,
        ),
        { strict: true },
      ),
    );
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: "Strict",
    });
  });

  it("uses a shared master despite wrong slave text and infers 28 omitted references", async () => {
    const cells = Array.from({ length: 28 }, (_, col) =>
      col === 0
        ? '<c><f t="shared" si="0" ref="A1:AB1">\'Q1\'!A1&amp;"A1"</f></c>'
        : col === 1
          ? '<c><f t="shared" si="0">WRONG1</f></c>'
          : '<c><f t="shared" si="0"/></c>',
    ).join("");
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(`<dimension ref="A1:AB1"/><sheetData><row r="1">${cells}</row></sheetData>`),
      ),
    );
    const values = imported.sheets[0]!.cells[0]!.cells.map((cell) => cell.value);
    expect(values).toHaveLength(28);
    expect(values[1]).toEqual({ kind: "formula", src: "='Q1'!B1&\"A1\"" });
    expect(values[26]).toEqual({ kind: "formula", src: "='Q1'!AA1&\"A1\"" });
    expect(values[27]).toEqual({ kind: "formula", src: "='Q1'!AB1&\"A1\"" });
  });

  it("neutralizes external formulas and external-link workbook graphs", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<dimension ref="A1"/><sheetData><row r="1"><c r="A1"><f>\'[1]Data\'!A1</f></c></row></sheetData>',
        ),
        {
          workbookRelationships: `<Relationship Id="rId9" Type="${TRANSITIONAL_REL}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
        },
      ),
      { onWarning: (warning) => warnings.push(warning) },
    );
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: "='[1]Data'!A1",
    });
    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["external-relationship", "external-formula"]),
    );
  });

  it("neutralizes external formulas during export", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const source = oneColumnSnapshot();
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
            value: { kind: "formula", src: "='[1]Data'!A1" },
          },
        ],
      },
    ];

    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source, {
      onWarning: (warning) => warnings.push(warning),
    });
    const worksheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain(
      '<c r="A1" t="inlineStr"><is><t xml:space="preserve">=&apos;[1]Data&apos;!A1</t></is></c>',
    );
    expect(worksheet).not.toContain("<f>");
    expect(warnings).toContainEqual({
      code: "external-formula",
      message: "External-data formula was neutralized as inert text on export",
      sheet: "Sheet1",
      cell: "A1",
    });
  });

  it("converts date1904 serials, preserves serial 60, and parses t=d as UTC wall time", async () => {
    const styles = `<?xml version="1.0"?><styleSheet xmlns="${TRANSITIONAL_MAIN}"><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`;
    const body =
      '<dimension ref="A1:C1"/><sheetData><row r="1"><c r="A1" s="0"><v>0</v></c><c r="B1" s="0"><v>60</v></c><c r="C1" t="d"><v>2020-01-02T03:04:05</v></c></row></sheetData>';
    const mac = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(sheet(body), { workbookPr: '<workbookPr date1904="1"/>', styles }),
    );
    expect(mac.sheets[0]!.cells[0]!.cells.map((cell) => cell.value)).toEqual([
      { kind: "literal", value: 1462 },
      { kind: "literal", value: 1522 },
      { kind: "literal", value: dateToSerial(new Date(Date.UTC(2020, 0, 2, 3, 4, 5))) },
    ]);
    const excel = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(sheet(body), { styles }),
    );
    expect(excel.sheets[0]!.cells[0]!.cells[1]!.value).toEqual({ kind: "literal", value: 60 });
  });

  it("maps validation defaults, policies, whole semantics, and multiple ranges without broadening", async () => {
    const long = "x".repeat(256);
    const xml = sheet(
      `<dimension ref="A1:D2"/><sheetData/><dataValidations count="4"><dataValidation type="whole" operator="between" sqref="A1 A2"><formula1>1</formula1><formula2>3</formula2></dataValidation><dataValidation type="decimal" operator="equal" showErrorMessage="1" errorStyle="stop" sqref="B1"><formula1>2</formula1></dataValidation><dataValidation type="decimal" operator="between" showErrorMessage="1" errorStyle="warning" sqref="C1"><formula1>0</formula1><formula2>1</formula2></dataValidation><dataValidation type="decimal" operator="between" showErrorMessage="1" errorStyle="information" prompt="${long}" sqref="D1"><formula1>0</formula1><formula2>1</formula2></dataValidation></dataValidations>`,
    );
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(rawWorkbook(xml), {
      onWarning: (warning) => warnings.push(warning),
    });
    const rules = imported.sheets[0]!.validationRules!;
    expect(rules).toHaveLength(5);
    expect(rules[0]).toMatchObject({
      condition: { kind: "number", min: 1, max: 3, integer: true },
      policy: "allow",
      allowBlank: false,
    });
    expect(rules.map((rule) => rule.policy)).toEqual(["allow", "allow", "reject", "warn", "warn"]);
    expect(rules.at(-1)?.helpText).toBeUndefined();
    expect(warnings).toContainEqual(expect.objectContaining({ code: "validation-loss" }));
  });

  it("omits oversized validation help text during export", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const source = oneColumnSnapshot();
    source.sheets[0]!.validationRules = [
      {
        id: "bounded-help",
        range: {
          sheet: "s",
          start: { row: 0, col: 0 },
          end: { row: 1, col: 0 },
        },
        condition: { kind: "list", values: ["Open", "Closed"] },
        policy: "reject",
        helpText: "x".repeat(256),
      },
    ];

    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source, {
      onWarning: (warning) => warnings.push(warning),
    });
    const worksheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain('<dataValidation type="list"');
    expect(worksheet).toContain("<formula1>&quot;Open,Closed&quot;</formula1>");
    expect(worksheet).not.toContain("prompt=");
    expect(warnings).toContainEqual({
      code: "validation-loss",
      message:
        'Validation rule "bounded-help" prompt/error exceeded 255 characters and was omitted from native XLSX',
      sheet: "Sheet1",
    });
  });

  it("maps every native validation comparison operator without broadening", async () => {
    const comparisons: DataValidationComparison[] = [
      { operator: "between", min: 2, max: 4 },
      { operator: "notBetween", min: 2, max: 4 },
      { operator: "equal", value: 2 },
      { operator: "notEqual", value: 2 },
      { operator: "greaterThan", value: 2 },
      { operator: "lessThan", value: 2 },
      { operator: "greaterThanOrEqual", value: 2 },
      { operator: "lessThanOrEqual", value: 2 },
    ];
    const nativeTypes = ["whole", "decimal", "date", "textLength"] as const;
    const nativeRules = nativeTypes.flatMap((type) =>
      comparisons.map((comparison) => {
        const formulas =
          "value" in comparison
            ? `<formula1>${comparison.value}</formula1>`
            : `<formula1>${comparison.min}</formula1><formula2>${comparison.max}</formula2>`;
        return `<dataValidation type="${type}" operator="${comparison.operator}" showErrorMessage="1" sqref="A1">${formulas}</dataValidation>`;
      }),
    );
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          `<dimension ref="A1"/><sheetData/><dataValidations count="${nativeRules.length}">${nativeRules.join("")}</dataValidations>`,
        ),
      ),
      { onWarning: (warning) => warnings.push(warning) },
    );
    expect(warnings).toEqual([]);
    const rules = imported.sheets[0]!.validationRules!;
    expect(rules).toHaveLength(nativeRules.length);
    const expectedConditions = nativeTypes.flatMap((type) =>
      comparisons.map((comparison) => {
        const kindFields =
          type === "whole"
            ? { kind: "number", integer: true }
            : type === "decimal"
              ? { kind: "number" }
              : { kind: type };
        if (comparison.operator === "between") return { ...kindFields, min: 2, max: 4 };
        if (comparison.operator === "equal") return { ...kindFields, min: 2, max: 2 };
        if (comparison.operator === "greaterThanOrEqual") return { ...kindFields, min: 2 };
        if (comparison.operator === "lessThanOrEqual") return { ...kindFields, max: 2 };
        return { ...kindFields, comparison };
      }),
    );
    expect(rules.map((rule) => rule.condition)).toEqual(expect.arrayContaining(expectedConditions));

    const source = oneColumnSnapshot();
    source.sheets[0]!.validationRules = comparisons.map((comparison, index) => ({
      id: `comparison-${index}`,
      range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      condition: { kind: "number", comparison },
      policy: "reject",
    }));
    const exported = await sheetwriteWorkbookBackend.toXlsxWorkbook(source);
    const parts = unzipSync(exported);
    const worksheet = strFromU8(parts["xl/worksheets/sheet1.xml"]!);
    expect(worksheet).toContain(`<dataValidations count="${comparisons.length}">`);
    for (const comparison of comparisons) {
      expect(worksheet).toContain(`operator="${comparison.operator}"`);
    }
    const roundTripped = await sheetwriteWorkbookBackend.fromXlsxWorkbook(exported);
    expect(roundTripped.sheets[0]!.validationRules?.map((rule) => rule.condition)).toEqual(
      expect.arrayContaining(
        comparisons
          .filter(
            (comparison) =>
              comparison.operator === "notBetween" ||
              comparison.operator === "notEqual" ||
              comparison.operator === "greaterThan" ||
              comparison.operator === "lessThan",
          )
          .map((comparison) => ({ kind: "number", comparison })),
      ),
    );
  });

  it("resolves theme tint and indexed colors for font, solid fill, and border zero", async () => {
    const theme = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Raw"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>`;
    const styles = `<?xml version="1.0"?><styleSheet xmlns="${TRANSITIONAL_MAIN}"><fonts count="1"><font><color theme="1"/><sz val="12"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.4"/></patternFill></fill></fills><borders count="1"><border><left style="thin"><color indexed="2"/></left></border></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="2" borderId="0"/></cellXfs></styleSheet>`;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" s="0"><v>1</v></c></row></sheetData>',
        ),
        { styles, theme },
      ),
    );
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.style).toMatchObject({
      color: "#000000",
      backgroundColor: "#8EA9DB",
      fontSize: 16,
      border: { left: { color: "#FF0000", width: 1, style: "solid" } },
    });
  });

  it("writes valid one-axis panes, scoped names, hidden state, whole validation, and no calcId", async () => {
    const source: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: {
        activeSheet: "rows",
        namedRanges: [
          {
            name: "Local",
            scope: "cols",
            range: { sheet: "cols", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
          },
        ],
      },
      sheets: [
        { ...oneColumnSnapshot().sheets[0]!, id: "rows", name: "Rows", frozenRows: 1 },
        { ...oneColumnSnapshot().sheets[0]!, id: "cols", name: "Cols", order: 1, frozenCols: 1 },
        {
          ...oneColumnSnapshot().sheets[0]!,
          id: "both",
          name: "Both",
          order: 2,
          frozenRows: 1,
          frozenCols: 1,
          visibility: "veryHidden",
        },
      ],
    };
    source.sheets[0]!.validationRules = [
      {
        id: "whole",
        range: { sheet: "rows", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
        condition: { kind: "number", min: 1, max: 2, integer: true },
        policy: "warn",
      },
    ];
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(source));
    expect(strFromU8(parts["xl/worksheets/sheet1.xml"]!)).toContain('activePane="bottomLeft"');
    expect(strFromU8(parts["xl/worksheets/sheet2.xml"]!)).toContain('activePane="topRight"');
    expect(strFromU8(parts["xl/worksheets/sheet3.xml"]!)).toContain('activePane="bottomRight"');
    expect(strFromU8(parts["xl/worksheets/sheet1.xml"]!)).toContain('type="whole"');
    expect(strFromU8(parts["xl/worksheets/sheet1.xml"]!)).toContain('errorStyle="warning"');
    const workbook = strFromU8(parts["xl/workbook.xml"]!);
    expect(workbook).toContain('localSheetId="1"');
    expect(workbook).toContain('name="Both" sheetId="3" state="veryHidden"');
    expect(workbook).not.toContain("calcId=");
  });

  it("accepts sparse far dimensions under codec rather than dense-store limits", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<dimension ref="A1:XFD1048576"/><sheetData><row r="1048576"><c r="XFD1048576"><v>7</v></c></row></sheetData>',
        ),
      ),
      { maxCells: 1 },
    );
    expect(imported.sheets[0]).toMatchObject({ rowCount: 1_048_576 });
    expect(imported.sheets[0]!.columns).toHaveLength(16_384);
    expect(imported.sheets[0]!.cells[0]!.cells[0]).toMatchObject({
      rowOffset: 1_048_575,
      colOffset: 16_383,
      value: { kind: "literal", value: 7 },
    });
  });

  it("uses ASCII-insensitive and percent-decoded Unicode logical part lookup", async () => {
    const base = unzipSync(rawWorkbook(sheet('<dimension ref="A1"/><sheetData/>')));
    const workbook = base["xl/workbook.xml"]!;
    const workbookRels = base["xl/_rels/workbook.xml.rels"]!;
    const worksheet = base["xl/worksheets/sheet1.xml"]!;
    delete base["xl/workbook.xml"];
    delete base["xl/_rels/workbook.xml.rels"];
    delete base["xl/worksheets/sheet1.xml"];
    base["XL/WORK%20BOOK.xml"] = workbook;
    base["XL/_rels/WORK%20BOOK.xml.rels"] = strToU8(
      strFromU8(workbookRels).replace("worksheets/sheet1.xml", "Worksheets/%E6%95%B0%E6%8D%AE.xml"),
    );
    base["XL/Worksheets/%E6%95%B0%E6%8D%AE.xml"] = worksheet;
    base["_rels/.rels"] = strToU8(
      strFromU8(base["_rels/.rels"]!).replace("xl/workbook.xml", "xl/work%20book.xml"),
    );
    base["[Content_Types].xml"] = strToU8(
      strFromU8(base["[Content_Types].xml"]!)
        .replace("/xl/workbook.xml", "/XL/WORK%20BOOK.xml")
        .replace("/xl/worksheets/sheet1.xml", "/XL/Worksheets/%E6%95%B0%E6%8D%AE.xml"),
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      zipSync(base, { level: 6, mtime: FIXED_ZIP_TIME }),
    );
    expect(imported.sheets[0]!.name).toBe("Raw");
  });

  it("uses the last sheetView and handles frozenSplit as frozen on each populated axis", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<sheetViews><sheetView workbookViewId="0"><pane state="frozen" xSplit="9" ySplit="9"/></sheetView><sheetView workbookViewId="1"><pane state="frozenSplit" xSplit="2" activePane="topRight"/></sheetView></sheetViews><dimension ref="A1:C1"/><sheetData/>',
        ),
      ),
    );
    expect(imported.sheets[0]).toMatchObject({ frozenCols: 2 });
    expect(imported.sheets[0]!.frozenRows).toBeUndefined();
  });

  it("decodes built-in number formats 11-13 and 45-48", async () => {
    const ids = [11, 12, 13, 45, 46, 47, 48];
    const xfs = ids
      .map(
        (id) => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`,
      )
      .join("");
    const styles = `<?xml version="1.0"?><styleSheet xmlns="${TRANSITIONAL_MAIN}"><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="${ids.length}">${xfs}</cellXfs></styleSheet>`;
    const cells = ids
      .map((_, col) => `<c r="${String.fromCharCode(65 + col)}1" s="${col}"><v>1</v></c>`)
      .join("");
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(`<dimension ref="A1:G1"/><sheetData><row r="1">${cells}</row></sheetData>`),
        { styles },
      ),
    );
    expect(imported.sheets[0]!.columns.map((column) => column.numberFormat)).toEqual([
      "0.00E+00",
      "# ?/?",
      "# ??/??",
      "mm:ss",
      "[h]:mm:ss",
      "mmss.0",
      "##0.0E+0",
    ]);
  });

  it("maps row outlines, point row heights, and default column styles", async () => {
    const styles = `<?xml version="1.0"?><styleSheet xmlns="${TRANSITIONAL_MAIN}"><fonts count="1"><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<dimension ref="A1:A2"/><cols><col min="1" max="1" style="0" width="12"/></cols><sheetData><row r="1" outlineLevel="1" ht="18" customHeight="1"><c r="A1"><v>1</v></c></row><row r="2" outlineLevel="1" collapsed="1"/></sheetData>',
        ),
        { styles },
      ),
    );
    expect(imported.sheets[0]!.columns[0]!.cellStyle).toMatchObject({ bold: true });
    expect(imported.sheets[0]!.rowMeta).toContainEqual([0, { height: 24 }]);
    expect(imported.sheets[0]!.rowGroups).toEqual([{ start: 0, end: 1, collapsed: true }]);
  });

  it("escapes SpreadsheetML control tokens without confusing literal escape text", async () => {
    const literal = "\u0001_x0041_😀";
    const source = oneColumnSnapshot();
    source.sheets[0]!.columns[0]!.type = "text";
    source.sheets[0]!.cells = [
      {
        startRow: 0,
        startCol: 0,
        rowCount: 1,
        colCount: 1,
        cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: literal } }],
      },
    ];
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source);
    const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]!);
    expect(xml).toContain("_x0001__x005F_x0041_😀");
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "literal",
      value: literal,
    });
  });

  it("imports supported cellIs, contains, expression, blank, and differential-style rules", async () => {
    const styles = `<?xml version="1.0"?><styleSheet xmlns="${TRANSITIONAL_MAIN}"><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs><dxfs count="1"><dxf><font><b/><color indexed="2"/><sz val="12"/></font><fill><patternFill><bgColor rgb="FFCCDDFF"/></patternFill></fill><border><left style="dashed"><color rgb="FF112233"/></left></border><alignment horizontal="center" wrapText="1"/></dxf></dxfs></styleSheet>`;
    const rules = [
      '<cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>5</formula></cfRule>',
      '<cfRule type="cellIs" dxfId="0" priority="2" operator="lessThan"><formula>2</formula></cfRule>',
      '<cfRule type="cellIs" dxfId="0" priority="3" operator="equal"><formula>"yes"</formula></cfRule>',
      '<cfRule type="containsText" dxfId="0" priority="4" text="needle"/>',
      '<cfRule type="expression" dxfId="0" priority="5"><formula>ISNUMBER(FIND("Case",A1))</formula></cfRule>',
      '<cfRule type="containsBlanks" dxfId="0" priority="6"><formula>LEN(TRIM(A1))=0</formula></cfRule>',
    ].join("");
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          `<dimension ref="A1:A2"/><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="2"/></sheetData><conditionalFormatting sqref="A1:A2">${rules}</conditionalFormatting>`,
        ),
        { styles },
      ),
    );
    expect(imported.sheets[0]!.conditionalFormats?.map((rule) => rule.when)).toEqual([
      { kind: "greaterThan", value: 5 },
      { kind: "lessThan", value: 2 },
      { kind: "equal", value: "yes" },
      { kind: "contains", text: "needle" },
      { kind: "contains", text: "Case", matchCase: true },
      { kind: "equal", value: null },
    ]);
    expect(imported.sheets[0]!.conditionalFormats?.[0]?.style).toMatchObject({
      bold: true,
      color: "#FF0000",
      fontSize: 16,
      backgroundColor: "#CCDDFF",
      align: "center",
      wrap: true,
      border: { left: { color: "#112233", width: 1, style: "dashed" } },
    });
  });

  it("writes every canonical conditional predicate and direct whole-sheet sort state natively", async () => {
    const source = oneColumnSnapshot();
    const range = {
      sheet: "s",
      start: { row: 0, col: 0 },
      end: { row: 1, col: 0 },
    };
    const style = {
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      border: { all: { color: "#334455", width: 2, style: "dotted" as const } },
      align: "right" as const,
      wrap: true,
    };
    source.sheets[0]!.conditionalFormats = [
      { range, when: { kind: "greaterThan", value: 4 }, style },
      { range, when: { kind: "lessThan", value: 9 }, style },
      { range, when: { kind: "equal", value: true }, style },
      { range, when: { kind: "equal", value: null }, style },
      { range, when: { kind: "contains", text: "fold" }, style },
      { range, when: { kind: "contains", text: "Case", matchCase: true }, style },
    ];
    source.sheets[0]!.sortKeys = [{ col: 0, ascending: false }];
    const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source);
    const parts = unzipSync(bytes);
    const worksheet = strFromU8(parts["xl/worksheets/sheet1.xml"]!);
    const stylesXml = strFromU8(parts["xl/styles.xml"]!);
    expect(worksheet).toContain('type="cellIs"');
    expect(worksheet).toContain('type="containsBlanks"');
    expect(worksheet).toContain('type="containsText"');
    expect(worksheet).toContain('type="expression"');
    expect(worksheet).toContain('<sortState ref="A1:A2">');
    expect(stylesXml).toContain('<dxfs count="1">');
    expect(stylesXml).toContain('<patternFill><bgColor rgb="FFDDEEFF"/></patternFill>');
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.sheets[0]!.conditionalFormats).toEqual(source.sheets[0]!.conditionalFormats);
    expect(imported.sheets[0]!.sortKeys).toEqual(source.sheets[0]!.sortKeys);
    parts["xl/worksheets/sheet1.xml"] = strToU8(
      worksheet.replace("<formula>4</formula>", "<formula>6</formula>"),
    );
    parts["xl/styles.xml"] = strToU8(stylesXml.replace("FFDDEEFF", "FFABCDEF"));
    const externallyEdited = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      zipSync(parts, { level: 6, mtime: FIXED_ZIP_TIME }),
    );
    expect(externallyEdited.sheets[0]!.conditionalFormats?.[0]).toMatchObject({
      when: { kind: "greaterThan", value: 6 },
      style: { backgroundColor: "#ABCDEF" },
    });
  });

  it("warns rather than changing header-filter or authorization semantics", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawWorkbook(
        sheet(
          '<dimension ref="A1:A2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Header</t></is></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData><sheetProtection sheet="1"/><autoFilter ref="A1:A2"><filterColumn colId="0"><filters><filter val="1"/></filters></filterColumn></autoFilter><sortState ref="A1:A2"><sortCondition ref="A1:A2" descending="1"/></sortState>',
        ),
      ),
      { onWarning: (warning) => warnings.push(warning) },
    );
    expect(imported.sheets[0]!.filters).toBeUndefined();
    expect(imported.sheets[0]!.protectedRanges).toBeUndefined();
    expect(imported.sheets[0]!.sortKeys).toEqual([{ col: 0, ascending: false }]);
    expect(warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("excludes its header row"),
        expect.stringContaining("host authorization callbacks"),
      ]),
    );
  });

  it("rejects percent-decoded logical-name collisions and traversal", async () => {
    const files = unzipSync(rawWorkbook(sheet('<dimension ref="A1"/><sheetData/>')));
    files["XL/%77orkbook.xml"] = files["xl/workbook.xml"]!;
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME }),
      ),
    ).rejects.toThrow(/duplicate logical part name/i);

    const traversal = unzipSync(rawWorkbook(sheet('<dimension ref="A1"/><sheetData/>')));
    traversal["xl/%2e%2e/evil.xml"] = strToU8("<evil/>");
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        zipSync(traversal, { level: 6, mtime: FIXED_ZIP_TIME }),
      ),
    ).rejects.toThrow(/unsafe part name/i);
  });
});
