import type {
  CellStyle,
  ConditionalFormatRule,
  DataValidationRule,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { colToA1 } from "@sheetwrite/core";
import { formulaContainsExternalReference } from "./formula.js";
import { type ContentTypeOverride, contentTypesXml, relationshipsXml } from "./opc.js";
import {
  assertResource,
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import { StylesRegistry } from "./styles.js";
import { encodeXstring, escapeXml, isValidXlsxWorksheetName, XmlBuffer } from "./xml.js";
import { writeZip } from "./zip.js";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OFFICE_DOCUMENT_REL = `${REL_NS}/officeDocument`;
const WORKSHEET_REL = `${REL_NS}/worksheet`;
const STYLES_REL = `${REL_NS}/styles`;
const COMMENTS_REL = `${REL_NS}/comments`;
const VML_REL = `${REL_NS}/vmlDrawing`;
const WORKBOOK_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const WORKSHEET_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const STYLES_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
const COMMENTS_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml";
const VML_CONTENT = "application/vnd.openxmlformats-officedocument.vmlDrawing";
const META_MARKER = "sheetwrite-workbook-metadata-v1";
const META_STEM = "__sheetwrite_meta__";
const META_CHUNK = 30_000;

interface AbsoluteCell {
  readonly row: number;
  readonly col: number;
  readonly source: SnapshotCell;
}

interface SheetWriteResult {
  readonly xml: Uint8Array;
  readonly relationships?: Uint8Array;
  readonly comments?: Uint8Array;
  readonly vml?: Uint8Array;
}

function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function formulaForReference(snapshot: WorkbookSnapshot, source: SnapshotCell["value"]): string {
  if (source.kind !== "ref") throw new TypeError("Sheetwrite: expected reference cell");
  const target = snapshot.sheets.find((sheet) => sheet.id === source.target.sheet);
  if (!target) return "#REF!";
  return `${quotedSheet(target.name)}!${colToA1(source.target.col)}${source.target.row + 1}`;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = canonicalJsonValue((value as Record<string, unknown>)[key]);
  }
  return output;
}

function hasExactBorderWidth(style: CellStyle | undefined): boolean {
  return Object.values(style?.border ?? {}).some(
    (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
  );
}

function metadataSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return {
    ...snapshot,
    workbook: { ...snapshot.workbook },
    sheets: snapshot.sheets.map((sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column) => ({ ...column })),
      cells: sheet.cells.flatMap((block) => {
        const preserved = block.cells
          .filter((cell) => cell.value.kind === "ref" || hasExactBorderWidth(cell.style))
          .map((cell) => ({
            rowOffset: cell.rowOffset,
            colOffset: cell.colOffset,
            value:
              cell.value.kind === "ref"
                ? structuredClone(cell.value)
                : ({ kind: "literal", value: null } as const),
            ...(hasExactBorderWidth(cell.style) ? { style: structuredClone(cell.style) } : {}),
          }));
        return preserved.length > 0 ? [{ ...block, cells: preserved }] : [];
      }),
    })),
  };
}

function metadataSheetName(snapshot: WorkbookSnapshot): string {
  const names = new Set(snapshot.sheets.map((sheet) => sheet.name.normalize("NFC").toLowerCase()));
  let name = META_STEM;
  let suffix = 2;
  while (names.has(name.normalize("NFC").toLowerCase())) {
    name = `${META_STEM.slice(0, 27)}_${suffix++}`;
  }
  return name;
}

function validateNames(snapshot: WorkbookSnapshot): void {
  const names = new Set<string>();
  for (const sheet of snapshot.sheets) {
    const folded = sheet.name.normalize("NFC").toLowerCase();
    if (names.has(folded)) {
      throw new RangeError(`Sheetwrite: duplicate case-insensitive XLSX sheet name: ${sheet.name}`);
    }
    if (!isValidXlsxWorksheetName(sheet.name)) {
      throw new RangeError(`Sheetwrite: invalid XLSX sheet name: ${sheet.name}`);
    }
    names.add(folded);
  }
  if (
    snapshot.sheets.every(
      (sheet) => sheet.visibility === "hidden" || sheet.visibility === "veryHidden",
    )
  ) {
    throw new RangeError("Sheetwrite: XLSX export requires at least one visible worksheet");
  }
}

function preflightSnapshot(snapshot: WorkbookSnapshot, context: XlsxCodecContext): void {
  assertResource(context, "maxSheets", snapshot.sheets.length);
  let cells = 0;
  let merges = 0;
  for (const sheet of snapshot.sheets) {
    assertResource(context, "maxRowsPerSheet", sheet.rowCount);
    assertResource(context, "maxColumnsPerSheet", sheet.columns.length);
    merges += sheet.merges?.length ?? 0;
    assertResource(context, "maxMerges", merges);
    for (const block of sheet.cells) {
      cells += block.cells.length;
      assertResource(context, "maxCells", cells);
    }
  }
}

function validationRange(rule: DataValidationRule): string {
  const row0 = Math.min(rule.range.start.row, rule.range.end.row);
  const row1 = Math.max(rule.range.start.row, rule.range.end.row);
  const col0 = Math.min(rule.range.start.col, rule.range.end.col);
  const col1 = Math.max(rule.range.start.col, rule.range.end.col);
  return `${colToA1(col0)}${row0 + 1}:${colToA1(col1)}${row1 + 1}`;
}

function validationXml(
  rule: DataValidationRule,
  context: XlsxCodecContext,
  sheet: string,
): string | null {
  const condition = rule.condition;
  let type: string;
  let operator = "";
  let formulas: (string | number)[];
  if (condition.kind === "list" || condition.kind === "checkbox") {
    const values =
      condition.kind === "list"
        ? condition.values
        : [condition.checkedValue ?? true, condition.uncheckedValue ?? false];
    const textValues = values.map((value) =>
      value === null ? "" : typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value),
    );
    if (textValues.some((value) => /[,\r\n]/.test(value))) return null;
    const list = textValues.join(",").replaceAll('"', '""');
    if (Array.from(list).length + 2 > 255) return null;
    type = "list";
    formulas = [`"${list}"`];
  } else {
    type =
      condition.kind === "date"
        ? "date"
        : condition.kind === "textLength"
          ? "textLength"
          : condition.kind === "number" && condition.integer
            ? "whole"
            : "decimal";
    if (condition.comparison) {
      operator = condition.comparison.operator;
      formulas =
        "value" in condition.comparison
          ? [condition.comparison.value]
          : [condition.comparison.min, condition.comparison.max];
    } else {
      formulas = [condition.min, condition.max].filter(
        (value): value is number => value !== undefined,
      );
      if (formulas.length === 0) return null;
      operator =
        condition.min !== undefined && condition.max !== undefined
          ? condition.min === condition.max
            ? "equal"
            : "between"
          : condition.min !== undefined
            ? "greaterThanOrEqual"
            : "lessThanOrEqual";
      if (operator === "equal") formulas = [condition.min!];
    }
  }
  let helpText = rule.helpText;
  if (helpText && Array.from(helpText).length > 255) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Validation rule "${rule.id}" prompt/error exceeded 255 characters and was omitted from native XLSX`,
      sheet,
    });
    helpText = undefined;
  }
  const attributes = [
    `type="${type}"`,
    ...(operator ? [`operator="${operator}"`] : []),
    `sqref="${validationRange(rule)}"`,
    `allowBlank="${rule.allowBlank === false ? 0 : 1}"`,
    `showInputMessage="${helpText ? 1 : 0}"`,
    `showErrorMessage="${rule.policy === "allow" ? 0 : 1}"`,
    ...(rule.policy !== "allow"
      ? [`errorStyle="${rule.policy === "reject" ? "stop" : "warning"}"`]
      : []),
    ...(helpText
      ? [
          `prompt="${escapeXml(encodeXstring(helpText))}"`,
          `error="${escapeXml(encodeXstring(helpText))}"`,
        ]
      : []),
  ].join(" ");
  return `<dataValidation ${attributes}>${formulas.map((formula, index) => `<formula${index + 1}>${escapeXml(encodeXstring(String(formula)))}</formula${index + 1}>`).join("")}</dataValidation>`;
}
function conditionalScalar(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return `"${encodeXstring(value).replaceAll('"', '""')}"`;
  return null;
}

function conditionalFormatXml(
  rule: ConditionalFormatRule,
  dxfId: number,
  priority: number,
): string | null {
  const startCol = Math.min(rule.range.start.col, rule.range.end.col);
  const startRow = Math.min(rule.range.start.row, rule.range.end.row);
  const range = `${colToA1(startCol)}${startRow + 1}:${colToA1(Math.max(rule.range.start.col, rule.range.end.col))}${Math.max(rule.range.start.row, rule.range.end.row) + 1}`;
  if (rule.when.kind === "contains") {
    const text = rule.when.text;
    const formulaText = text.replaceAll('"', '""');
    const anchor = `${colToA1(startCol)}${startRow + 1}`;
    if (rule.when.matchCase) {
      return `<conditionalFormatting sqref="${range}"><cfRule type="expression" dxfId="${dxfId}" priority="${priority}"><formula>ISNUMBER(FIND("${escapeXml(encodeXstring(formulaText))}",${anchor}))</formula></cfRule></conditionalFormatting>`;
    }
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsText" dxfId="${dxfId}" priority="${priority}" operator="containsText" text="${escapeXml(encodeXstring(text))}"><formula>NOT(ISERROR(SEARCH("${escapeXml(encodeXstring(formulaText))}",${anchor})))</formula></cfRule></conditionalFormatting>`;
  }
  if (rule.when.kind === "equal" && rule.when.value === null) {
    const anchor = `${colToA1(startCol)}${startRow + 1}`;
    return `<conditionalFormatting sqref="${range}"><cfRule type="containsBlanks" dxfId="${dxfId}" priority="${priority}"><formula>LEN(TRIM(${anchor}))=0</formula></cfRule></conditionalFormatting>`;
  }
  const formula = conditionalScalar(rule.when.value);
  if (formula === null) return null;
  const operator =
    rule.when.kind === "greaterThan"
      ? "greaterThan"
      : rule.when.kind === "lessThan"
        ? "lessThan"
        : "equal";
  return `<conditionalFormatting sqref="${range}"><cfRule type="cellIs" dxfId="${dxfId}" priority="${priority}" operator="${operator}"><formula>${escapeXml(formula)}</formula></cfRule></conditionalFormatting>`;
}

function cellXml(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  cell: AbsoluteCell,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): string {
  const column = sheet.columns[cell.col]!;
  const mergedStyle: CellStyle = { ...column.cellStyle, ...cell.source.style };
  const styleId = styles.register(
    Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined,
    column.numberFormat,
  );
  const reference = `${colToA1(cell.col)}${cell.row + 1}`;
  const styleAttribute = styleId ? ` s="${styleId}"` : "";
  const value = cell.source.value;
  if (value.kind === "formula" || value.kind === "ref") {
    const formula =
      value.kind === "formula"
        ? value.src.startsWith("=")
          ? value.src.slice(1)
          : value.src
        : formulaForReference(snapshot, value);
    if (formulaContainsExternalReference(formula)) {
      emitWarning(context, {
        code: "external-formula",
        message: "External-data formula was neutralized as inert text on export",
        sheet: sheet.name,
        cell: reference,
      });
      return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(`=${formula}`))}</t></is></c>`;
    }
    return `<c r="${reference}"${styleAttribute}><f>${escapeXml(encodeXstring(formula))}</f></c>`;
  }
  if (value.value === null) return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value.value === "string") {
    return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(value.value))}</t></is></c>`;
  }
  if (typeof value.value === "boolean") {
    return `<c r="${reference}"${styleAttribute} t="b"><v>${value.value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}"${styleAttribute}><v>${value.value}</v></c>`;
}

function commentsXml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<comments xmlns="${MAIN_NS}"><authors><author>Sheetwrite</author></authors><commentList>`,
  );
  for (const note of sheet.notes ?? []) {
    xml.append(
      `<comment ref="${colToA1(note.addr.col)}${note.addr.row + 1}" authorId="0"><text><r><t xml:space="preserve">`,
    );
    xml.appendText(note.text);
    xml.append("</t></r></text></comment>");
  }
  xml.append("</commentList></comments>");
  return xml.finish();
}

function commentsVml(sheet: SheetSnapshot, context: XlsxCodecContext): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8"?>');
  xml.append(
    '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>',
  );
  for (let index = 0; index < (sheet.notes?.length ?? 0); index++) {
    const note = sheet.notes![index]!;
    xml.append(
      `<v:shape id="_x0000_s${1025 + index}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:5pt;width:108pt;height:59.25pt;z-index:${index + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>${note.addr.row}</x:Row><x:Column>${note.addr.col}</x:Column></x:ClientData></v:shape>`,
    );
  }
  xml.append("</xml>");
  return xml.finish();
}

function writeSheet(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  sheetNumber: number,
): SheetWriteResult {
  const byRow = new Map<number, AbsoluteCell[]>();
  for (const block of sheet.cells) {
    for (const source of block.cells) {
      const row = block.startRow + source.rowOffset;
      const col = block.startCol + source.colOffset;
      if (row < 0 || row >= sheet.rowCount || col < 0 || col >= sheet.columns.length) continue;
      const rowCells = byRow.get(row) ?? [];
      rowCells.push({ row, col, source });
      byRow.set(row, rowCells);
    }
  }
  const rowMetadata = new Map(sheet.rowMeta ?? []);
  const outlineLevels = new Map<number, number>();
  const collapsedOutlineRows = new Set<number>();
  const collapsedSummaries = new Set<number>();
  const outlineSpan = (sheet.rowGroups ?? []).reduce(
    (total, group) => total + (group.end - group.start + 1),
    0,
  );
  assertResource(context, "maxEntryUncompressedBytes", outlineSpan * 24);
  for (const group of sheet.rowGroups ?? []) {
    for (let row = group.start; row <= group.end; row++) {
      outlineLevels.set(row, Math.min(7, (outlineLevels.get(row) ?? 0) + 1));
      if (group.collapsed) collapsedOutlineRows.add(row);
    }
    if (group.collapsed && group.end + 1 < sheet.rowCount) {
      collapsedSummaries.add(group.end + 1);
    }
  }
  const rows = new Set([
    ...byRow.keys(),
    ...rowMetadata.keys(),
    ...outlineLevels.keys(),
    ...collapsedSummaries,
  ]);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`);
  if (sheet.rowGroups?.length) xml.append('<sheetPr><outlinePr summaryBelow="1"/></sheetPr>');
  const maxRow = Math.max(1, sheet.rowCount);
  const maxCol = Math.max(0, sheet.columns.length - 1);
  xml.append(`<dimension ref="A1:${colToA1(maxCol)}${maxRow}"/>`);
  xml.append('<sheetViews><sheetView workbookViewId="0">');
  if ((sheet.frozenRows ?? 0) > 0 || (sheet.frozenCols ?? 0) > 0) {
    const topLeft = `${colToA1(sheet.frozenCols ?? 0)}${(sheet.frozenRows ?? 0) + 1}`;
    const activePane =
      sheet.frozenRows && sheet.frozenCols
        ? "bottomRight"
        : sheet.frozenRows
          ? "bottomLeft"
          : "topRight";
    xml.append(
      `<pane${sheet.frozenCols ? ` xSplit="${sheet.frozenCols}"` : ""}${sheet.frozenRows ? ` ySplit="${sheet.frozenRows}"` : ""} topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>`,
    );
  }
  xml.append('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
  if (sheet.columns.length > 0) {
    xml.append("<cols>");
    for (let index = 0; index < sheet.columns.length; index++) {
      const column = sheet.columns[index]!;
      const width = Math.max(1, Math.round(((column.width - 5) / 7) * 100) / 100);
      const styleId = styles.register(column.cellStyle, column.numberFormat);
      xml.append(
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${column.visible === false ? ' hidden="1"' : ""}${styleId ? ` style="${styleId}"` : ""}/>`,
      );
    }
    xml.append("</cols>");
  }
  xml.append("<sheetData>");
  let processed = 0;
  for (const row of [...rows].sort((left, right) => left - right)) {
    const meta = rowMetadata.get(row);
    const hidden = meta?.hidden || collapsedOutlineRows.has(row);
    const outlineLevel = outlineLevels.get(row);
    xml.append(
      `<row r="${row + 1}"${meta?.height !== undefined ? ` ht="${(meta.height * 72) / 96}" customHeight="1"` : ""}${hidden ? ' hidden="1"' : ""}${outlineLevel ? ` outlineLevel="${outlineLevel}"` : ""}${collapsedSummaries.has(row) ? ' collapsed="1"' : ""}>`,
    );
    for (const cell of (byRow.get(row) ?? []).sort((left, right) => left.col - right.col)) {
      processed += 1;
      if ((processed & 4_095) === 0) checkAbort(context.options);
      xml.append(cellXml(snapshot, sheet, cell, styles, context));
    }
    xml.append("</row>");
  }
  xml.append("</sheetData>");
  if (sheet.sortKeys?.length && sheet.rowCount > 0) {
    const reference = `A1:${colToA1(maxCol)}${maxRow}`;
    xml.append(`<sortState ref="${reference}">`);
    for (const key of sheet.sortKeys) {
      xml.append(
        `<sortCondition ref="${colToA1(key.col)}1:${colToA1(key.col)}${maxRow}"${key.ascending ? "" : ' descending="1"'}/>`,
      );
    }
    xml.append("</sortState>");
  }
  if (sheet.merges?.length) {
    xml.append(`<mergeCells count="${sheet.merges.length}">`);
    for (const merge of sheet.merges) {
      xml.append(
        `<mergeCell ref="${colToA1(merge.c0)}${merge.r0 + 1}:${colToA1(merge.c1)}${merge.r1 + 1}"/>`,
      );
    }
    xml.append("</mergeCells>");
  }
  if (sheet.conditionalFormats?.length) {
    for (let index = 0; index < sheet.conditionalFormats.length; index++) {
      const rule = sheet.conditionalFormats[index]!;
      const encoded = conditionalFormatXml(
        rule,
        styles.registerDifferential(rule.style),
        index + 1,
      );
      if (encoded) xml.append(encoded);
      else
        emitWarning(context, {
          code: "format-loss",
          message:
            "Case-sensitive contains conditional formatting has no equivalent SpreadsheetML rule and remains in Sheetwrite metadata",
          sheet: sheet.name,
        });
    }
  }
  if (sheet.validationRules?.length) {
    const validations: string[] = [];
    for (const rule of sheet.validationRules) {
      const encoded = validationXml(rule, context, sheet.name);
      if (encoded) validations.push(encoded);
      else
        emitWarning(context, {
          code: "validation-loss",
          message: `Validation rule "${rule.id}" is preserved in Sheetwrite metadata but cannot be encoded as an unambiguous 255-character inline validation`,
          sheet: sheet.name,
        });
    }
    if (validations.length > 0)
      xml.append(
        `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`,
      );
  }
  if (sheet.protectedRanges?.length) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "Host-resolved protected ranges are authorization callbacks, while Excel locked cells are static editing hints; emitting sheetProtection would falsely deny or grant access, so ranges remain in Sheetwrite metadata",
      sheet: sheet.name,
    });
  }
  if (sheet.filters?.length) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "Excel autoFilter always excludes a header row, but Sheetwrite filters every data row; native emission would change which row is filtered, so filters remain in Sheetwrite metadata",
      sheet: sheet.name,
    });
  }
  let relationships: Uint8Array | undefined;
  let comments: Uint8Array | undefined;
  let vml: Uint8Array | undefined;
  if (sheet.notes?.length) {
    xml.append('<legacyDrawing r:id="rId2"/>');
    relationships = relationshipsXml(
      [
        { id: "rId1", type: COMMENTS_REL, target: `../comments${sheetNumber}.xml` },
        { id: "rId2", type: VML_REL, target: `../drawings/vmlDrawing${sheetNumber}.vml` },
      ],
      context,
    );
    comments = commentsXml(sheet, context);
    vml = commentsVml(sheet, context);
  }
  xml.append("</worksheet>");
  return { xml: xml.finish(), relationships, comments, vml };
}

function metadataSheetXml(snapshot: WorkbookSnapshot, context: XlsxCodecContext): Uint8Array {
  const json = JSON.stringify(canonicalJsonValue(metadataSnapshot(snapshot)));
  const chunks = [META_MARKER];
  let chunkParts: string[] = [];
  let chunkBytes = 0;
  for (const character of json) {
    const encoded = encodeXstring(character);
    const codePoint = character.codePointAt(0)!;
    const bytes =
      encoded.length !== character.length
        ? encoded.length
        : codePoint <= 0x7f
          ? 1
          : codePoint <= 0x7ff
            ? 2
            : codePoint <= 0xffff
              ? 3
              : 4;
    if (chunkBytes + bytes > META_CHUNK && chunkParts.length > 0) {
      chunks.push(chunkParts.join(""));
      chunkParts = [];
      chunkBytes = 0;
    }
    chunkParts.push(character);
    chunkBytes += bytes;
  }
  if (chunkParts.length > 0) chunks.push(chunkParts.join(""));
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<worksheet xmlns="${MAIN_NS}"><dimension ref="A1:A${chunks.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>`,
  );
  for (let index = 0; index < chunks.length; index++) {
    xml.append(
      `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">`,
    );
    xml.appendText(chunks[index]!);
    xml.append("</t></is></c></row>");
  }
  xml.append("</sheetData></worksheet>");
  return xml.finish();
}

function workbookXml(
  snapshot: WorkbookSnapshot,
  ordered: readonly SheetSnapshot[],
  metadataName: string,
  context: XlsxCodecContext,
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  const requestedActive = ordered.findIndex((sheet) => sheet.id === snapshot.workbook.activeSheet);
  const activeSheet = ordered[requestedActive];
  const activeTab =
    activeSheet?.visibility === "hidden" || activeSheet?.visibility === "veryHidden"
      ? ordered.findIndex(
          (sheet) => sheet.visibility !== "hidden" && sheet.visibility !== "veryHidden",
        )
      : Math.max(0, requestedActive);
  if (activeTab !== requestedActive) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "A hidden active sheet was preserved, but native Excel activation moved to the first visible sheet",
      sheet: activeSheet?.name,
    });
  }
  xml.append(
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView activeTab="${activeTab}"/></bookViews><sheets>`,
  );
  for (let index = 0; index < ordered.length; index++) {
    const sheet = ordered[index]!;
    const state =
      sheet.visibility === "hidden" || sheet.visibility === "veryHidden"
        ? ` state="${sheet.visibility}"`
        : "";
    xml.append(
      `<sheet name="${escapeXml(encodeXstring(sheet.name))}" sheetId="${index + 1}"${state} r:id="rId${index + 1}"/>`,
    );
  }
  xml.append(
    `<sheet name="${escapeXml(encodeXstring(metadataName))}" sheetId="${ordered.length + 1}" state="veryHidden" r:id="rId${ordered.length + 1}"/></sheets>`,
  );
  if (snapshot.workbook.namedRanges?.length) {
    xml.append("<definedNames>");
    for (const named of snapshot.workbook.namedRanges) {
      const sheet = snapshot.sheets.find((candidate) => candidate.id === named.range.sheet);
      if (!sheet) continue;
      const scopeIndex =
        named.scope === undefined
          ? undefined
          : ordered.findIndex((candidate) => candidate.id === named.scope);
      const range = named.range;
      xml.append(
        `<definedName name="${escapeXml(encodeXstring(named.name))}"${scopeIndex !== undefined && scopeIndex >= 0 ? ` localSheetId="${scopeIndex}"` : ""}>${escapeXml(encodeXstring(`${quotedSheet(sheet.name)}!$${colToA1(range.start.col)}$${range.start.row + 1}:$${colToA1(range.end.col)}$${range.end.row + 1}`))}</definedName>`,
      );
    }
    xml.append("</definedNames>");
  }
  xml.append('<calcPr fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
  return xml.finish();
}

/** Write a deterministic, bounded OOXML workbook package. */
export function writeWorkbook(snapshot: WorkbookSnapshot, context: XlsxCodecContext): Uint8Array {
  preflightSnapshot(snapshot, context);
  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      `Sheetwrite: invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
    );
  }
  snapshot = checked.value;
  if (snapshot.sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX export requires at least one sheet");
  validateNames(snapshot);
  const ordered = [...snapshot.sheets].sort((left, right) => left.order - right.order);
  const metadataName = metadataSheetName(snapshot);
  const styles = new StylesRegistry(context);
  const parts = new Map<string, Uint8Array>();
  const overrides: ContentTypeOverride[] = [
    { part: "xl/workbook.xml", contentType: WORKBOOK_CONTENT },
    { part: "xl/styles.xml", contentType: STYLES_CONTENT },
  ];
  const workbookRelationships = [];
  for (let index = 0; index < ordered.length; index++) {
    checkAbort(context.options);
    const number = index + 1;
    const part = `xl/worksheets/sheet${number}.xml`;
    const result = writeSheet(snapshot, ordered[index]!, styles, context, number);
    parts.set(part, result.xml);
    overrides.push({ part, contentType: WORKSHEET_CONTENT });
    workbookRelationships.push({
      id: `rId${number}`,
      type: WORKSHEET_REL,
      target: `worksheets/sheet${number}.xml`,
    });
    if (result.relationships && result.comments && result.vml) {
      parts.set(`xl/worksheets/_rels/sheet${number}.xml.rels`, result.relationships);
      parts.set(`xl/comments${number}.xml`, result.comments);
      parts.set(`xl/drawings/vmlDrawing${number}.vml`, result.vml);
      overrides.push({ part: `xl/comments${number}.xml`, contentType: COMMENTS_CONTENT });
      overrides.push({ part: `xl/drawings/vmlDrawing${number}.vml`, contentType: VML_CONTENT });
    }
  }
  const metadataNumber = ordered.length + 1;
  const metadataPart = `xl/worksheets/sheet${metadataNumber}.xml`;
  parts.set(metadataPart, metadataSheetXml(snapshot, context));
  overrides.push({ part: metadataPart, contentType: WORKSHEET_CONTENT });
  workbookRelationships.push({
    id: `rId${metadataNumber}`,
    type: WORKSHEET_REL,
    target: `worksheets/sheet${metadataNumber}.xml`,
  });
  workbookRelationships.push({
    id: `rId${metadataNumber + 1}`,
    type: STYLES_REL,
    target: "styles.xml",
  });
  parts.set("xl/styles.xml", styles.toXml());
  parts.set("xl/workbook.xml", workbookXml(snapshot, ordered, metadataName, context));
  parts.set("xl/_rels/workbook.xml.rels", relationshipsXml(workbookRelationships, context));
  parts.set(
    "_rels/.rels",
    relationshipsXml(
      [{ id: "rId1", type: OFFICE_DOCUMENT_REL, target: "xl/workbook.xml" }],
      context,
    ),
  );
  parts.set("[Content_Types].xml", contentTypesXml(overrides, context));
  return writeZip(parts, context);
}
