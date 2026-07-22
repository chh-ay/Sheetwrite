import { describe, expect, it } from "bun:test";
import {
  dateToSerial,
  type WorkbookSnapshot,
  SheetwriteError,
  XlsxResourceError,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import {
  BASE_STYLES_BODY,
  FIXED_ZIP_TIME,
  PACKAGE_REL,
  rawXlsx,
  rawZip,
  STRICT_MAIN,
  STRICT_REL,
  stylesXml,
  TRANSITIONAL_MAIN,
  TRANSITIONAL_REL,
  worksheet,
} from "./raw-opc.js";

function rowValues(snapshot: WorkbookSnapshot, sheet = 0): unknown[] {
  return snapshot.sheets[sheet]!.cells.flatMap((block) => block.cells)
    .sort((left, right) => left.rowOffset - right.rowOffset || left.colOffset - right.colOffset)
    .map((cell) => cell.value);
}

function warningsFor(): {
  warnings: XlsxWorkbookWarning[];
  onWarning: (warning: XlsxWorkbookWarning) => void;
} {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning) => warnings.push(warning) };
}

function minimalSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Sheet1",
        order: 0,
        rowCount: 1,
        columns: [{ key: "a", header: "A", width: 80, type: "text" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "x" } }],
          },
        ],
      },
    ],
  };
}

describe("pinned external XLSX behavioral vectors", () => {
  it("ports cases 1-9: preserves typed, inline, shared, rich, phonetic, and whitespace values", async () => {
    const styles = stylesXml(
      '<fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/></cellXfs>',
    );
    const sharedStrings = `<?xml version="1.0"?><sst xmlns="${TRANSITIONAL_MAIN}" count="4" uniqueCount="4"><si><r><rPr><b/></rPr><t>Bold,</t></r><r><rPr><i/></rPr><t>text</t></r></si><si><t>Hello, World!</t><rPh sb="0" eb="5"><t>phonetic</t></rPh></si><si><t>漢字</t><rPh sb="0" eb="2"><t>かんじ</t></rPh></si><si><t xml:space="preserve">Hello,\nWorld!</t></si></sst>`;
    const body =
      '<dimension ref="A1:I1"/><sheetData><row r="1">' +
      '<c r="A1" t="e"><v>#N/A</v></c>' +
      '<c r="B1" t="str"><v>6E1000</v></c>' +
      '<c r="C1" s="1"/>' +
      '<c r="D1" t="inlineStr"><is><t>Foo</t></is></c>' +
      '<c r="E1" t="inlineStr"><is><r><rPr><color rgb="FFFF0000"/></rPr><t>red</t></r><r><rPr><color rgb="FF00FF00"/></rPr><t>green</t></r></is></c>' +
      '<c r="F1" t="s"><v>0</v></c><c r="G1" t="s"><v>1</v></c>' +
      '<c r="H1" t="s"><v>2</v></c><c r="I1" t="s"><v>3</v></c>' +
      "</row></sheetData>";
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({ sheets: [{ xml: worksheet(body) }], styles, sharedStrings }),
      { onWarning: capture.onWarning },
    );

    expect(rowValues(imported)).toEqual([
      { kind: "literal", value: "#N/A" },
      { kind: "literal", value: "6E1000" },
      { kind: "literal", value: null },
      { kind: "literal", value: "Foo" },
      { kind: "literal", value: "redgreen" },
      { kind: "literal", value: "Bold,text" },
      { kind: "literal", value: "Hello, World!" },
      { kind: "literal", value: "漢字" },
      { kind: "literal", value: "Hello,\nWorld!" },
    ]);
    expect(imported.sheets[0]!.cells[0]!.cells[2]!.style).toEqual({ bold: true });
    expect(capture.warnings).toEqual([
      expect.objectContaining({ code: "rich-text", part: "xl/sharedStrings.xml" }),
      expect.objectContaining({
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed shared string",
      }),
      expect.objectContaining({ code: "unsupported-cell-value", sheet: "Raw1", cell: "A1" }),
      expect.objectContaining({ code: "rich-text", sheet: "Raw1", cell: "E1" }),
    ]);
  });

  it("ports cases 11 and 13: preserves the 1900 boundary and converts ISO offsets and fractions", async () => {
    const serials = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:D1"/><sheetData><row r="1"><c r="A1"><v>59</v></c><c r="B1"><v>60</v></c><c r="C1"><v>60.5</v></c><c r="D1"><v>61</v></c></row></sheetData>',
            ),
          },
        ],
      }),
    );
    expect(rowValues(serials)).toEqual(
      [59, 60, 60.5, 61].map((value) => ({ kind: "literal", value })),
    );

    const iso = [
      "2020-01-02T03:04:05Z",
      "2020-01-02T03:04:05.125Z",
      "2020-01-02T03:04:05+02:30",
      "2020-01-02T03:04:05.5-04:00",
    ];
    const dates = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              `<dimension ref="A1:D1"/><sheetData><row r="1">${iso
                .map(
                  (value, index) =>
                    `<c r="${String.fromCharCode(65 + index)}1" t="d"><v>${value}</v></c>`,
                )
                .join("")}</row></sheetData>`,
            ),
          },
        ],
      }),
    );
    expect(rowValues(dates)).toEqual(
      iso.map((value) => ({ kind: "literal", value: dateToSerial(new Date(value)) })),
    );
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sheets: [
            {
              xml: worksheet(
                '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="d"><v>2020-99-99T25:61:00Z</v></c></row></sheetData>',
              ),
            },
          ],
        }),
      ),
    ).rejects.toThrow("date value at A1 is invalid");
  });

  it("ports case 14: translates all nine relative and absolute shared-formula vectors", async () => {
    const vectors = [
      ["A1+1", "A2", "A3", "A2+1"],
      ["A1+1", "A2", "B2", "B1+1"],
      ["SUM(A1:A10)", "A11", "B11", "SUM(B1:B10)"],
      ["$A$1+A1", "A2", "A3", "$A$1+A2"],
      ["$A$1+A1", "A2", "B2", "$A$1+B1"],
      ["$A1+A1", "A2", "A3", "$A2+A2"],
      ["$A1+A1", "A2", "B2", "$A1+B1"],
      ["A$1+A1", "A2", "A3", "A$1+A2"],
      ["A$1+A1", "A2", "B2", "B$1+B1"],
    ] as const;
    for (const [formula, master, slave, expected] of vectors) {
      const masterRow = Number(/\d+$/.exec(master)![0]);
      const slaveRow = Number(/\d+$/.exec(slave)![0]);
      const masterCell = `<c r="${master}"><f t="shared" si="0" ref="${master}:${slave}">${formula}</f></c>`;
      const slaveCell = `<c r="${slave}"><f t="shared" si="0"/></c>`;
      const rows =
        masterRow === slaveRow
          ? `<row r="${masterRow}">${masterCell}${slaveCell}</row>`
          : `<row r="${Math.min(masterRow, slaveRow)}">${masterRow < slaveRow ? masterCell : slaveCell}</row><row r="${Math.max(masterRow, slaveRow)}">${masterRow > slaveRow ? masterCell : slaveCell}</row>`;
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({ sheets: [{ xml: worksheet(`<sheetData>${rows}</sheetData>`) }] }),
      );
      expect(rowValues(imported).at(-1)).toEqual({ kind: "formula", src: `=${expected}` });
    }
  });

  it("ports case 15: neutralizes array and data-table formulas with exact warnings", async () => {
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:B1"/><sheetData><row r="1"><c r="A1"><f t="array" ref="A1:B1">A2</f></c><c r="B1"><f t="dataTable" ref="B1:B2">B2</f></c></row></sheetData>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(rowValues(imported)).toEqual([
      { kind: "literal", value: "=A2" },
      { kind: "literal", value: "=B2" },
    ]);
    expect(capture.warnings).toEqual([
      expect.objectContaining({ code: "unsupported-feature", cell: "A1" }),
      expect.objectContaining({ code: "unsupported-feature", cell: "B1" }),
    ]);
  });

  it("ports cases 16-17: maps false font flags and warns on double-underline precision loss", async () => {
    const styles = stylesXml(
      '<fonts count="4"><font><b val="0"/><i/><strike/><u val="none"/></font><font><u/></font><font><u val="double"/></font><font><u val="false"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0"/></cellXfs>',
    );
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:D1"/><sheetData><row r="1"><c r="A1" s="0"><v>1</v></c><c r="B1" s="1"><v>2</v></c><c r="C1" s="2"><v>3</v></c><c r="D1" s="3"><v>4</v></c></row></sheetData>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.cells[0]!.cells.map((cell) => cell.style)).toEqual([
      { italic: true, strikethrough: true },
      { underline: true },
      { underline: true },
      undefined,
    ]);
    expect(capture.warnings).toContainEqual(
      expect.objectContaining({ code: "format-loss", message: expect.stringContaining("double") }),
    );
  });

  it("ports cases 19-20: maps four borders and warns for diagonal, patterned, and gradient loss", async () => {
    const styles = stylesXml(
      '<fonts count="1"><font/></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="darkVertical"><fgColor rgb="FFFF0000"/></patternFill></fill><fill><gradientFill type="linear"><stop position="0"><color rgb="FFFF0000"/></stop></gradientFill></fill></fills><borders count="2"><border/><border diagonalUp="1" diagonalDown="1"><left style="thin"><color rgb="FFFF0000"/></left><right style="thin"><color rgb="FFFF0000"/></right><top style="thin"><color rgb="FFFF0000"/></top><bottom style="thin"><color rgb="FFFF0000"/></bottom><diagonal style="thin"><color rgb="FF000000"/></diagonal></border></borders><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="2" borderId="0"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1"/></cellXfs>',
    );
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:D1"/><sheetData><row r="1"><c r="A1" s="0"><v>1</v></c><c r="B1" s="1"><v>2</v></c><c r="C1" s="2"><v>3</v></c><c r="D1" s="3"><v>4</v></c></row></sheetData>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.style).toBeUndefined();
    expect(imported.sheets[0]!.cells[0]!.cells[3]!.style?.border).toEqual({
      top: { color: "#FF0000", width: 1, style: "solid" },
      right: { color: "#FF0000", width: 1, style: "solid" },
      bottom: { color: "#FF0000", width: 1, style: "solid" },
      left: { color: "#FF0000", width: 1, style: "solid" },
    });
    expect(
      capture.warnings
        .filter((warning) => warning.code === "format-loss")
        .map((warning) => warning.message),
    ).toEqual([
      "Non-solid fill pattern darkVertical cannot be represented and was dropped",
      "Gradient fill cannot be represented and was dropped",
      "Diagonal border presentation cannot be represented and was dropped",
    ]);
  });

  it("ports cases 21-22: preserves custom formats and classifies quoted and elapsed-time vectors", async () => {
    const vectors = [
      ["DD/MM/YY", "date"],
      ["H:MM:SS;@", "date"],
      ['m"M"d"D";@', "date"],
      ["[h]:mm:ss", "date"],
      ["[ss]", "date"],
      ["[s].000", "date"],
      ["#,##0\\ [$₽-46D]", "currency"],
      ['"Y: "0.00"m";"Y: "-0.00"m";"Y: <num>m";@', "number"],
      ["[Red][<=100]0.00", "number"],
    ] as const;
    const numFmts = vectors
      .map(
        ([format], index) =>
          `<numFmt numFmtId="${164 + index}" formatCode="${format.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")}"/>`,
      )
      .join("");
    const xfs = vectors
      .map(
        (_, index) =>
          `<xf numFmtId="${164 + index}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`,
      )
      .join("");
    const styles = stylesXml(
      `<numFmts count="${vectors.length}">${numFmts}</numFmts><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="${vectors.length}">${xfs}</cellXfs>`,
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              `<dimension ref="A1:I1"/><sheetData><row r="1">${vectors
                .map(
                  (_, index) =>
                    `<c r="${String.fromCharCode(65 + index)}1" s="${index}"><v>1</v></c>`,
                )
                .join("")}</row></sheetData>`,
            ),
          },
        ],
      }),
    );
    expect(imported.sheets[0]!.columns.map((column) => [column.numberFormat, column.type])).toEqual(
      vectors.map(([format, type]) => [format, type]),
    );
  });

  it("ports cases 23-25 and 45: preserves dimensions, outlines, and row-over-column style precedence", async () => {
    const styles = stylesXml(
      '<fonts count="3"><font/><font><b/></font><font><i/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0"/></cellXfs>',
    );
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:B3"/><cols><col min="1" max="2" width="12" customWidth="1" bestFit="1" hidden="1" outlineLevel="1" collapsed="1" style="1"/></cols><sheetData><row r="1" ht="24" customHeight="1" hidden="1" outlineLevel="1"><c r="A1"><v>1</v></c></row><row r="2" s="2" customFormat="1" outlineLevel="1" collapsed="1"><c r="A2"><v>2</v></c></row><row r="3" s="2"><c r="A3"><v>3</v></c></row></sheetData>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(
      imported.sheets[0]!.columns.map((column) => ({
        width: column.width,
        visible: column.visible,
        cellStyle: column.cellStyle,
      })),
    ).toEqual([
      { width: 89, visible: false, cellStyle: { bold: true } },
      { width: 89, visible: false, cellStyle: { bold: true } },
    ]);
    expect(imported.sheets[0]!.rowMeta).toEqual([[0, { height: 32, hidden: true }]]);
    expect(imported.sheets[0]!.rowGroups).toEqual([{ start: 0, end: 1, collapsed: true }]);
    expect(imported.sheets[0]!.cells[0]!.cells.map((cell) => cell.style)).toEqual([
      { bold: true },
      { italic: true },
      { bold: true },
    ]);
    expect(capture.warnings).toEqual([
      expect.objectContaining({
        code: "unsupported-feature",
        message:
          "Excel column outline/collapsed presentation cannot be represented and was dropped",
      }),
    ]);
  });

  it("ports case 26: retains frozen axes and warns for split, RTL, and zoom presentation", async () => {
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<sheetViews><sheetView workbookViewId="0" rightToLeft="1" zoomScale="125"><pane xSplit="2" ySplit="3" state="split"/></sheetView><sheetView workbookViewId="0"><pane xSplit="1" ySplit="2" state="frozen"/></sheetView><sheetView workbookViewId="0" rightToLeft="1" zoomScaleNormal="80"><pane xSplit="4" ySplit="5" state="split"/></sheetView></sheetViews><dimension ref="A1"/><sheetData/>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.frozenRows).toBeUndefined();
    expect(imported.sheets[0]!.frozenCols).toBeUndefined();
    expect(capture.warnings.map((warning) => [warning.code, warning.message])).toEqual([
      ["unsupported-feature", "Right-to-left worksheet view presentation was dropped"],
      ["unsupported-feature", "Worksheet zoom presentation was dropped"],
      ["unsupported-feature", "Split-pane worksheet view presentation was dropped"],
    ]);
  });

  it("ports case 27: imports visible, hidden, and veryHidden worksheet states exactly", async () => {
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          { name: "Visible", state: "visible", xml: worksheet("<sheetData/>") },
          { name: "Hidden", state: "hidden", xml: worksheet("<sheetData/>") },
          { name: "VeryHidden", state: "veryHidden", xml: worksheet("<sheetData/>") },
        ],
      }),
    );
    expect(imported.sheets.map((sheet) => [sheet.name, sheet.visibility])).toEqual([
      ["Visible", undefined],
      ["Hidden", "hidden"],
      ["VeryHidden", "veryHidden"],
    ]);
  });
  it("ports cases 28-29: rejects overlapping merges and unsafe case-folded or overlength names", async () => {
    const merged = minimalSnapshot();
    merged.sheets[0]!.rowCount = 2;
    merged.sheets[0]!.columns.push({ key: "b", header: "B", width: 80, type: "text" });
    merged.sheets[0]!.merges = [
      { r0: 0, c0: 0, r1: 1, c1: 1 },
      { r0: 0, c0: 1, r1: 0, c1: 1 },
    ];
    await expect(sheetwriteWorkbookBackend.toXlsxWorkbook(merged)).rejects.toThrow(
      "Merged regions may not overlap",
    );

    const duplicateImport = rawXlsx({
      sheets: [
        { name: "thisisaworksheetnameinuppercase", xml: worksheet("<sheetData/>") },
        { name: "THISISAWORKSHEETNAMEINUPPERCASE", xml: worksheet("<sheetData/>") },
      ],
    });
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(duplicateImport)).rejects.toThrow(
      "unsafe or duplicated",
    );
    const overlengthImport = rawXlsx({
      sheets: [
        { name: "ThisIsAWorksheetNameThatIsLonge", xml: worksheet("<sheetData/>") },
        { name: "ThisIsAWorksheetNameThatIsLongerThan31", xml: worksheet("<sheetData/>") },
      ],
    });
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(overlengthImport)).rejects.toThrow(
      "unsafe or duplicated",
    );

    const duplicateExport = minimalSnapshot();
    duplicateExport.sheets.push({
      ...structuredClone(duplicateExport.sheets[0]!),
      id: "s2",
      name: "SHEET1",
      order: 1,
    });
    await expect(sheetwriteWorkbookBackend.toXlsxWorkbook(duplicateExport)).rejects.toThrow(
      "duplicate case-insensitive",
    );
    const overlengthExport = minimalSnapshot();
    overlengthExport.sheets[0]!.name = "ThisIsAWorksheetNameThatIsLongerThan31";
    await expect(sheetwriteWorkbookBackend.toXlsxWorkbook(overlengthExport)).rejects.toThrow(
      "invalid XLSX sheet name",
    );
  });

  it("ports cases 30-31: imports scoped rectangles and drops reserved, constant, dynamic, and union names", async () => {
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          { name: "Sheet1", xml: worksheet('<dimension ref="A1:A3"/><sheetData/>') },
          { name: "Sheet2", xml: worksheet('<dimension ref="A1"/><sheetData/>') },
        ],
        workbookExtra:
          '<definedNames><definedName name="GlobalRef">Sheet1!$A$1</definedName><definedName name="Sheet0Ref" localSheetId="0">Sheet1!$A$3</definedName><definedName name="Sheet1Ref" localSheetId="1">Sheet2!$A$1</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$A$3</definedName><definedName name="GlobalValue">9.99</definedName><definedName name="Dynamic">Sheet1!OFFSET($A$1,0,0,2,1)</definedName><definedName name="Union">Sheet1!$A$1,$A$3</definedName></definedNames>',
      }),
      { onWarning: capture.onWarning },
    );
    const [sheet1, sheet2] = imported.sheets;
    expect(imported.workbook.namedRanges).toEqual([
      {
        name: "GlobalRef",
        range: {
          sheet: sheet1!.id,
          start: { row: 0, col: 0 },
          end: { row: 0, col: 0 },
        },
      },
      {
        name: "Sheet0Ref",
        scope: sheet1!.id,
        range: {
          sheet: sheet1!.id,
          start: { row: 2, col: 0 },
          end: { row: 2, col: 0 },
        },
      },
      {
        name: "Sheet1Ref",
        scope: sheet2!.id,
        range: {
          sheet: sheet2!.id,
          start: { row: 0, col: 0 },
          end: { row: 0, col: 0 },
        },
      },
    ]);
    expect(capture.warnings.map((warning) => warning.message)).toEqual([
      "Reserved Excel defined name _xlnm.Print_Area was dropped",
      "Defined name GlobalValue was not a single rectangular range",
      "Defined name Dynamic was not a single rectangular range",
      "Defined name Union was not a single rectangular range",
    ]);
  });

  it("ports cases 32 and 34: maps inline and multi-range lists and warns on validation-policy loss", async () => {
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:C2"/><sheetData/><dataValidations count="3"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="stop" prompt="Pick a duck" error="Bad duck" sqref="A1"><formula1>"Ducks"</formula1></dataValidation><dataValidation type="list" allowBlank="0" sqref="B1 B2"><formula1>"A,B"</formula1></dataValidation><dataValidation type="custom" showErrorMessage="1" sqref="C1:C2"><formula1>ISNUMBER(C1)</formula1></dataValidation></dataValidations>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.validationRules).toEqual([
      expect.objectContaining({
        range: expect.objectContaining({
          start: { row: 0, col: 0 },
          end: { row: 0, col: 0 },
        }),
        condition: { kind: "list", values: ["Ducks"] },
        policy: "reject",
        allowBlank: true,
        helpText: "Pick a duck",
      }),
      expect.objectContaining({
        range: expect.objectContaining({
          start: { row: 0, col: 1 },
          end: { row: 0, col: 1 },
        }),
        condition: { kind: "list", values: ["A", "B"] },
      }),
      expect.objectContaining({
        range: expect.objectContaining({
          start: { row: 1, col: 1 },
          end: { row: 1, col: 1 },
        }),
        condition: { kind: "list", values: ["A", "B"] },
      }),
    ]);
    expect(capture.warnings.map((warning) => [warning.code, warning.message])).toEqual([
      [
        "validation-loss",
        "Distinct Excel validation prompt and error text were reduced to the prompt",
      ],
      ["validation-loss", "Excel validation type custom was dropped"],
    ]);
  });

  it("ports cases 36-37: imports multi-author rich comments and exact note whitespace/newlines", async () => {
    const capture = warningsFor();
    const comments = `<?xml version="1.0"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors><author>Cuke</author><author>Not Cuke</author></authors><commentList><comment ref="A1" authorId="0"><text><r><rPr><b/></rPr><t xml:space="preserve"> Cuke:\nFirst Comment </t></r></text></comment><comment ref="D1" authorId="0"><text><t xml:space="preserve">trailing </t></text></comment><comment ref="A2" authorId="1"><text><t xml:space="preserve"> both \n spaced </t></text></comment></commentList></comments>`;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet('<dimension ref="A1:D2"/><sheetData/>'),
            relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/comments" Target="../comments1.xml"/>`,
          },
        ],
        extraOverrides: [
          '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
        ],
        extraFiles: { "xl/comments1.xml": comments },
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.notes).toEqual([
      { addr: { sheet: imported.sheets[0]!.id, row: 0, col: 0 }, text: " Cuke:\nFirst Comment " },
      { addr: { sheet: imported.sheets[0]!.id, row: 0, col: 3 }, text: "trailing " },
      { addr: { sheet: imported.sheets[0]!.id, row: 1, col: 0 }, text: " both \n spaced " },
    ]);
    expect(capture.warnings).toEqual([
      expect.objectContaining({
        code: "rich-text",
        message: "Comment rich text formatting was flattened",
        cell: "A1",
      }),
    ]);
  });

  it("ports case 38: dispatches a full Strict workbook, styles, strings, sheet, and comments graph", async () => {
    const comments = `<?xml version="1.0"?><comments xmlns="${STRICT_MAIN}"><authors><author>A</author></authors><commentList><comment ref="A1" authorId="0"><text><t>Strict note</t></text></comment></commentList></comments>`;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        strict: true,
        styles: stylesXml(
          '<fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/></cellXfs>',
          true,
        ),
        sharedStrings: `<?xml version="1.0"?><sst xmlns="${STRICT_MAIN}" count="1" uniqueCount="1"><si><t>Strict shared</t></si></sst>`,
        sheets: [
          {
            name: "Strict",
            xml: worksheet(
              '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="s" s="1"><v>0</v></c></row></sheetData>',
              true,
            ),
            relationships: `<Relationship Id="rId1" Type="${STRICT_REL}/comments" Target="../comments1.xml"/>`,
          },
        ],
        extraOverrides: [
          '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
        ],
        extraFiles: { "xl/comments1.xml": comments },
      }),
    );
    expect(rowValues(imported)).toEqual([{ kind: "literal", value: "Strict shared" }]);
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.style).toEqual({ bold: true });
    expect(imported.sheets[0]!.notes).toEqual([
      { addr: { sheet: imported.sheets[0]!.id, row: 0, col: 0 }, text: "Strict note" },
    ]);
  });

  it("ports case 39: never fetches external targets and resolves internal parent targets within OPC root", async () => {
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1"/><sheetData/><hyperlinks><hyperlink ref="A1" r:id="rIdExternal"/></hyperlinks>',
            ),
            relationships: `<Relationship Id="rIdExternal" Type="${TRANSITIONAL_REL}/hyperlink" Target="https://invalid.example/never-fetch" TargetMode="External"/><Relationship Id="rIdComments" Type="${TRANSITIONAL_REL}/comments" Target="../comments1.xml"/>`,
          },
        ],
        extraOverrides: [
          '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
        ],
        extraFiles: {
          "xl/comments1.xml": `<?xml version="1.0"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors><author>A</author></authors><commentList><comment ref="A1" authorId="0"><text><t>resolved parent</t></text></comment></commentList></comments>`,
        },
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.notes?.[0]?.text).toBe("resolved parent");
    expect(imported.sheets[0]!.hyperlinks).toEqual([
      {
        id: "xlsx-hyperlink-1-1",
        range: {
          sheet: imported.sheets[0]!.id,
          start: { row: 0, col: 0 },
          end: { row: 0, col: 0 },
        },
        target: { kind: "external", url: "https://invalid.example/never-fetch" },
      },
    ]);
    expect(capture.warnings).toEqual([]);
  });

  it("ports cases 40-41: rejects malformed or missing XML and ignores declared unknown extensions", async () => {
    const valid = unzipSync(
      rawXlsx({
        sheets: [{ xml: worksheet('<dimension ref="A1"/><sheetData/>') }],
      }),
    );
    const malformed = { ...valid, "xl/worksheets/sheet1.xml": strToU8("<worksheet><sheetData>") };
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        zipSync(malformed, { level: 6, mtime: FIXED_ZIP_TIME }),
      ),
    ).rejects.toThrow("XML");

    const missing = { ...valid };
    delete missing["xl/workbook.xml"];
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        zipSync(missing, { level: 6, mtime: FIXED_ZIP_TIME }),
      ),
    ).rejects.toThrow("missing xl/workbook.xml");

    const forward = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>kept</t></is></c></row></sheetData><extLst><ext uri="{test}"><future:payload xmlns:future="urn:example:future"><future:value>ignored</future:value></future:payload></ext></extLst>',
            ),
          },
        ],
      }),
    );
    expect(rowValues(forward)).toEqual([{ kind: "literal", value: "kept" }]);
  });

  it("ports cases 42-44: enforces per-entry, entry-count, row, and column resource boundaries", async () => {
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(rawZip({ "huge.bin": "x".repeat(32) }, 0), {
        resourceLimits: { maxEntryUncompressedBytes: 16 },
      });
      throw new Error("expected maxEntryUncompressedBytes rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxResourceError);
      expect((error as XlsxResourceError).resource).toBe("maxEntryUncompressedBytes");
    }

    const tenByTen = rawXlsx({
      sheets: [{ xml: worksheet('<dimension ref="A1:J10"/><sheetData/>') }],
    });
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(tenByTen, {
        resourceLimits: { maxArchiveEntries: 4 },
      });
      throw new Error("expected maxArchiveEntries rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxResourceError);
      expect((error as XlsxResourceError).resource).toBe("maxArchiveEntries");
    }
    const atBoundary = await sheetwriteWorkbookBackend.fromXlsxWorkbook(tenByTen, {
      resourceLimits: { maxRowsPerSheet: 10, maxColumnsPerSheet: 10 },
    });
    expect([atBoundary.sheets[0]!.rowCount, atBoundary.sheets[0]!.columns.length]).toEqual([
      10, 10,
    ]);

    for (const [resource, xml] of [
      [
        "maxRowsPerSheet",
        worksheet('<dimension ref="A1:A11"/><sheetData><row r="11"/></sheetData>'),
      ],
      [
        "maxColumnsPerSheet",
        worksheet('<cols><col min="1" max="11" style="0"/></cols><sheetData/>'),
      ],
      [
        "maxColumnsPerSheet",
        worksheet('<dimension ref="A1:K1"/><sheetData><row r="1"><c r="K1"/></row></sheetData>'),
      ],
    ] as const) {
      try {
        await sheetwriteWorkbookBackend.fromXlsxWorkbook(rawXlsx({ sheets: [{ xml }] }), {
          resourceLimits: { [resource]: 10 },
        });
        throw new Error(`expected ${resource} rejection`);
      } catch (error) {
        expect(error).toBeInstanceOf(XlsxResourceError);
        expect((error as XlsxResourceError).resource).toBe(resource);
      }
    }
  });
});

describe("local deterministic and adversarial XLSX gates", () => {
  it("is insertion-order invariant with canonical ZIP entries, relationships, styles, and timestamps", async () => {
    const first = minimalSnapshot();
    first.sheets[0]!.rowCount = 2;
    first.sheets[0]!.columns.push({
      key: "b",
      header: "B",
      width: 90,
      type: "number",
      cellStyle: { bold: true, color: "#112233" },
    });
    first.sheets[0]!.cells = [
      {
        startRow: 1,
        startCol: 1,
        rowCount: 1,
        colCount: 1,
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "literal", value: 2 },
            style: { italic: true, backgroundColor: "#AABBCC" },
          },
        ],
      },
      ...first.sheets[0]!.cells,
    ];
    const second = structuredClone(first);
    second.sheets[0]!.cells.reverse();
    second.sheets[0]!.columns[1]!.cellStyle = { color: "#112233", bold: true };
    second.sheets[0]!.cells.find((block) => block.startRow === 1 && block.startCol === 1)!
      .cells[0]!.style = {
      backgroundColor: "#AABBCC",
      italic: true,
    };

    const [left, right] = await Promise.all([
      sheetwriteWorkbookBackend.toXlsxWorkbook(first),
      sheetwriteWorkbookBackend.toXlsxWorkbook(second),
    ]);
    expect(right).toEqual(left);
    const entries = Object.keys(unzipSync(left));
    expect(entries).toEqual([...entries].sort((a, b) => a.localeCompare(b)));
    const view = new DataView(left.buffer, left.byteOffset, left.byteLength);
    for (let offset = 0; offset + 30 < left.byteLength; offset++) {
      if (view.getUint32(offset, true) !== 0x04034b50) continue;
      expect(view.getUint16(offset + 10, true)).toBe(0);
      expect(view.getUint16(offset + 12, true)).toBe(33);
    }
  });

  it("matches independently authored exact workbook, sheet, style, comment, name, and view XML", async () => {
    const source = minimalSnapshot();
    source.workbook.namedRanges = [
      {
        name: "LocalCell",
        scope: "s",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      },
    ];
    source.sheets[0]!.frozenRows = 1;
    source.sheets[0]!.notes = [{ addr: { sheet: "s", row: 0, col: 0 }, text: "note & <xml>" }];
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(source));
    expect(strFromU8(parts["xl/workbook.xml"]!)).toBe(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${TRANSITIONAL_MAIN}" xmlns:r="${TRANSITIONAL_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/><sheet name="__sheetwrite_meta__" sheetId="2" state="veryHidden" r:id="rId2"/></sheets><definedNames><definedName name="LocalCell" localSheetId="0">&apos;Sheet1&apos;!$A$1:$A$1</definedName></definedNames><calcPr fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
    );
    expect(strFromU8(parts["xl/worksheets/sheet1.xml"]!)).toBe(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${TRANSITIONAL_MAIN}" xmlns:r="${TRANSITIONAL_REL}"><dimension ref="A1:A1"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="10.71" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve">x</t></is></c></row></sheetData><legacyDrawing r:id="rId2"/></worksheet>`,
    );
    expect(strFromU8(parts["xl/comments1.xml"]!)).toBe(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors><author>Sheetwrite</author></authors><commentList><comment ref="A1" authorId="0"><text><r><t xml:space="preserve">note &amp; &lt;xml&gt;</t></r></text></comment></commentList></comments>`,
    );
    expect(strFromU8(parts["xl/styles.xml"]!)).toBe(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${TRANSITIONAL_MAIN}"><fonts count="1"><font></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    );
  });

  it("preserves exact abort reasons as canonical causes across codec stages", async () => {
    const centralReason = new Error("abort during central directory");
    let centralChecks = 0;
    const centralSignal = {
      get aborted() {
        centralChecks += 1;
        return centralChecks >= 3;
      },
      get reason() {
        return centralReason;
      },
    } as AbortSignal;
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({ sheets: [{ xml: worksheet("<sheetData/>") }] }),
        { signal: centralSignal },
      );
      throw new Error("expected central-directory abort");
    } catch (error) {
      expect(error).toBeInstanceOf(SheetwriteError);
      expect(error).toMatchObject({
        code: "aborted",
        operation: "xlsx-import",
      });
      expect((error as SheetwriteError).cause).toBe(centralReason);
      expect(centralChecks).toBe(3);
    }

    const sharedReason = new Error("abort during shared strings");
    let sharedChecks = 0;
    const sharedSignal = {
      get aborted() {
        sharedChecks += 1;
        return sharedChecks >= 16;
      },
      get reason() {
        return sharedReason;
      },
    } as AbortSignal;
    const sharedWarnings: XlsxWorkbookWarning[] = [];
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sharedStrings: `<?xml version="1.0"?><sst xmlns="${TRANSITIONAL_MAIN}" count="5000" uniqueCount="5000">${Array.from({ length: 5_000 }, (_, index) => `<si><t>${index}</t></si>`).join("")}</sst>`,
          sheets: [
            {
              xml: worksheet(
                '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData>',
              ),
            },
          ],
        }),
        { signal: sharedSignal, onWarning: (warning) => sharedWarnings.push(warning) },
      );
      throw new Error("expected shared-string abort");
    } catch (error) {
      expect(error).toBeInstanceOf(SheetwriteError);
      expect((error as SheetwriteError).cause).toBe(sharedReason);
      expect(sharedChecks).toBe(16);
      expect(sharedWarnings).toEqual([]);
    }

    const exportReason = new Error("abort during export part");
    let exportChecks = 0;
    const exportSignal = {
      get aborted() {
        exportChecks += 1;
        return exportChecks >= 3;
      },
      get reason() {
        return exportReason;
      },
    } as AbortSignal;
    const exportWarnings: XlsxWorkbookWarning[] = [];
    try {
      await sheetwriteWorkbookBackend.toXlsxWorkbook(minimalSnapshot(), {
        signal: exportSignal,
        onWarning: (warning) => exportWarnings.push(warning),
      });
      throw new Error("expected export-part abort");
    } catch (error) {
      expect(error).toBeInstanceOf(SheetwriteError);
      expect(error).toMatchObject({
        code: "aborted",
        operation: "xlsx-export",
      });
      expect((error as SheetwriteError).cause).toBe(exportReason);
      expect(exportChecks).toBe(3);
      expect(exportWarnings).toEqual([]);
    }
  });

  it("rejects ZIP local/central disagreements and duplicate raw or normalized logical entries", async () => {
    const valid = rawXlsx({ sheets: [{ xml: worksheet("<sheetData/>") }] });
    let eocd = -1;
    const validView = new DataView(valid.buffer, valid.byteOffset, valid.byteLength);
    for (let offset = valid.byteLength - 22; offset >= 0; offset--) {
      if (validView.getUint32(offset, true) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    expect(eocd).toBeGreaterThan(0);
    const central = validView.getUint32(eocd + 16, true);
    const local = validView.getUint32(central + 42, true);

    const filenameMismatch = valid.slice();
    filenameMismatch[local + 30] = filenameMismatch[local + 30]! ^ 1;
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(filenameMismatch)).rejects.toThrow(
      "local filename disagrees",
    );

    const crcMismatch = valid.slice();
    new DataView(crcMismatch.buffer, crcMismatch.byteOffset, crcMismatch.byteLength).setUint32(
      local + 14,
      0,
      true,
    );
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(crcMismatch)).rejects.toThrow(
      "local sizes or CRC disagree",
    );
    const sizeMismatch = valid.slice();
    const sizeView = new DataView(
      sizeMismatch.buffer,
      sizeMismatch.byteOffset,
      sizeMismatch.byteLength,
    );
    sizeView.setUint32(local + 22, sizeView.getUint32(local + 22, true) + 1, true);
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(sizeMismatch)).rejects.toThrow(
      "local sizes or CRC disagree",
    );

    const exactDuplicate = rawZip({ "a.xml": "a", "b.xml": "b" }, 0);
    const duplicateView = new DataView(
      exactDuplicate.buffer,
      exactDuplicate.byteOffset,
      exactDuplicate.byteLength,
    );
    let duplicateEocd = -1;
    for (let offset = exactDuplicate.byteLength - 22; offset >= 0; offset--) {
      if (duplicateView.getUint32(offset, true) === 0x06054b50) {
        duplicateEocd = offset;
        break;
      }
    }
    const firstCentral = duplicateView.getUint32(duplicateEocd + 16, true);
    const secondCentral =
      firstCentral +
      46 +
      duplicateView.getUint16(firstCentral + 28, true) +
      duplicateView.getUint16(firstCentral + 30, true) +
      duplicateView.getUint16(firstCentral + 32, true);
    const secondLocal = duplicateView.getUint32(secondCentral + 42, true);
    exactDuplicate[secondCentral + 46] = "a".charCodeAt(0);
    exactDuplicate[secondLocal + 30] = "a".charCodeAt(0);

    for (const duplicate of [
      exactDuplicate,
      rawZip({ "A.xml": "a", "a.xml": "b" }),
      rawZip({ "a.xml": "a", "%61.xml": "b" }),
    ]) {
      await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(duplicate)).rejects.toThrow(
        "duplicate logical part name",
      );
    }
  });

  it("rejects wrong roots or namespaces while tolerating extensions only under valid roots", async () => {
    const comments = `<?xml version="1.0"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors/><commentList/></comments>`;
    const base = unzipSync(
      rawXlsx({
        styles: stylesXml(BASE_STYLES_BODY),
        sheets: [
          {
            xml: worksheet("<sheetData/>"),
            relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/comments" Target="../comments1.xml"/>`,
          },
        ],
        extraOverrides: [
          '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
        ],
        extraFiles: { "xl/comments1.xml": comments },
      }),
    );
    const mutations: Array<[string, string, string]> = [
      ["xl/workbook.xml", TRANSITIONAL_MAIN, "urn:wrong:workbook"],
      ["xl/worksheets/sheet1.xml", TRANSITIONAL_MAIN, "urn:wrong:worksheet"],
      ["xl/styles.xml", TRANSITIONAL_MAIN, "urn:wrong:styles"],
      ["xl/comments1.xml", TRANSITIONAL_MAIN, "urn:wrong:comments"],
      ["_rels/.rels", PACKAGE_REL, "urn:wrong:relationships"],
    ];
    for (const [part, expectedNamespace, wrongNamespace] of mutations) {
      const files = { ...base };
      files[part] = strToU8(strFromU8(files[part]!).replace(expectedNamespace, wrongNamespace));
      await expect(
        sheetwriteWorkbookBackend.fromXlsxWorkbook(
          zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME }),
        ),
      ).rejects.toThrow("allowed OOXML namespace");
    }
  });

  it("drops threaded comments with one exact unsupported-feature warning", async () => {
    const capture = warningsFor();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet("<sheetData/>"),
            relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/threadedComment" Target="../threadedComments/threadedComment1.xml"/>`,
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.notes).toBeUndefined();
    expect(capture.warnings).toEqual([
      {
        code: "unsupported-feature",
        message: "Unsupported worksheet relationship threadedComment was dropped",
        sheet: "Raw1",
        part: "xl/threadedComments/threadedComment1.xml",
      },
    ]);
  });

  it("makes native external edits win over stale value, style, name, note, and view sidecar data", async () => {
    const source = minimalSnapshot();
    source.workbook.namedRanges = [
      {
        name: "OldName",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      },
    ];
    source.sheets[0]!.frozenRows = 1;
    source.sheets[0]!.cells[0]!.cells[0]!.style = { bold: true };
    source.sheets[0]!.notes = [{ addr: { sheet: "s", row: 0, col: 0 }, text: "old note" }];
    const files = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(source));
    files["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(files["xl/worksheets/sheet1.xml"]!)
        .replace(">x</t>", ">native</t>")
        .replace(
          '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
          '<pane xSplit="1" topLeftCell="B1" activePane="topRight" state="frozen"/>',
        ),
    );
    files["xl/styles.xml"] = strToU8(strFromU8(files["xl/styles.xml"]!).replace("<b/>", "<i/>"));
    files["xl/workbook.xml"] = strToU8(
      strFromU8(files["xl/workbook.xml"]!).replace('name="OldName"', 'name="NewName"'),
    );
    files["xl/comments1.xml"] = strToU8(
      strFromU8(files["xl/comments1.xml"]!).replace("old note", "new note"),
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME }),
    );
    expect(rowValues(imported)).toEqual([{ kind: "literal", value: "native" }]);
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.style).toEqual({ italic: true });
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("NewName");
    expect(imported.sheets[0]!.notes?.[0]?.text).toBe("new note");
    expect(imported.sheets[0]!.frozenRows).toBeUndefined();
    expect(imported.sheets[0]!.frozenCols).toBe(1);
  });

  it("accounts UTF-8 bytes incrementally for CJK, emoji, and escaped output", async () => {
    const ascii = minimalSnapshot();
    const unicode = minimalSnapshot();
    ascii.sheets[0]!.cells[0]!.cells[0]!.value = {
      kind: "literal",
      value: "a&<>".repeat(256),
    };
    unicode.sheets[0]!.cells[0]!.cells[0]!.value = {
      kind: "literal",
      value: "漢😀&<>".repeat(256),
    };
    const asciiOutput = await sheetwriteWorkbookBackend.toXlsxWorkbook(ascii);
    const unicodeOutput = await sheetwriteWorkbookBackend.toXlsxWorkbook(unicode);
    const asciiParts = unzipSync(asciiOutput);
    const unicodeParts = unzipSync(unicodeOutput);
    const asciiAccounted =
      Object.values(asciiParts).reduce((total, part) => total + part.byteLength, 0) +
      Object.keys(asciiParts).length * 256;
    const unicodeAccounted =
      Object.values(unicodeParts).reduce((total, part) => total + part.byteLength, 0) +
      Object.keys(unicodeParts).length * 256;
    expect(unicodeAccounted).toBeGreaterThan(asciiAccounted);
    await expect(
      sheetwriteWorkbookBackend.toXlsxWorkbook(ascii, {
        resourceLimits: { maxOutputBytes: asciiAccounted },
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
    try {
      await sheetwriteWorkbookBackend.toXlsxWorkbook(unicode, {
        resourceLimits: { maxOutputBytes: asciiAccounted },
      });
      throw new Error("expected UTF-8 maxOutputBytes rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxResourceError);
      expect((error as XlsxResourceError).resource).toBe("maxOutputBytes");
      expect((error as XlsxResourceError).actual).toBeGreaterThan(asciiAccounted);
    }
  });

  it("keeps an exhaustive machine-readable mapping for every pinned external case", async () => {
    const mapping = (await Bun.file(
      new URL("fixtures/external-case-mapping.json", import.meta.url),
    ).json()) as {
      pins: Record<string, { commit: string }>;
      cases: Array<{ id: number; status: string; testName: string }>;
      impossibleCases: unknown[];
    };
    expect(mapping.cases).toHaveLength(45);
    expect(mapping.cases.map((entry) => entry.id)).toEqual(
      Array.from({ length: 45 }, (_, index) => index + 1),
    );
    expect(new Set(mapping.cases.map((entry) => entry.id)).size).toBe(45);
    expect(
      mapping.cases.every(
        (entry) =>
          (entry.status === "covered-existing" || entry.status === "ported") &&
          entry.testName.length > 0,
      ),
    ).toBe(true);
    expect(mapping.pins.exceljs?.commit).toBe("ac96f9a61e9799c7776bd940f05c4a51d7200209");
    expect(mapping.pins.openpyxl?.commit).toBe("9a816c7f1efabd2d31689e29037f1a2d6756cc00");
    expect(mapping.pins["apache-poi"]?.commit).toBe("913c78891bd0cd20945b050c63abfb8c66c88009");
    expect(mapping.impossibleCases).toEqual([]);
  });
});
