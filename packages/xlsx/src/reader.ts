import type {
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatPredicate,
  ConditionalFormatRule,
  DataValidationComparison,
  DataValidationCondition,
  DataValidationRule,
  MergeRange,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { colToA1, dateToSerial, labelToCol } from "@sheetwrite/core";
import { formulaContainsExternalReference } from "./formula.js";
import { OpcPackage, type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import {
  assertResource,
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import { type ParsedCellStyle, ParsedStyles } from "./styles.js";
import {
  assertXmlRoot,
  decodeXstring,
  isValidXlsxWorksheetName,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";

const META_MARKER = "sheetwrite-workbook-metadata-v1";
const META_STEM = "__sheetwrite_meta__";
const MAIN_NAMESPACES = [
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://purl.oclc.org/ooxml/spreadsheetml/main",
] as const;

interface ParsedCell {
  readonly row: number;
  readonly col: number;
  value: CellValue | null;
  readonly style?: CellStyle;
  readonly styleRecord: ParsedCellStyle;
  readonly address: string;
  readonly sharedFormula?: string;
}

interface ParsedValidation {
  readonly range: Omit<DataValidationRule["range"], "sheet">;
  readonly condition: DataValidationCondition;
  readonly policy: DataValidationRule["policy"];
  readonly allowBlank?: boolean;
  readonly helpText?: string;
}

interface ParsedSheet {
  readonly name: string;
  readonly state: string | undefined;
  readonly part: string;
  readonly cells: ParsedCell[];
  readonly rowCount: number;
  readonly columnCount: number;
  readonly conditionalFormats: ConditionalFormatRule[];
  readonly sortKeys: NonNullable<SheetSnapshot["sortKeys"]>;
  readonly columns: Map<number, Partial<Column>>;
  readonly rowMeta: NonNullable<SheetSnapshot["rowMeta"]>;
  readonly merges: MergeRange[];
  readonly frozenRows?: number;
  readonly frozenCols?: number;
  readonly rowGroups: NonNullable<SheetSnapshot["rowGroups"]>;
  readonly validations: ParsedValidation[];
  readonly notes: { row: number; col: number; text: string }[];
  readonly hasRowOutlines: boolean;
  readonly hasUnsupportedValidation: boolean;
  readonly hasConditionalFormatting: boolean;
  readonly hasUnsupportedConditionalFormatting: boolean;
  readonly hasUnsupportedSortState: boolean;
  readonly hasSortState: boolean;
  readonly hasProtection: boolean;
  readonly hasAutoFilter: boolean;
  readonly hasValidationCollection: boolean;
  readonly hasComments: boolean;
}

interface WorkbookSheetReference {
  readonly name: string;
  readonly state: string | undefined;
  readonly relationship: OpcRelationship;
}

interface ReaderResourceUsage {
  cells: number;
  merges: number;
}

function readerFailure(message: string): never {
  throw new TypeError(`Sheetwrite: invalid XLSX workbook: ${message}`);
}

function displayText(element: XmlElement): string {
  if (xmlLocalName(element.name) === "t") return decodeXstring(element.text);
  let text = "";
  for (const child of element.children) {
    const localName = xmlLocalName(child.name);
    if (localName === "t") text += decodeXstring(child.text);
    else if (localName === "r") {
      for (const runText of xmlChildren(child, "t")) text += decodeXstring(runText.text);
    }
  }
  return text;
}

function strictDateSerial(value: string, address: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const dateTimeWithoutZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !hasZone;
  const parsed = new Date(dateTimeWithoutZone ? `${value}Z` : value);
  if (!Number.isFinite(parsed.getTime()))
    return readerFailure(`date value at ${address} is invalid`);
  return dateToSerial(parsed);
}

function parseUnsigned(value: string | undefined, description: string): number {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return readerFailure(`${description} is invalid`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) return readerFailure(`${description} is invalid`);
  return parsed;
}

function parseCellAddress(value: string): { row: number; col: number } {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(value);
  if (!match) return readerFailure(`cell reference ${value} is invalid`);
  const row = Number(match[2]) - 1;
  if (!Number.isSafeInteger(row)) return readerFailure(`cell reference ${value} is invalid`);
  return { row, col: labelToCol(match[1]!) };
}

function parseRange(value: string): MergeRange {
  const parts = value.split(":");
  if (parts.length > 2) return readerFailure(`range ${value} is invalid`);
  const [startRaw, endRaw = startRaw] = parts;
  if (!startRaw || !endRaw) return readerFailure(`range ${value} is invalid`);
  const start = parseCellAddress(startRaw);
  const end = parseCellAddress(endRaw);
  return {
    r0: Math.min(start.row, end.row),
    c0: Math.min(start.col, end.col),
    r1: Math.max(start.row, end.row),
    c1: Math.max(start.col, end.col),
  };
}

function uniqueSheetId(name: string, order: number, used: Set<string>): string {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `sheet-${order + 1}`;
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}-${suffix++}`;
  used.add(id);
  return id;
}

function translateFormula(
  formula: string,
  masterRow: number,
  masterCol: number,
  row: number,
  col: number,
): string {
  const rowDelta = row - masterRow;
  const colDelta = col - masterCol;
  const translateSegment = (segment: string): string =>
    segment.replace(
      /(?<![A-Z0-9_.])(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)(?![A-Z0-9_.(!])/gi,
      (_match, absoluteCol: string, label: string, absoluteRow: string, rowText: string) => {
        const sourceCol = labelToCol(label);
        const sourceRow = Number(rowText) - 1;
        const targetCol = absoluteCol ? sourceCol : sourceCol + colDelta;
        const targetRow = absoluteRow ? sourceRow : sourceRow + rowDelta;
        if (targetCol < 0 || targetRow < 0) return "#REF!";
        return `${absoluteCol}${colToA1(targetCol)}${absoluteRow}${targetRow + 1}`;
      },
    );
  let output = "";
  let segmentStart = 0;
  for (let cursor = 0; cursor < formula.length; ) {
    const quote = formula[cursor];
    const closing = quote === '"' ? '"' : quote === "'" ? "'" : quote === "[" ? "]" : "";
    if (!closing) {
      cursor += 1;
      continue;
    }
    output += translateSegment(formula.slice(segmentStart, cursor));
    let end = cursor + 1;
    while (end < formula.length) {
      if (formula[end] === closing && formula[end + 1] === closing && closing !== "]") {
        end += 2;
      } else if (formula[end] === closing) {
        end += 1;
        break;
      } else {
        end += 1;
      }
    }
    output += formula.slice(cursor, end);
    cursor = end;
    segmentStart = end;
  }
  return output + translateSegment(formula.slice(segmentStart));
}

function parseSharedStrings(
  packageFile: OpcPackage,
  part: string | undefined,
  context: XlsxCodecContext,
): string[] {
  if (!part) return [];
  const root = packageFile.readXml(part);
  assertXmlRoot(root, "sst", MAIN_NAMESPACES, part);
  const strings: string[] = [];
  let warnedRichText = false;
  let warnedPhonetic = false;
  for (const item of xmlChildren(root, "si")) {
    assertResource(context, "maxSharedStrings", strings.length + 1);
    const richRuns = xmlChildren(item, "r");
    if (richRuns.length > 0 && !warnedRichText) {
      warnedRichText = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Rich text formatting was flattened",
        part,
      });
    }
    if (!warnedPhonetic && (xmlChildren(item, "rPh").length > 0 || xmlChild(item, "phoneticPr"))) {
      warnedPhonetic = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed shared string",
        part,
      });
    }
    strings.push(displayText(item));
  }
  return strings;
}

function literalFromCell(
  cell: XmlElement,
  type: string | undefined,
  sharedStrings: readonly string[],
  style: ParsedCellStyle,
  context: XlsxCodecContext,
  sheet: string,
  address: string,
  date1904: boolean,
): CellValue | null {
  const valueText = xmlChild(cell, "v")?.text ?? "";
  if (type === "inlineStr") {
    const inline = xmlChild(cell, "is") ?? cell;
    if (xmlChildren(inline, "r").length > 0) {
      emitWarning(context, {
        code: "rich-text",
        message: "Inline rich text formatting was flattened",
        sheet,
        cell: address,
      });
    }
    if (xmlChildren(inline, "rPh").length > 0 || xmlChild(inline, "phoneticPr")) {
      emitWarning(context, {
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed inline string",
        sheet,
        cell: address,
      });
    }
    return { kind: "literal", value: displayText(inline) };
  }
  if (type === "s") {
    const index = parseUnsigned(valueText, `shared string index at ${address}`);
    const value = sharedStrings[index];
    if (value === undefined)
      return readerFailure(`shared string index ${index} at ${address} is out of range`);
    return { kind: "literal", value };
  }
  if (type === "str") return { kind: "literal", value: decodeXstring(valueText) };
  if (type === "b")
    return { kind: "literal", value: valueText === "1" || valueText.toLowerCase() === "true" };
  if (type === "d") {
    return { kind: "literal", value: strictDateSerial(valueText, address) };
  }
  if (type === "e") {
    emitWarning(context, {
      code: "unsupported-cell-value",
      message: "Unbound Excel error was preserved as text",
      sheet,
      cell: address,
    });
    return { kind: "literal", value: valueText };
  }
  if (valueText === "") return style.style ? { kind: "literal", value: null } : null;
  const number = Number(valueText);
  if (!Number.isFinite(number)) return readerFailure(`numeric value at ${address} is invalid`);
  return { kind: "literal", value: style.date && date1904 ? number + 1462 : number };
}

function parseValidation(
  element: XmlElement,
  context: XlsxCodecContext,
  sheet: string,
  date1904: boolean,
): ParsedValidation[] {
  const type = xmlAttribute(element, "type") ?? "none";
  const ranges = (xmlAttribute(element, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
  const formula1 = xmlChild(element, "formula1")?.text;
  const formula2 = xmlChild(element, "formula2")?.text;
  let condition: DataValidationCondition | undefined;
  if (type === "list" && formula1?.startsWith('"') && formula1.endsWith('"')) {
    const body = formula1.slice(1, -1);
    const values: CellScalar[] = [];
    let value = "";
    for (let index = 0; index <= body.length; index++) {
      const character = body[index];
      if (character === '"' && body[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === "," || index === body.length) {
        const decoded = decodeXstring(value);
        values.push(decoded === "TRUE" ? true : decoded === "FALSE" ? false : decoded);
        value = "";
      } else {
        value += character ?? "";
      }
    }
    condition = { kind: "list", values };
  } else if (type === "decimal" || type === "whole" || type === "date" || type === "textLength") {
    let first = formula1 === undefined ? undefined : Number(formula1);
    let second = formula2 === undefined ? undefined : Number(formula2);
    if (
      (first !== undefined && !Number.isFinite(first)) ||
      (second !== undefined && !Number.isFinite(second))
    ) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Formula-based Excel validation was dropped",
        sheet,
      });
      return [];
    }
    if (type === "date" && date1904) {
      if (first !== undefined) first += 1462;
      if (second !== undefined) second += 1462;
    }
    const operator = xmlAttribute(element, "operator") ?? "between";
    const bounds: { min?: number; max?: number } = {};
    let comparison: DataValidationComparison | undefined;
    if (operator === "between" && first !== undefined && second !== undefined && first <= second) {
      bounds.min = first;
      bounds.max = second;
    } else if (
      operator === "notBetween" &&
      first !== undefined &&
      second !== undefined &&
      first <= second
    ) {
      comparison = { operator, min: first, max: second };
    } else if (operator === "equal" && first !== undefined) {
      bounds.min = first;
      bounds.max = first;
    } else if (operator === "greaterThanOrEqual" && first !== undefined) {
      bounds.min = first;
    } else if (operator === "lessThanOrEqual" && first !== undefined) {
      bounds.max = first;
    } else if (
      (operator === "notEqual" || operator === "greaterThan" || operator === "lessThan") &&
      first !== undefined
    ) {
      comparison = { operator, value: first };
    } else {
      emitWarning(context, {
        code: "validation-loss",
        message: `Excel validation operator ${operator} could not be represented without broadening and was dropped`,
        sheet,
      });
      return [];
    }
    const textLengthOperandValid =
      comparison === undefined
        ? (bounds.min === undefined || (Number.isSafeInteger(bounds.min) && bounds.min >= 0)) &&
          (bounds.max === undefined || (Number.isSafeInteger(bounds.max) && bounds.max >= 0))
        : "value" in comparison
          ? Number.isSafeInteger(comparison.value) && comparison.value >= 0
          : Number.isSafeInteger(comparison.min) &&
            comparison.min >= 0 &&
            Number.isSafeInteger(comparison.max) &&
            comparison.max >= 0;
    if (type === "textLength" && !textLengthOperandValid) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Non-integer or negative text-length validation was dropped",
        sheet,
      });
      return [];
    }
    const comparisonFields = comparison === undefined ? bounds : { comparison };
    condition =
      type === "date"
        ? { kind: "date", ...comparisonFields }
        : type === "textLength"
          ? { kind: "textLength", ...comparisonFields }
          : {
              kind: "number",
              ...comparisonFields,
              ...(type === "whole" ? { integer: true } : {}),
            };
  }
  if (!condition || ranges.length === 0) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Excel validation type ${type} was dropped`,
      sheet,
    });
    return [];
  }
  const showError = xmlBoolean(xmlAttribute(element, "showErrorMessage"));
  const errorStyle = xmlAttribute(element, "errorStyle") ?? "stop";
  const policy: DataValidationRule["policy"] = !showError
    ? "allow"
    : errorStyle === "stop"
      ? "reject"
      : "warn";
  const prompt = xmlAttribute(element, "prompt");
  const error = xmlAttribute(element, "error");
  let helpText = prompt ?? error;
  if (prompt !== undefined && error !== undefined && prompt !== error) {
    emitWarning(context, {
      code: "validation-loss",
      message: "Distinct Excel validation prompt and error text were reduced to the prompt",
      sheet,
    });
  }
  if (helpText && Array.from(helpText).length > 255) {
    emitWarning(context, {
      code: "validation-loss",
      message: "Excel validation prompt/error exceeded 255 characters and was dropped",
      sheet,
    });
    helpText = undefined;
  }
  return ranges.map((rangeText) => {
    const range = parseRange(rangeText);
    return {
      range: { start: { row: range.r0, col: range.c0 }, end: { row: range.r1, col: range.c1 } },
      condition: structuredClone(condition),
      policy,
      allowBlank: xmlBoolean(xmlAttribute(element, "allowBlank")),
      ...(helpText ? { helpText: decodeXstring(helpText) } : {}),
    };
  });
}

function conditionalScalar(formula: string | undefined): CellScalar | undefined {
  if (formula === undefined) return undefined;
  const value = formula.trim();
  if (/^TRUE$/i.test(value)) return true;
  if (/^FALSE$/i.test(value)) return false;
  if (value.startsWith('"') && value.endsWith('"')) {
    return decodeXstring(value.slice(1, -1).replaceAll('""', '"'));
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseConditionalFormats(
  root: XmlElement,
  styles: ParsedStyles,
  sheet: string,
): { rules: ConditionalFormatRule[]; unsupported: boolean } {
  const parsed: { priority: number; rule: ConditionalFormatRule }[] = [];
  let unsupported = false;
  for (const collection of xmlChildren(root, "conditionalFormatting")) {
    const ranges = (xmlAttribute(collection, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
    for (const element of xmlChildren(collection, "cfRule")) {
      const type = xmlAttribute(element, "type");
      const operator = xmlAttribute(element, "operator");
      const formula = xmlChild(element, "formula")?.text;
      let when: ConditionalFormatPredicate | undefined;
      if (type === "cellIs") {
        const value = conditionalScalar(formula);
        if (value !== undefined) {
          when =
            operator === "greaterThan" && typeof value === "number"
              ? { kind: "greaterThan", value }
              : operator === "lessThan" && typeof value === "number"
                ? { kind: "lessThan", value }
                : operator === "equal"
                  ? { kind: "equal", value }
                  : undefined;
        }
      } else if (type === "containsBlanks") {
        when = { kind: "equal", value: null };
      } else if (type === "containsText") {
        const text = xmlAttribute(element, "text");
        if (text !== undefined) when = { kind: "contains", text: decodeXstring(text) };
      } else if (type === "expression" && formula) {
        const match = /^ISNUMBER\(FIND\("((?:[^"]|"")*)",[^)]+\)\)$/i.exec(formula.trim());
        if (match) {
          when = {
            kind: "contains",
            text: decodeXstring(match[1]!.replaceAll('""', '"')),
            matchCase: true,
          };
        }
      }
      const rawDxf = xmlAttribute(element, "dxfId");
      if (!when || ranges.length === 0 || (rawDxf !== undefined && !/^\d+$/.test(rawDxf))) {
        unsupported = true;
        continue;
      }
      let style: CellStyle = {};
      if (rawDxf !== undefined) {
        try {
          style = styles.differentialAt(Number(rawDxf));
        } catch {
          unsupported = true;
          continue;
        }
      }
      for (const rangeText of ranges) {
        const range = parseRange(rangeText);
        parsed.push({
          priority: Number(xmlAttribute(element, "priority") ?? Number.MAX_SAFE_INTEGER),
          rule: {
            range: {
              sheet,
              start: { row: range.r0, col: range.c0 },
              end: { row: range.r1, col: range.c1 },
            },
            when: structuredClone(when),
            style: structuredClone(style),
          },
        });
      }
    }
  }
  parsed.sort((left, right) => left.priority - right.priority);
  return { rules: parsed.map((entry) => entry.rule), unsupported };
}

function parseSortKeys(
  root: XmlElement,
  rowCount: number,
): { keys: NonNullable<SheetSnapshot["sortKeys"]>; unsupported: boolean } {
  const state = xmlChild(root, "sortState");
  if (!state) return { keys: [], unsupported: false };
  const keys: NonNullable<SheetSnapshot["sortKeys"]> = [];
  let unsupported = false;
  for (const condition of xmlChildren(state, "sortCondition")) {
    const reference = xmlAttribute(condition, "ref");
    if (!reference) {
      unsupported = true;
      continue;
    }
    const range = parseRange(reference);
    if (range.c0 !== range.c1 || range.r0 !== 0 || range.r1 < Math.max(0, rowCount - 1)) {
      unsupported = true;
      continue;
    }
    keys.push({
      col: range.c0,
      ascending: !xmlBoolean(xmlAttribute(condition, "descending")),
    });
  }
  return { keys, unsupported };
}

function parseComments(
  packageFile: OpcPackage,
  sheetPart: string,
  relationships: readonly OpcRelationship[],
  context: XlsxCodecContext,
): { comments: { row: number; col: number; text: string }[]; present: boolean } {
  const relationship = relationships.find(
    (candidate) => relationshipTypeMatches(candidate.type, "comments") && !candidate.external,
  );
  if (!relationship) return { comments: [], present: false };
  const root = packageFile.readXml(relationship.target);
  assertXmlRoot(root, "comments", MAIN_NAMESPACES, relationship.target);
  const list = xmlChild(root, "commentList");
  if (!list) return { comments: [], present: true };
  const comments = xmlChildren(list, "comment").map((comment) => {
    const reference = xmlAttribute(comment, "ref");
    if (!reference) return readerFailure(`comment in ${sheetPart} has no cell reference`);
    const address = parseCellAddress(reference);
    const text = xmlChild(comment, "text") ?? comment;
    if (xmlChildren(text, "r").length > 0) {
      emitWarning(context, {
        code: "rich-text",
        message: "Comment rich text formatting was flattened",
        part: relationship.target,
        cell: reference,
      });
    }
    return { ...address, text: displayText(text) };
  });
  return { comments, present: true };
}

function parseColumns(
  root: XmlElement,
  styles: ParsedStyles,
  context: XlsxCodecContext,
  part: string,
): Map<number, Partial<Column>> {
  const columns = new Map<number, Partial<Column>>();
  const collection = xmlChild(root, "cols");
  if (!collection) return columns;
  for (const element of xmlChildren(collection, "col")) {
    const min = parseUnsigned(xmlAttribute(element, "min"), "column minimum");
    const max = parseUnsigned(xmlAttribute(element, "max"), "column maximum");
    if (min < 1 || max < min) return readerFailure("column range is invalid");
    assertResource(context, "maxColumnsPerSheet", max);
    const columnOutline = Number(xmlAttribute(element, "outlineLevel") ?? 0);
    if (!Number.isInteger(columnOutline) || columnOutline < 0 || columnOutline > 7) {
      return readerFailure("column outline level is invalid");
    }
    if (columnOutline > 0 || xmlBoolean(xmlAttribute(element, "collapsed"))) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel column outline/collapsed presentation cannot be represented and was dropped",
        part,
      });
    }
    const widthText = xmlAttribute(element, "width");
    const widthChars = widthText === undefined ? undefined : Number(widthText);
    if (widthChars !== undefined && (!Number.isFinite(widthChars) || widthChars <= 0)) {
      return readerFailure("column width is invalid");
    }
    const styleText = xmlAttribute(element, "style");
    const style =
      styleText === undefined ? undefined : styles.at(parseUnsigned(styleText, "column style"));
    const type: Column["type"] | undefined = style?.date
      ? "date"
      : style?.numberFormat
        ? /[$€£¥]|currency/i.test(style.numberFormat)
          ? "currency"
          : "number"
        : undefined;
    for (let index = min - 1; index < max; index++) {
      columns.set(index, {
        ...(widthChars !== undefined ? { width: Math.max(1, Math.round(widthChars * 7 + 5)) } : {}),
        ...(xmlAttribute(element, "hidden") !== undefined
          ? { visible: !xmlBoolean(xmlAttribute(element, "hidden")) }
          : {}),
        ...(style?.style ? { cellStyle: structuredClone(style.style) } : {}),
        ...(style?.numberFormat ? { numberFormat: style.numberFormat } : {}),
        ...(type ? { type } : {}),
      });
    }
  }
  return columns;
}

function parseSheet(
  packageFile: OpcPackage,
  reference: WorkbookSheetReference,
  styles: ParsedStyles,
  sharedStrings: readonly string[],
  context: XlsxCodecContext,
  usage: ReaderResourceUsage,
  date1904: boolean,
): ParsedSheet {
  const root = packageFile.readXml(reference.relationship.target);
  assertXmlRoot(root, "worksheet", MAIN_NAMESPACES, reference.relationship.target);
  const sheetData = xmlChild(root, "sheetData");
  const inheritedColumnStyles = new Map<number, string>();
  const columnCollection = xmlChild(root, "cols");
  for (const columnElement of columnCollection ? xmlChildren(columnCollection, "col") : []) {
    const style = xmlAttribute(columnElement, "style");
    if (style === undefined) continue;
    const min = parseUnsigned(xmlAttribute(columnElement, "min"), "column minimum");
    const max = parseUnsigned(xmlAttribute(columnElement, "max"), "column maximum");
    if (min < 1 || max < min) return readerFailure("column range is invalid");
    assertResource(context, "maxColumnsPerSheet", max);
    for (let index = min - 1; index < max; index++) inheritedColumnStyles.set(index, style);
  }
  const cells: ParsedCell[] = [];
  const sharedMasters = new Map<
    string,
    { formula: string; row: number; col: number; authoritative: boolean }
  >();
  let inferredRow = 0;
  let maxRow = -1;
  let maxCol = -1;
  const rowMeta: NonNullable<SheetSnapshot["rowMeta"]> = [];
  const outlineLevels = new Map<number, number>();
  const collapsedRows = new Set<number>();
  let internalMetadata = false;
  for (const rowElement of sheetData ? xmlChildren(sheetData, "row") : []) {
    const row =
      xmlAttribute(rowElement, "r") === undefined
        ? inferredRow
        : parseUnsigned(xmlAttribute(rowElement, "r"), "row number") - 1;
    if (row < 0) return readerFailure(`row number in ${reference.name} is invalid`);
    assertResource(context, "maxRowsPerSheet", row + 1);
    inferredRow = row + 1;
    maxRow = Math.max(maxRow, row);
    const heightPoints = Number(xmlAttribute(rowElement, "ht"));
    const hidden = xmlBoolean(xmlAttribute(rowElement, "hidden"));
    const outlineLevel = Number(xmlAttribute(rowElement, "outlineLevel") ?? 0);
    if (!Number.isInteger(outlineLevel) || outlineLevel < 0 || outlineLevel > 7) {
      return readerFailure(`row outline level in ${reference.name} is invalid`);
    }
    if (outlineLevel > 0) outlineLevels.set(row, outlineLevel);
    if (xmlBoolean(xmlAttribute(rowElement, "collapsed"))) collapsedRows.add(row);
    if ((Number.isFinite(heightPoints) && heightPoints > 0) || hidden) {
      rowMeta.push([
        row,
        {
          ...(Number.isFinite(heightPoints) && heightPoints > 0
            ? { height: (heightPoints * 96) / 72 }
            : {}),
          ...(hidden ? { hidden: true } : {}),
        },
      ]);
    }
    const rowStyle = xmlBoolean(xmlAttribute(rowElement, "customFormat"))
      ? xmlAttribute(rowElement, "s")
      : undefined;
    let inferredCol = 0;
    for (const cellElement of xmlChildren(rowElement, "c")) {
      const addressText = xmlAttribute(cellElement, "r") ?? `${colToA1(inferredCol)}${row + 1}`;
      const address = parseCellAddress(addressText);
      if (address.row !== row) return readerFailure(`cell ${addressText} is outside its row`);
      inferredCol = address.col + 1;
      assertResource(context, "maxColumnsPerSheet", address.col + 1);
      maxCol = Math.max(maxCol, address.col);
      const styleIndex = parseUnsigned(
        xmlAttribute(cellElement, "s") ?? rowStyle ?? inheritedColumnStyles.get(address.col) ?? "0",
        `style index at ${addressText}`,
      );
      const styleRecord = styles.at(styleIndex);
      const formulaElement = xmlChild(cellElement, "f");
      let value: CellValue | null;
      let sharedFormula: string | undefined;
      if (formulaElement) {
        const formulaText = decodeXstring(formulaElement.text);
        const formulaType = xmlAttribute(formulaElement, "t") ?? "normal";
        if (formulaType === "shared") {
          sharedFormula = xmlAttribute(formulaElement, "si");
          if (!sharedFormula) return readerFailure(`shared formula at ${addressText} has no index`);
          if (formulaText) {
            const authoritative = xmlAttribute(formulaElement, "ref") !== undefined;
            const existing = sharedMasters.get(sharedFormula);
            if (authoritative || !existing) {
              sharedMasters.set(sharedFormula, { formula: formulaText, ...address, authoritative });
            }
          }
          value = null;
        } else if (formulaType !== "normal") {
          emitWarning(context, {
            code: "unsupported-feature",
            message: `Excel ${formulaType} formula was neutralized because its range semantics are unsupported`,
            sheet: reference.name,
            cell: addressText,
          });
          value = formulaText ? { kind: "literal", value: `=${formulaText}` } : null;
        } else if (formulaContainsExternalReference(formulaText)) {
          emitWarning(context, {
            code: "external-formula",
            message: "External-data formula was neutralized as inert text",
            sheet: reference.name,
            cell: addressText,
          });
          value = { kind: "literal", value: `=${formulaText}` };
        } else {
          value = formulaText ? { kind: "formula", src: `=${formulaText}` } : null;
        }
      } else {
        value = literalFromCell(
          cellElement,
          xmlAttribute(cellElement, "t"),
          sharedStrings,
          styleRecord,
          context,
          reference.name,
          addressText,
          date1904,
        );
      }
      if (value || styleRecord.style || sharedFormula) {
        if (
          cells.length === 0 &&
          reference.name.startsWith(META_STEM) &&
          address.row === 0 &&
          address.col === 0 &&
          value?.kind === "literal" &&
          value.value === META_MARKER
        ) {
          internalMetadata = true;
        }
        if (!internalMetadata) {
          usage.cells += 1;
          assertResource(context, "maxCells", usage.cells);
        }
        cells.push({
          ...address,
          value,
          style: styleRecord.style ? structuredClone(styleRecord.style) : undefined,
          styleRecord,
          address: addressText,
          sharedFormula,
        });
      }
    }
  }
  for (const cell of cells) {
    if (!cell.sharedFormula) continue;
    const master = sharedMasters.get(cell.sharedFormula);
    if (!master) {
      return readerFailure(`shared formula ${cell.sharedFormula} at ${cell.address} has no master`);
    }
    const formula =
      cell.row === master.row && cell.col === master.col
        ? master.formula
        : translateFormula(master.formula, master.row, master.col, cell.row, cell.col);
    if (formulaContainsExternalReference(formula)) {
      emitWarning(context, {
        code: "external-formula",
        message: "External shared formula was neutralized as inert text",
        sheet: reference.name,
        cell: cell.address,
      });
      cell.value = { kind: "literal", value: `=${formula}` };
    } else {
      cell.value = { kind: "formula", src: `=${formula}` };
    }
  }
  const dimension = xmlAttribute(
    xmlChild(root, "dimension") ?? { attributes: {}, children: [], name: "", text: "" },
    "ref",
  );
  if (dimension) {
    const range = parseRange(dimension);
    assertResource(context, "maxRowsPerSheet", range.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", range.c1 + 1);
    maxRow = Math.max(maxRow, range.r1);
    maxCol = Math.max(maxCol, range.c1);
  }
  const columns = parseColumns(root, styles, context, reference.relationship.target);
  for (const index of columns.keys()) maxCol = Math.max(maxCol, index);
  const mergeElements = xmlChild(root, "mergeCells")
    ? xmlChildren(xmlChild(root, "mergeCells")!, "mergeCell")
    : [];
  usage.merges += mergeElements.length;
  assertResource(context, "maxMerges", usage.merges);
  const merges = mergeElements.map((merge) => {
    const value = xmlAttribute(merge, "ref");
    if (!value) return readerFailure(`merge in ${reference.name} has no range`);
    const parsed = parseRange(value);
    maxRow = Math.max(maxRow, parsed.r1);
    maxCol = Math.max(maxCol, parsed.c1);
    return parsed;
  });
  assertResource(context, "maxRowsPerSheet", maxRow + 1);
  assertResource(context, "maxColumnsPerSheet", maxCol + 1);
  const hiddenOutlineRows = new Set(
    rowMeta.filter(([, metadata]) => metadata.hidden).map(([row]) => row),
  );
  const rowGroups: NonNullable<SheetSnapshot["rowGroups"]> = [];
  const maxOutlineLevel = Math.max(0, ...outlineLevels.values());
  for (let level = 1; level <= maxOutlineLevel; level++) {
    let start: number | undefined;
    let previous = -2;
    const outlined = [...outlineLevels.entries()]
      .filter(([, rowLevel]) => rowLevel >= level)
      .map(([row]) => row)
      .sort((left, right) => left - right);
    for (const row of [...outlined, Number.NaN]) {
      if (start === undefined) {
        if (Number.isFinite(row)) {
          start = row;
          previous = row;
        }
      } else if (row === previous + 1) {
        previous = row;
      } else {
        rowGroups.push({
          start,
          end: previous,
          collapsed:
            collapsedRows.has(previous + 1) ||
            collapsedRows.has(previous) ||
            outlined
              .filter((candidate) => candidate >= start! && candidate <= previous)
              .every((candidate) => hiddenOutlineRows.has(candidate)),
        });
        start = Number.isFinite(row) ? row : undefined;
        previous = row;
      }
    }
  }
  const view = xmlChildren(xmlChild(root, "sheetViews") ?? root, "sheetView").at(-1);
  const pane = view ? xmlChild(view, "pane") : undefined;
  const paneState = pane ? xmlAttribute(pane, "state") : undefined;
  const frozen = paneState === "frozen" || paneState === "frozenSplit";
  const frozenRows = frozen ? Number(xmlAttribute(pane!, "ySplit") ?? 0) : 0;
  const frozenCols = frozen ? Number(xmlAttribute(pane!, "xSplit") ?? 0) : 0;
  if (view && xmlBoolean(xmlAttribute(view, "rightToLeft"))) {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Right-to-left worksheet view presentation was dropped",
      sheet: reference.name,
    });
  }
  if (
    view &&
    [xmlAttribute(view, "zoomScale"), xmlAttribute(view, "zoomScaleNormal")].some(
      (value) => value !== undefined && value !== "100",
    )
  ) {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Worksheet zoom presentation was dropped",
      sheet: reference.name,
    });
  }
  if (pane && paneState === "split") {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Split-pane worksheet view presentation was dropped",
      sheet: reference.name,
    });
  }
  const validationCollection = xmlChild(root, "dataValidations");
  const validations = validationCollection
    ? xmlChildren(validationCollection, "dataValidation").flatMap((validation) =>
        parseValidation(validation, context, reference.name, date1904),
      )
    : [];
  const conditional = parseConditionalFormats(root, styles, reference.name);
  const sort = parseSortKeys(root, Math.max(0, maxRow + 1));
  const relationships = packageFile.relationships(reference.relationship.target);
  const comments = parseComments(
    packageFile,
    reference.relationship.target,
    relationships,
    context,
  );
  for (const relationship of relationships) {
    if (
      ["drawing", "image", "table", "pivotTable", "externalLink", "threadedComment"].some((kind) =>
        relationshipTypeMatches(relationship.type, kind),
      )
    ) {
      emitWarning(context, {
        code: relationshipTypeMatches(relationship.type, "externalLink")
          ? "external-relationship"
          : "unsupported-feature",
        message: `Unsupported worksheet relationship ${relationship.type.slice(relationship.type.lastIndexOf("/") + 1)} was dropped`,
        sheet: reference.name,
        part: relationship.target,
      });
    }
  }
  const hyperlinks = xmlChild(root, "hyperlinks");
  if (hyperlinks) {
    for (const hyperlink of xmlChildren(hyperlinks, "hyperlink"))
      emitWarning(context, {
        code: "hyperlink",
        message: "Hyperlink target was dropped; display text was preserved",
        sheet: reference.name,
        cell: xmlAttribute(hyperlink, "ref"),
      });
  }
  return {
    name: reference.name,
    state: reference.state,
    part: reference.relationship.target,
    cells,
    rowCount: Math.max(0, maxRow + 1),
    columnCount: Math.max(1, maxCol + 1),
    columns,
    rowMeta,
    merges,
    rowGroups,
    ...(Number.isInteger(frozenRows) && frozenRows > 0 ? { frozenRows } : {}),
    ...(Number.isInteger(frozenCols) && frozenCols > 0 ? { frozenCols } : {}),
    validations,
    conditionalFormats: conditional.rules,
    sortKeys: sort.keys,
    notes: comments.comments,
    hasUnsupportedValidation: Boolean(validationCollection && validations.length === 0),
    hasConditionalFormatting: root.children.some(
      (child) => xmlLocalName(child.name) === "conditionalFormatting",
    ),
    hasUnsupportedConditionalFormatting: conditional.unsupported,
    hasSortState: Boolean(xmlChild(root, "sortState")),
    hasUnsupportedSortState: sort.unsupported,
    hasRowOutlines: outlineLevels.size > 0,
    hasProtection: Boolean(xmlChild(root, "sheetProtection")),
    hasAutoFilter: Boolean(xmlChild(root, "autoFilter")),
    hasValidationCollection: Boolean(validationCollection),
    hasComments: comments.present,
  };
}

function metadataFromSheet(sheet: ParsedSheet, context: XlsxCodecContext): WorkbookSnapshot | null {
  if (!sheet.name.startsWith(META_STEM)) return null;
  const ordered = sheet.cells
    .filter((cell) => cell.col === 0)
    .sort((left, right) => left.row - right.row);
  const marker = ordered[0]?.value;
  if (marker?.kind !== "literal" || marker.value !== META_MARKER) return null;
  let json = "";
  for (const cell of ordered.slice(1)) {
    if (cell.value?.kind === "literal" && typeof cell.value.value === "string")
      json += cell.value.value;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    const checked = validateCodecSnapshot(parsed, context);
    if (checked.ok) return checked.value;
  } catch {
    // The stable warning below covers malformed JSON and invalid snapshots alike.
  }
  emitWarning(context, {
    code: "invalid-metadata",
    message: "Ignored unreadable or invalid Sheetwrite metadata",
    sheet: sheet.name,
  });
  return null;
}

function columnFromParsed(
  sheet: ParsedSheet,
  col: number,
  key: string,
  context: XlsxCodecContext,
): Column {
  const definition = sheet.columns.get(col);
  const formats = new Set<string>();
  const semanticTypes = new Set<Column["type"]>();
  let hasNumericValue = false;
  for (const cell of sheet.cells) {
    if (cell.col !== col) continue;
    if (cell.styleRecord.numberFormat) formats.add(cell.styleRecord.numberFormat);
    if (cell.styleRecord.date) semanticTypes.add("date");
    else if (cell.styleRecord.numberFormat) {
      semanticTypes.add(
        /[$€£¥]|currency/i.test(cell.styleRecord.numberFormat) ? "currency" : "number",
      );
    }
    if (cell.value?.kind === "literal" && typeof cell.value.value === "number") {
      hasNumericValue = true;
    }
  }
  if (definition?.type) semanticTypes.add(definition.type);
  if (definition?.numberFormat) formats.add(definition.numberFormat);
  const mixed = semanticTypes.size > 1 || formats.size > 1;
  if (mixed) {
    emitWarning(context, {
      code: "format-loss",
      message: `Mixed cell number formats in column ${colToA1(col)} were reduced to a neutral numeric column default`,
      sheet: sheet.name,
    });
  }
  const onlyType = semanticTypes.values().next().value as Column["type"] | undefined;
  const numberFormat = mixed
    ? undefined
    : (definition?.numberFormat ?? formats.values().next().value);
  const type: Column["type"] = mixed
    ? "number"
    : (definition?.type ?? onlyType ?? (hasNumericValue ? "number" : "text"));
  return {
    key,
    header: colToA1(col),
    width: definition?.width ?? 75,
    type,
    ...(numberFormat ? { numberFormat } : {}),
    ...(definition?.cellStyle ? { cellStyle: structuredClone(definition.cellStyle) } : {}),
    ...(definition?.visible === false ? { visible: false } : {}),
  };
}

function restoreSidecarFields(snapshot: WorkbookSnapshot, metadata: WorkbookSnapshot): void {
  for (const sheet of snapshot.sheets) {
    const meta =
      metadata.sheets.find(
        (candidate) =>
          candidate.name.normalize("NFC").toLowerCase() ===
          sheet.name.normalize("NFC").toLowerCase(),
      ) ?? metadata.sheets.find((candidate) => candidate.order === sheet.order);
    if (!meta || sheet.cells.length === 0) continue;
    const cells = sheet.cells[0]!.cells;
    const byOffset = new Map(
      cells.map((cell) => [cell.rowOffset * sheet.columns.length + cell.colOffset, cell]),
    );
    for (const block of meta.cells) {
      for (const sidecar of block.cells) {
        const row = block.startRow + sidecar.rowOffset;
        const col = block.startCol + sidecar.colOffset;
        const existing = byOffset.get(row * sheet.columns.length + col);
        if (!existing) continue;
        if (sidecar.value.kind === "ref" && existing.value.kind === "formula") {
          const reference = sidecar.value;
          const target = snapshot.sheets.find(
            (candidate) => candidate.id === reference.target.sheet,
          );
          if (!target) continue;
          const expected = `='${target.name.replaceAll("'", "''")}'!${colToA1(reference.target.col)}${reference.target.row + 1}`;
          if (existing.value.src === expected) existing.value = structuredClone(reference);
        }
        const sidecarBorder = sidecar.style?.border;
        const hasExactWidth = Object.values(sidecarBorder ?? {}).some(
          (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
        );
        if (hasExactWidth) {
          existing.style = structuredClone(sidecar.style);
        }
      }
    }
  }
}

function projectedConditionalStyle(style: CellStyle): string {
  const color = (value: string | undefined): string | undefined =>
    value?.replace(/^#/, "").toUpperCase();
  const projected: CellStyle = {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.strikethrough ? { strikethrough: true } : {}),
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.color ? { color: `#${color(style.color)}` } : {}),
    ...(style.backgroundColor ? { backgroundColor: `#${color(style.backgroundColor)}` } : {}),
    ...(style.align ? { align: style.align } : {}),
    ...(style.wrap ? { wrap: true } : {}),
  };
  const borders: NonNullable<CellStyle["border"]> = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = style.border?.[side] ?? style.border?.all;
    if (!value) continue;
    borders[side] = {
      ...(value.color ? { color: `#${color(value.color)}` } : {}),
      style: value.style === "dashed" ? "dashed" : value.style === "dotted" ? "dotted" : "solid",
      width:
        value.style === "dotted"
          ? 1
          : value.style === "dashed" && (value.width ?? 1) >= 2
            ? 2
            : (value.width ?? 1) >= 2
              ? 2
              : 1,
    };
  }
  if (Object.keys(borders).length > 0) projected.border = borders;
  return JSON.stringify(projected);
}
function conditionalPredicateFingerprint(predicate: ConditionalFormatPredicate): string {
  return predicate.kind === "contains"
    ? JSON.stringify({
        kind: predicate.kind,
        text: predicate.text,
        matchCase: predicate.matchCase === true,
      })
    : JSON.stringify({ kind: predicate.kind, value: predicate.value });
}

function reconcileConditionalFormats(
  nativeRules: readonly ConditionalFormatRule[],
  sidecarRules: readonly ConditionalFormatRule[] | undefined,
): ConditionalFormatRule[] {
  const remaining = new Set(sidecarRules?.map((_, index) => index) ?? []);
  return nativeRules.map((native) => {
    const match = sidecarRules?.findIndex(
      (sidecar, index) =>
        remaining.has(index) &&
        sidecar.range.start.row === native.range.start.row &&
        sidecar.range.start.col === native.range.start.col &&
        sidecar.range.end.row === native.range.end.row &&
        sidecar.range.end.col === native.range.end.col &&
        conditionalPredicateFingerprint(sidecar.when) ===
          conditionalPredicateFingerprint(native.when) &&
        projectedConditionalStyle(sidecar.style) === projectedConditionalStyle(native.style),
    );
    if (match === undefined || match < 0) return structuredClone(native);
    remaining.delete(match);
    return {
      ...structuredClone(native),
      style: structuredClone(sidecarRules![match]!.style),
    };
  });
}

function externalNamedRanges(
  workbookRoot: XmlElement,
  sheetIds: ReadonlyMap<string, string>,
  sheets: readonly WorkbookSheetReference[],
  context: XlsxCodecContext,
): WorkbookSnapshot["workbook"]["namedRanges"] {
  const definitions = xmlChild(workbookRoot, "definedNames");
  if (!definitions) return undefined;
  const ranges: NonNullable<WorkbookSnapshot["workbook"]["namedRanges"]> = [];
  for (const definition of xmlChildren(definitions, "definedName")) {
    const rawName = xmlAttribute(definition, "name");
    if (!rawName) continue;
    const name = decodeXstring(rawName);
    if (name.startsWith("_xlnm.")) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Reserved Excel defined name ${name} was dropped`,
      });
      continue;
    }
    if (formulaContainsExternalReference(definition.text)) {
      emitWarning(context, {
        code: "external-formula",
        message: `External defined name ${name} was dropped`,
      });
      continue;
    }
    const match = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(definition.text);
    if (!match) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Defined name ${name} was not a single rectangular range`,
      });
      continue;
    }
    if (!/^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/i.test(match[3]!)) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Defined name ${name} was not a single rectangular range`,
      });
      continue;
    }
    const sheetName = (match[1] ?? match[2] ?? "").replaceAll("''", "'");
    const sheet = sheetIds.get(sheetName.normalize("NFC").toLowerCase());
    if (!sheet) continue;
    const parsed = parseRange(match[3]!);
    const localSheetId = xmlAttribute(definition, "localSheetId");
    const scopeIndex = localSheetId === undefined ? undefined : Number(localSheetId);
    ranges.push({
      name,
      ...(Number.isInteger(scopeIndex) && sheets[scopeIndex!]
        ? { scope: sheetIds.get(sheets[scopeIndex!]!.name.normalize("NFC").toLowerCase()) }
        : {}),
      range: {
        sheet,
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
    });
  }
  return ranges.length > 0 ? ranges : undefined;
}

/** Read a preflighted OOXML workbook into Sheetwrite's implementation-neutral snapshot. */
export function readWorkbook(
  data: ArrayBuffer | Uint8Array,
  context: XlsxCodecContext,
): WorkbookSnapshot {
  const packageFile = new OpcPackage(data, context);
  const workbookPart = packageFile.officeDocumentPart();
  const workbookRoot = packageFile.readXml(workbookPart);
  assertXmlRoot(workbookRoot, "workbook", MAIN_NAMESPACES, workbookPart);
  const date1904 = xmlBoolean(
    xmlAttribute(xmlChild(workbookRoot, "workbookPr") ?? workbookRoot, "date1904"),
  );
  const workbookRelationships = packageFile.relationships(workbookPart);
  const stylesPart = workbookRelationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "styles") && !relationship.external,
  )?.target;
  const sharedStringsPart = workbookRelationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "sharedStrings") && !relationship.external,
  )?.target;
  const themePart = workbookRelationships.find(
    (relationship) => relationshipTypeMatches(relationship.type, "theme") && !relationship.external,
  )?.target;
  for (const relationship of workbookRelationships) {
    if (relationshipTypeMatches(relationship.type, "externalLink")) {
      emitWarning(context, {
        code: "external-relationship",
        message: "External-link workbook graph was dropped",
        part: relationship.target,
      });
    }
  }
  const styles = new ParsedStyles(
    stylesPart ? packageFile.readXml(stylesPart) : undefined,
    context,
    themePart ? packageFile.readXml(themePart) : undefined,
    stylesPart ?? "xl/styles.xml",
    themePart ?? "xl/theme/theme1.xml",
  );
  const sharedStrings = parseSharedStrings(packageFile, sharedStringsPart, context);
  const sheetCollection = xmlChild(workbookRoot, "sheets");
  if (!sheetCollection) return readerFailure("workbook has no sheet collection");
  const references: WorkbookSheetReference[] = [];
  const foldedSheetNames = new Set<string>();
  for (const element of xmlChildren(sheetCollection, "sheet")) {
    const rawName = xmlAttribute(element, "name");
    const relationshipId = xmlAttribute(element, "id");
    if (!rawName || !relationshipId) return readerFailure("worksheet declaration is incomplete");
    const name = decodeXstring(rawName);
    const foldedName = name.normalize("NFC").toLowerCase();
    if (!isValidXlsxWorksheetName(name) || foldedSheetNames.has(foldedName)) {
      return readerFailure(`worksheet name ${JSON.stringify(name)} is unsafe or duplicated`);
    }
    foldedSheetNames.add(foldedName);
    const relationship = packageFile.relationship(workbookPart, relationshipId);
    if (!relationshipTypeMatches(relationship.type, "worksheet")) {
      return readerFailure(`relationship ${relationshipId} is not a worksheet`);
    }
    const state = xmlAttribute(element, "state");
    if (
      state !== undefined &&
      state !== "visible" &&
      state !== "hidden" &&
      state !== "veryHidden"
    ) {
      return readerFailure(`worksheet ${name} has invalid visibility state ${state}`);
    }
    references.push({ name, state, relationship });
  }
  const metadataCandidates = references.filter((reference) =>
    reference.name.startsWith(META_STEM),
  ).length;
  assertResource(context, "maxSheets", references.length - Math.min(1, metadataCandidates));
  const usage: ReaderResourceUsage = { cells: 0, merges: 0 };
  const parsedSheets = references.map((reference) => {
    checkAbort(context.options);
    return parseSheet(packageFile, reference, styles, sharedStrings, context, usage, date1904);
  });
  let metadata: WorkbookSnapshot | null = null;
  let metadataIndex = -1;
  for (let index = 0; index < parsedSheets.length; index++) {
    const parsed = metadataFromSheet(parsedSheets[index]!, context);
    if (parsed) {
      metadata = parsed;
      metadataIndex = index;
      break;
    }
  }
  const sourceSheets = parsedSheets.filter((_sheet, index) => index !== metadataIndex);
  const sourceReferences = references.filter((_sheet, index) => index !== metadataIndex);
  assertResource(context, "maxSheets", sourceSheets.length);
  if (sourceSheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX workbook has no worksheets");
  let sourceCellCount = 0;
  for (const source of sourceSheets) {
    sourceCellCount += source.cells.length;
    assertResource(context, "maxCells", sourceCellCount);
  }
  const usedIds = new Set<string>();
  const sheetIds = new Map<string, string>();
  const sheets: SheetSnapshot[] = [];
  for (let order = 0; order < sourceSheets.length; order++) {
    const source = sourceSheets[order]!;
    const exactMeta = metadata?.sheets.find(
      (candidate) =>
        candidate.name.normalize("NFC").toLowerCase() ===
        source.name.normalize("NFC").toLowerCase(),
    );
    const ordinalMeta = metadata?.sheets.find((candidate) => candidate.order === order);
    const meta = exactMeta ?? ordinalMeta;
    if (!exactMeta && ordinalMeta) {
      emitWarning(context, {
        code: "invalid-metadata",
        message: `Reconciled renamed worksheet ${source.name} to sidecar identity by stable ordinal`,
        sheet: source.name,
      });
    }
    const id = meta?.id ?? uniqueSheetId(source.name, order, usedIds);
    usedIds.add(id);
    sheetIds.set(source.name.normalize("NFC").toLowerCase(), id);
    const columnCount = Math.max(1, source.columnCount, meta?.columns.length ?? 0);
    assertResource(context, "maxColumnsPerSheet", columnCount);
    const columns: Column[] = [];
    const keys = new Set<string>();
    for (let col = 0; col < columnCount; col++) {
      const metaColumn = meta?.columns[col];
      const preferredKey = metaColumn?.key ?? `column${col + 1}`;
      let key = preferredKey;
      let suffix = 2;
      while (keys.has(key)) key = `${preferredKey}_${suffix++}`;
      keys.add(key);
      const nativeColumn = columnFromParsed(source, col, key, context);
      if (!metaColumn) {
        columns.push(nativeColumn);
        continue;
      }
      const column = structuredClone(metaColumn);
      const definition = source.columns.get(col);
      if (definition) {
        for (const property of ["width", "visible", "cellStyle", "numberFormat", "type"] as const) {
          const value = definition[property];
          if (value !== undefined) Object.assign(column, { [property]: structuredClone(value) });
        }
      }
      if (source.cells.some((cell) => cell.col === col)) {
        column.type = nativeColumn.type;
        if (nativeColumn.numberFormat) column.numberFormat = nativeColumn.numberFormat;
        else delete column.numberFormat;
      }
      column.key = key;
      columns.push(column);
    }
    const rowCount = source.rowCount;
    assertResource(context, "maxRowsPerSheet", rowCount);
    const snapshotCells: SnapshotCell[] = source.cells.map((cell) => ({
      rowOffset: cell.row,
      colOffset: cell.col,
      value: cell.value ?? { kind: "literal", value: null },
      ...(cell.style ? { style: structuredClone(cell.style) } : {}),
    }));
    const nativeValidations = source.validations.map((validation, index) => {
      const sidecar = meta?.validationRules?.[index];
      const sameBlankDefault =
        sidecar !== undefined &&
        validation.allowBlank === (sidecar.allowBlank === undefined ? true : sidecar.allowBlank);
      return {
        id: sidecar?.id ?? `xlsx-validation-${index + 1}`,
        range: { sheet: id, ...structuredClone(validation.range) },
        condition: structuredClone(validation.condition),
        policy: validation.policy,
        ...(sameBlankDefault
          ? sidecar?.allowBlank !== undefined
            ? { allowBlank: sidecar.allowBlank }
            : {}
          : validation.allowBlank !== undefined
            ? { allowBlank: validation.allowBlank }
            : {}),
        ...(validation.helpText ? { helpText: validation.helpText } : {}),
      };
    });
    const validations = source.hasValidationCollection
      ? nativeValidations
      : (structuredClone(meta?.validationRules) ?? []);
    const nativeNotes = source.notes.map((note) => ({
      addr: { sheet: id, row: note.row, col: note.col },
      text: note.text,
    }));
    const notes = source.hasComments ? nativeNotes : (structuredClone(meta?.notes) ?? []);
    const nativeConditionalFormats = reconcileConditionalFormats(
      source.conditionalFormats.map((rule) => ({
        ...structuredClone(rule),
        range: { ...structuredClone(rule.range), sheet: id },
      })),
      meta?.conditionalFormats,
    );
    const conditionalFormats = source.hasConditionalFormatting
      ? nativeConditionalFormats
      : (structuredClone(meta?.conditionalFormats) ?? []);
    const sortKeys = source.hasSortState
      ? structuredClone(source.sortKeys)
      : (structuredClone(meta?.sortKeys) ?? []);
    if (source.hasUnsupportedValidation && validations.length === 0) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Excel data validation rules could not be mapped safely and were dropped",
        sheet: source.name,
      });
    }
    if (source.hasUnsupportedConditionalFormatting) {
      emitWarning(context, {
        code: "format-loss",
        message:
          "One or more Excel conditional-format predicates or differential styles could not be represented and were dropped",
        sheet: source.name,
      });
    }
    if (source.hasProtection) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel locked-cell protection is static workbook security and cannot be mapped to Sheetwrite host authorization callbacks; it was not represented as protected ranges",
        sheet: source.name,
      });
    }
    if (source.hasAutoFilter) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel autoFilter excludes its header row, while Sheetwrite filters every data row; native filter semantics were not broadened or shifted",
        sheet: source.name,
      });
    }
    if (source.hasUnsupportedSortState) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: "Excel sortState did not cover every Sheetwrite data row and was dropped",
        sheet: source.name,
      });
    }
    sheets.push({
      id,
      name: source.name,
      order,
      ...(source.state === "hidden" || source.state === "veryHidden"
        ? { visibility: source.state }
        : {}),
      rowCount,
      columns,
      ...(source.frozenRows ? { frozenRows: source.frozenRows } : {}),
      ...(source.frozenCols ? { frozenCols: source.frozenCols } : {}),
      ...(source.rowMeta.length > 0 ? { rowMeta: source.rowMeta } : {}),
      ...(source.merges.length > 0 ? { merges: source.merges } : {}),
      ...(conditionalFormats.length > 0 ? { conditionalFormats } : {}),
      ...(source.hasRowOutlines
        ? { rowGroups: source.rowGroups }
        : meta?.rowGroups
          ? { rowGroups: structuredClone(meta.rowGroups) }
          : {}),
      ...(validations.length > 0 ? { validationRules: validations } : {}),
      ...(!source.hasProtection && meta?.protectedRanges
        ? { protectedRanges: structuredClone(meta.protectedRanges) }
        : {}),
      ...(notes.length > 0 ? { notes } : {}),
      ...(sortKeys.length > 0 ? { sortKeys } : {}),
      ...(!source.hasAutoFilter && meta?.filters ? { filters: structuredClone(meta.filters) } : {}),
      cells:
        snapshotCells.length > 0
          ? [{ startRow: 0, startCol: 0, rowCount, colCount: columns.length, cells: snapshotCells }]
          : [],
    });
  }
  if ([...packageFile.archive.entries.keys()].some((name) => /vbaProject\.bin$/i.test(name)))
    emitWarning(context, {
      code: "unsupported-feature",
      message: "VBA macros are not represented by WorkbookSnapshot and were dropped",
    });
  const workbookViews = xmlChildren(
    xmlChild(workbookRoot, "bookViews") ?? workbookRoot,
    "workbookView",
  );
  const activeTab = Number(xmlAttribute(workbookViews.at(-1) ?? workbookRoot, "activeTab") ?? 0);
  const activeSheet =
    sheets[Number.isInteger(activeTab) ? Math.min(Math.max(activeTab, 0), sheets.length - 1) : 0]!
      .id;
  const nativeNamedRanges = externalNamedRanges(workbookRoot, sheetIds, sourceReferences, context);
  const namedRanges = xmlChild(workbookRoot, "definedNames")
    ? nativeNamedRanges
    : metadata?.workbook.namedRanges;
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    ...(metadata?.documentId ? { documentId: metadata.documentId } : {}),
    ...(metadata?.version !== undefined ? { version: metadata.version } : {}),
    workbook: {
      activeSheet,
      ...(namedRanges?.length ? { namedRanges: structuredClone(namedRanges) } : {}),
    },
    sheets,
  };
  if (metadata) restoreSidecarFields(snapshot, metadata);
  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      `Sheetwrite: imported invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
    );
  }
  return checked.value;
}
