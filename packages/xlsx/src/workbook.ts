import type {
  CellBorder,
  CellStyle,
  CellValue,
  Column,
  DataValidationRule,
  MergeRange,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
  XlsxWorkbookBackend,
  XlsxWorkbookOptions,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import {
  colToA1,
  dateToSerial,
  labelToCol,
  serialToDate,
  validateWorkbookSnapshot,
} from "@sheetwrite/core";
import ExcelJS from "exceljs";

type ExcelWorksheetWithValidations = ExcelJS.Worksheet & {
  dataValidations: {
    add(range: string, validation: ExcelJS.Cell["dataValidation"]): void;
  };
};

const PIXELS_PER_CHARACTER = 7;
const XLSX_WIDTH_PADDING = 5;

function pxToChars(px: number): number {
  return Math.max(1, Math.round((px - XLSX_WIDTH_PADDING) / PIXELS_PER_CHARACTER));
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!(data instanceof Uint8Array)) return data;
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

const WORKBOOK_META_MARKER = "sheetwrite-workbook-metadata-v1";
const WORKBOOK_META_SHEET = "__sheetwrite_meta__";
const WORKBOOK_META_CHUNK = 30_000;
const DEFAULT_WORKBOOK_CELL_LIMIT = 1_000_000;

function checkAbort(options: XlsxWorkbookOptions | undefined): void {
  if (!options?.signal?.aborted) return;
  throw options.signal.reason ?? new DOMException("XLSX operation aborted", "AbortError");
}

function warn(options: XlsxWorkbookOptions | undefined, warning: XlsxWorkbookWarning): void {
  options?.onWarning?.(warning);
}

function workbookCellLimit(options: XlsxWorkbookOptions | undefined): number {
  const limit = options?.maxCells ?? DEFAULT_WORKBOOK_CELL_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("Sheetwrite: XLSX maxCells must be a positive integer");
  }
  return limit;
}

function modelHasContent(model: object, key: string): boolean {
  const value: unknown = Reflect.get(model, key);
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null && value !== false;
}

function snapshotCellCount(snapshot: WorkbookSnapshot): number {
  let count = 0;
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) count += block.cells.length;
  }
  return count;
}

function excelArgb(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const value = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) {
    const expanded = [...value].map((part) => `${part}${part}`).join("");
    return `FF${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(value)) return `FF${value.toUpperCase()}`;
  if (/^[0-9a-f]{8}$/i.test(value)) return value.toUpperCase();
  return undefined;
}

function sheetwriteColor(color: Partial<ExcelJS.Color> | undefined): string | undefined {
  const argb = color?.argb;
  if (!argb || !/^[0-9a-f]{8}$/i.test(argb)) return undefined;
  return `#${argb.slice(2).toUpperCase()}`;
}

function excelBorderStyle(border: CellBorder | undefined): ExcelJS.BorderStyle | undefined {
  if (!border) return undefined;
  if (border.style === "dashed") return (border.width ?? 1) >= 2 ? "mediumDashed" : "dashed";
  if (border.style === "dotted") return "dotted";
  return (border.width ?? 1) >= 2 ? "medium" : "thin";
}

function applyWorkbookStyle(cell: ExcelJS.Cell, style: CellStyle | undefined): void {
  if (!style) return;
  const fontColor = excelArgb(style.color);
  if (
    style.bold !== undefined ||
    style.italic !== undefined ||
    style.underline !== undefined ||
    style.strikethrough !== undefined ||
    style.fontSize !== undefined ||
    fontColor !== undefined
  ) {
    cell.font = {
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      strike: style.strikethrough,
      size: style.fontSize,
      color: fontColor ? { argb: fontColor } : undefined,
    };
  }
  const background = excelArgb(style.backgroundColor);
  if (background) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: background } };
  }
  if (style.align !== undefined || style.wrap !== undefined) {
    cell.alignment = { horizontal: style.align, wrapText: style.wrap };
  }
  if (style.border) {
    const border: Partial<ExcelJS.Borders> = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const source = style.border[side] ?? style.border.all;
      const line = excelBorderStyle(source);
      if (!line) continue;
      const lineColor = excelArgb(source?.color);
      border[side] = {
        style: line,
        color: lineColor ? { argb: lineColor } : undefined,
      };
    }
    cell.border = border;
  }
}

function importedBorder(side: Partial<ExcelJS.Border> | undefined): CellBorder | undefined {
  if (!side?.style && !side?.color) return undefined;
  const result: CellBorder = {};
  if (
    side.style === "dashed" ||
    side.style === "mediumDashed" ||
    side.style === "dashDot" ||
    side.style === "mediumDashDot" ||
    side.style === "dashDotDot" ||
    side.style === "mediumDashDotDot"
  ) {
    result.style = "dashed";
  } else if (side.style === "dotted") {
    result.style = "dotted";
  } else if (side.style) {
    result.style = "solid";
  }
  if (
    side.style === "medium" ||
    side.style === "mediumDashed" ||
    side.style === "mediumDashDot" ||
    side.style === "mediumDashDotDot" ||
    side.style === "thick" ||
    side.style === "double"
  ) {
    result.width = 2;
  }
  const color = sheetwriteColor(side.color);
  if (color) result.color = color;
  return result;
}

function importedStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  const style: CellStyle = {};
  if (cell.font?.bold) style.bold = true;
  if (cell.font?.italic) style.italic = true;
  if (cell.font?.underline) style.underline = true;
  if (cell.font?.strike) style.strikethrough = true;
  if (cell.font?.size !== undefined) style.fontSize = cell.font.size;
  const color = sheetwriteColor(cell.font?.color);
  if (color) style.color = color;
  if (cell.fill?.type === "pattern") {
    const background = sheetwriteColor(cell.fill.fgColor);
    if (background) style.backgroundColor = background;
  }
  const horizontal = cell.alignment?.horizontal;
  if (horizontal === "left" || horizontal === "center" || horizontal === "right") {
    style.align = horizontal;
  }
  if (cell.alignment?.wrapText) style.wrap = true;
  const borders = {
    top: importedBorder(cell.border?.top),
    right: importedBorder(cell.border?.right),
    bottom: importedBorder(cell.border?.bottom),
    left: importedBorder(cell.border?.left),
  };
  if (borders.top || borders.right || borders.bottom || borders.left) {
    style.border = {};
    if (borders.top) style.border.top = borders.top;
    if (borders.right) style.border.right = borders.right;
    if (borders.bottom) style.border.bottom = borders.bottom;
    if (borders.left) style.border.left = borders.left;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function quotedSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function formulaForRef(
  snapshot: WorkbookSnapshot,
  value: Extract<CellValue, { kind: "ref" }>,
): string {
  const targetSheet = snapshot.sheets.find((sheet) => sheet.id === value.target.sheet);
  if (!targetSheet) return "#REF!";
  return `${quotedSheet(targetSheet.name)}!${colToA1(value.target.col)}${value.target.row + 1}`;
}

function setWorkbookCell(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  worksheet: ExcelJS.Worksheet,
  source: SnapshotCell,
  blockStartRow: number,
  blockStartCol: number,
): void {
  const row = blockStartRow + source.rowOffset;
  const col = blockStartCol + source.colOffset;
  const column = sheet.columns[col];
  if (!column || row < 0 || row >= sheet.rowCount) return;
  const cell = worksheet.getCell(row + 1, col + 1);
  const value = source.value;
  if (value.kind === "formula") {
    cell.value = { formula: value.src.startsWith("=") ? value.src.slice(1) : value.src };
  } else if (value.kind === "ref") {
    cell.value = { formula: formulaForRef(snapshot, value) };
  } else if (typeof value.value === "number" && column.type === "date") {
    cell.value = serialToDate(value.value);
  } else {
    cell.value = value.value;
  }
  if (column.numberFormat) cell.numFmt = column.numberFormat;
  applyWorkbookStyle(cell, { ...column.cellStyle, ...source.style });
}

function workbookRangeA1(rule: DataValidationRule): string {
  const row0 = Math.min(rule.range.start.row, rule.range.end.row);
  const row1 = Math.max(rule.range.start.row, rule.range.end.row);
  const col0 = Math.min(rule.range.start.col, rule.range.end.col);
  const col1 = Math.max(rule.range.start.col, rule.range.end.col);
  return `${colToA1(col0)}${row0 + 1}:${colToA1(col1)}${row1 + 1}`;
}

function workbookValidationOf(rule: DataValidationRule): ExcelJS.Cell["dataValidation"] | null {
  const common = {
    allowBlank: rule.allowBlank ?? true,
    showInputMessage: Boolean(rule.helpText),
    prompt: rule.helpText,
    showErrorMessage: rule.policy === "reject",
    error: rule.helpText ?? "The entered value does not satisfy this cell's validation rule.",
  };
  const condition = rule.condition;
  if (condition.kind === "list") {
    const list = condition.values
      .map((value) =>
        value === null
          ? ""
          : typeof value === "boolean"
            ? value
              ? "TRUE"
              : "FALSE"
            : String(value),
      )
      .join(",")
      .replaceAll('"', '""');
    if (list.length > 255) return null;
    return { ...common, type: "list", formulae: [`"${list}"`] };
  }
  if (condition.kind === "checkbox") {
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    return {
      ...common,
      type: "list",
      formulae: [`"${String(checked)},${String(unchecked)}"`],
    };
  }
  const formulae =
    condition.kind === "date"
      ? [condition.min, condition.max]
          .filter((value): value is number => value !== undefined)
          .map(serialToDate)
      : [condition.min, condition.max].filter((value): value is number => value !== undefined);
  if (formulae.length === 0) return null;
  const operator =
    condition.min !== undefined && condition.max !== undefined
      ? "between"
      : condition.min !== undefined
        ? "greaterThanOrEqual"
        : "lessThanOrEqual";
  return {
    ...common,
    type:
      condition.kind === "date"
        ? "date"
        : condition.kind === "textLength"
          ? "textLength"
          : "decimal",
    operator,
    formulae,
  };
}

function metadataSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return {
    ...snapshot,
    workbook: { ...snapshot.workbook },
    sheets: snapshot.sheets.map((sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column) => ({ ...column })),
      // Plain references have a persistence-visible identity that XLSX can
      // express only as a formula. Keep sparse coordinates so an unchanged
      // exported formula can be restored to `kind: "ref"` on re-import.
      cells: sheet.cells.flatMap((block) => {
        const references = block.cells
          .filter((cell) => cell.value.kind === "ref")
          .map((cell) => ({
            rowOffset: cell.rowOffset,
            colOffset: cell.colOffset,
            value: structuredClone(cell.value),
          }));
        return references.length > 0 ? [{ ...block, cells: references }] : [];
      }),
    })),
  };
}

function restoreMetadataReferences(
  cells: SnapshotCell[],
  sheet: SheetSnapshot,
  snapshot: WorkbookSnapshot,
): void {
  const cellByOffset = new Map<number, SnapshotCell>();
  for (const cell of cells) {
    cellByOffset.set(cell.rowOffset * sheet.columns.length + cell.colOffset, cell);
  }
  for (const block of sheet.cells) {
    for (const reference of block.cells) {
      if (reference.value.kind !== "ref") continue;
      const rowOffset = block.startRow + reference.rowOffset;
      const colOffset = block.startCol + reference.colOffset;
      const existing = cellByOffset.get(rowOffset * sheet.columns.length + colOffset);
      const expectedFormula = `=${formulaForRef(snapshot, reference.value)}`;
      if (existing?.value.kind === "formula" && existing.value.src === expectedFormula) {
        existing.value = structuredClone(reference.value);
      }
    }
  }
}

function metadataSheetName(snapshot: WorkbookSnapshot): string {
  const used = new Set(snapshot.sheets.map((sheet) => sheet.name));
  let name = WORKBOOK_META_SHEET;
  let suffix = 2;
  while (used.has(name)) name = `${WORKBOOK_META_SHEET.slice(0, 27)}_${suffix++}`;
  return name;
}

function addMetadataWorksheet(workbook: ExcelJS.Workbook, snapshot: WorkbookSnapshot): void {
  const worksheet = workbook.addWorksheet(metadataSheetName(snapshot), { state: "veryHidden" });
  worksheet.getCell(1, 1).value = WORKBOOK_META_MARKER;
  const json = JSON.stringify(metadataSnapshot(snapshot));
  for (let offset = 0, row = 2; offset < json.length; offset += WORKBOOK_META_CHUNK, row++) {
    worksheet.getCell(row, 1).value = json.slice(offset, offset + WORKBOOK_META_CHUNK);
  }
}

function validateSheetNames(snapshot: WorkbookSnapshot): void {
  const seen = new Set<string>();
  for (const sheet of snapshot.sheets) {
    if (seen.has(sheet.name))
      throw new RangeError(`Sheetwrite: duplicate XLSX sheet name: ${sheet.name}`);
    if (sheet.name.length === 0 || sheet.name.length > 31 || /[\\/*?:[\]]/.test(sheet.name)) {
      throw new RangeError(`Sheetwrite: invalid XLSX sheet name: ${sheet.name}`);
    }
    seen.add(sheet.name);
  }
}

async function toWorkbookXlsx(
  snapshot: WorkbookSnapshot,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array> {
  checkAbort(options);
  const checked = validateWorkbookSnapshot(snapshot);
  if (!checked.ok)
    throw new TypeError(
      `Sheetwrite: invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
    );
  if (snapshot.sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX export requires at least one sheet");
  validateSheetNames(snapshot);
  const cells = snapshotCellCount(snapshot);
  const limit = workbookCellLimit(options);
  if (cells > limit) {
    throw new RangeError(
      `Sheetwrite: XLSX export has ${cells} populated cells; maxCells is ${limit}`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const ordered = [...snapshot.sheets].sort((left, right) => left.order - right.order);
  let exportedCells = 0;
  for (const sheet of ordered) {
    checkAbort(options);
    const worksheet = workbook.addWorksheet(sheet.name);
    // ExcelJS exposes this range-native collection at runtime but omits it from Worksheet types.
    const validationWorksheet = worksheet as ExcelWorksheetWithValidations;
    worksheet.columns = sheet.columns.map((column) => ({
      width: pxToChars(column.width),
      hidden: column.visible === false,
      style: column.numberFormat ? { numFmt: column.numberFormat } : undefined,
    }));
    if ((sheet.frozenRows ?? 0) > 0 || (sheet.frozenCols ?? 0) > 0) {
      worksheet.views = [
        { state: "frozen", xSplit: sheet.frozenCols ?? 0, ySplit: sheet.frozenRows ?? 0 },
      ];
    }
    for (const [row, meta] of sheet.rowMeta ?? []) {
      const excelRow = worksheet.getRow(row + 1);
      if (meta.height !== undefined) excelRow.height = meta.height;
      if (meta.hidden !== undefined) excelRow.hidden = meta.hidden;
    }
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if ((exportedCells & 4_095) === 0) checkAbort(options);
        exportedCells += 1;
        setWorkbookCell(snapshot, sheet, worksheet, cell, block.startRow, block.startCol);
      }
    }
    for (const merge of sheet.merges ?? []) {
      worksheet.mergeCells(merge.r0 + 1, merge.c0 + 1, merge.r1 + 1, merge.c1 + 1);
    }
    for (const rule of sheet.validationRules ?? []) {
      const validation = workbookValidationOf(rule);
      if (validation) {
        validationWorksheet.dataValidations.add(workbookRangeA1(rule), validation);
      } else {
        warn(options, {
          code: "unsupported-feature",
          message: `Validation rule "${rule.id}" is preserved in Sheetwrite metadata but exceeds XLSX inline validation limits`,
          sheet: sheet.name,
        });
      }
    }
    for (const note of sheet.notes ?? []) {
      worksheet.getCell(note.addr.row + 1, note.addr.col + 1).note = note.text;
    }
    if (sheet.conditionalFormats?.length) {
      warn(options, {
        code: "unsupported-feature",
        message:
          "Conditional formats are preserved in Sheetwrite metadata but not translated to Excel rules",
        sheet: sheet.name,
      });
    }
    if (sheet.rowGroups?.length) {
      warn(options, {
        code: "unsupported-feature",
        message:
          "Row groups are preserved in Sheetwrite metadata but not translated to Excel outlines",
        sheet: sheet.name,
      });
    }
  }

  for (const namedRange of snapshot.workbook.namedRanges ?? []) {
    const sheet = snapshot.sheets.find((candidate) => candidate.id === namedRange.range.sheet);
    if (!sheet) continue;
    const range = namedRange.range;
    const location = `${quotedSheet(sheet.name)}!$${colToA1(range.start.col)}$${range.start.row + 1}:$${colToA1(range.end.col)}$${range.end.row + 1}`;
    workbook.definedNames.add(location, namedRange.name);
  }
  const active = ordered.findIndex((sheet) => sheet.id === snapshot.workbook.activeSheet);
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 12_000,
      height: 8_000,
      firstSheet: 0,
      activeTab: Math.max(0, active),
      visibility: "visible",
    },
  ];
  addMetadataWorksheet(workbook, snapshot);
  checkAbort(options);
  const output = await workbook.xlsx.writeBuffer();
  checkAbort(options);
  // ExcelJS returns a Uint8Array-compatible Buffer in both browser and Node
  // builds, but its bundled declaration omits Uint8Array inheritance.
  const outputBytes = output as unknown as Uint8Array;
  return outputBytes.slice();
}

function metadataFromWorkbook(
  workbook: ExcelJS.Workbook,
  options: XlsxWorkbookOptions | undefined,
): { snapshot: WorkbookSnapshot | null; metadataSheet: ExcelJS.Worksheet | null } {
  const metadataSheet = workbook.worksheets.find(
    (worksheet) =>
      worksheet.name.startsWith(WORKBOOK_META_SHEET) &&
      worksheet.getCell(1, 1).value === WORKBOOK_META_MARKER,
  );
  if (!metadataSheet) return { snapshot: null, metadataSheet: null };
  let json = "";
  for (let row = 2; row <= metadataSheet.rowCount; row++) {
    const value = metadataSheet.getCell(row, 1).value;
    if (typeof value === "string") json += value;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    const checked = validateWorkbookSnapshot(parsed);
    if (checked.ok) return { snapshot: checked.value, metadataSheet };
    warn(options, { code: "unsupported-feature", message: "Ignored invalid Sheetwrite metadata" });
  } catch {
    warn(options, {
      code: "unsupported-feature",
      message: "Ignored unreadable Sheetwrite metadata",
    });
  }
  return { snapshot: null, metadataSheet };
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

function mergeFromA1(value: string): MergeRange | null {
  const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(value);
  if (!match) return null;
  return {
    r0: Number(match[2]) - 1,
    c0: labelToCol(match[1]!),
    r1: Number(match[4]) - 1,
    c1: labelToCol(match[3]!),
  };
}

function inferColumnType(worksheet: ExcelJS.Worksheet, col: number): Column["type"] {
  for (let row = 1; row <= worksheet.rowCount; row++) {
    const cell = worksheet.getCell(row, col + 1);
    if (cell.value instanceof Date) return "date";
    if (typeof cell.value === "number") {
      return /[$€£¥]|currency/i.test(cell.numFmt ?? "") ? "currency" : "number";
    }
    if (cell.value !== null) return "text";
  }
  return "text";
}

function columnFromWorksheet(worksheet: ExcelJS.Worksheet, col: number, key: string): Column {
  const source = worksheet.getColumn(col + 1);
  let numberFormat: string | undefined;
  for (let row = 1; row <= worksheet.rowCount; row++) {
    const format = worksheet.getCell(row, col + 1).numFmt;
    if (format && format !== "General") {
      numberFormat = format;
      break;
    }
  }
  return {
    key,
    header: colToA1(col),
    width: Math.max(
      1,
      Math.round((source.width ?? 10) * PIXELS_PER_CHARACTER + XLSX_WIDTH_PADDING),
    ),
    type: inferColumnType(worksheet, col),
    ...(numberFormat ? { numberFormat } : {}),
    ...(source.hidden ? { visible: false } : {}),
  };
}

function appendWorksheetColumns(
  columns: Column[],
  worksheet: ExcelJS.Worksheet,
  count: number,
): void {
  const keys = new Set(columns.map((column) => column.key));
  for (let col = columns.length; col < count; col++) {
    const stem = `column${col + 1}`;
    let key = stem;
    let suffix = 2;
    while (keys.has(key)) key = `${stem}_${suffix++}`;
    keys.add(key);
    columns.push(columnFromWorksheet(worksheet, col, key));
  }
}

function columnsFromWorksheet(
  worksheet: ExcelJS.Worksheet,
  metadata: SheetSnapshot | undefined,
): Column[] {
  const columns = metadata ? metadata.columns.map((column) => structuredClone(column)) : [];
  const count = Math.max(worksheet.columnCount, worksheet.actualColumnCount, columns.length, 1);
  appendWorksheetColumns(columns, worksheet, count);
  return columns;
}

function valueFromExcelCell(
  cell: ExcelJS.Cell,
  options: XlsxWorkbookOptions | undefined,
  sheet: string,
): CellValue | null {
  if (cell.formula) return { kind: "formula", src: `=${cell.formula}` };
  const value: unknown = cell.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { kind: "literal", value: dateToSerial(value) };
  if (typeof value === "number" || typeof value === "string") {
    return { kind: "literal", value };
  }
  if (typeof value === "boolean") {
    return { kind: "literal", value };
  }
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    warn(options, {
      code: "rich-text",
      message: "Rich text formatting was flattened",
      sheet,
      cell: cell.address,
    });
    const text = value.richText
      .map((part: unknown) =>
        part && typeof part === "object" && "text" in part && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("");
    return { kind: "literal", value: text };
  }
  if (typeof value === "object" && "hyperlink" in value) {
    warn(options, {
      code: "hyperlink",
      message: "Hyperlink target was dropped; display text was preserved",
      sheet,
      cell: cell.address,
    });
    return {
      kind: "literal",
      value: "text" in value && typeof value.text === "string" ? value.text : cell.text,
    };
  }
  if (typeof value === "object" && "error" in value && typeof value.error === "string") {
    warn(options, {
      code: "unsupported-cell-value",
      message: "Unbound Excel error was preserved as text",
      sheet,
      cell: cell.address,
    });
    return { kind: "literal", value: value.error };
  }
  warn(options, {
    code: "unsupported-cell-value",
    message: "Unsupported Excel cell value was preserved as display text",
    sheet,
    cell: cell.address,
  });
  return { kind: "literal", value: cell.text };
}

function namedRangesFromWorkbook(
  workbook: ExcelJS.Workbook,
  sheetIds: ReadonlyMap<string, string>,
): WorkbookSnapshot["workbook"]["namedRanges"] {
  const ranges = [];
  for (const item of workbook.definedNames.model) {
    if (item.ranges.length !== 1) continue;
    const match = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(item.ranges[0]!);
    if (!match) continue;
    const sheetName = (match[1] ?? match[2] ?? "").replace(/''/g, "'");
    const sheet = sheetIds.get(sheetName);
    const range = mergeFromA1(match[3]!);
    if (!sheet || !range) continue;
    ranges.push({
      name: item.name,
      range: {
        sheet,
        start: { row: range.r0, col: range.c0 },
        end: { row: range.r1, col: range.c1 },
      },
    });
  }
  return ranges.length > 0 ? ranges : undefined;
}

async function fromWorkbookXlsx(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot> {
  checkAbort(options);
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's browser implementation accepts ArrayBuffer; its declaration is
  // narrowed to Node Buffer. Keep the compatibility assertion at this boundary.
  type ExcelLoadInput = Parameters<typeof workbook.xlsx.load>[0];
  const excelInput = toArrayBuffer(data) as unknown as ExcelLoadInput;
  await workbook.xlsx.load(excelInput);
  checkAbort(options);
  if (modelHasContent(workbook.model, "vbaProject")) {
    warn(options, {
      code: "unsupported-feature",
      message: "VBA macros are not represented by WorkbookSnapshot and were dropped",
    });
  }
  const { snapshot: metadata, metadataSheet } = metadataFromWorkbook(workbook, options);
  const worksheets = workbook.worksheets.filter((worksheet) => worksheet !== metadataSheet);
  if (worksheets.length === 0) throw new RangeError("Sheetwrite: XLSX workbook has no worksheets");

  const limit = workbookCellLimit(options);
  let populated = 0;
  const usedIds = new Set<string>();
  const sheetIds = new Map<string, string>();
  const sheets: SheetSnapshot[] = [];
  for (let order = 0; order < worksheets.length; order++) {
    checkAbort(options);
    const worksheet = worksheets[order]!;
    const meta = metadata?.sheets.find((sheet) => sheet.name === worksheet.name);
    const id = meta?.id ?? uniqueSheetId(worksheet.name, order, usedIds);
    usedIds.add(id);
    sheetIds.set(worksheet.name, id);
    const columns = columnsFromWorksheet(worksheet, meta);
    let rowCount = meta?.rowCount ?? 0;
    const cells: SnapshotCell[] = [];
    let hasDataValidation = false;
    let hasNotes = false;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        hasDataValidation ||= Object.keys(cell.dataValidation ?? {}).length > 0;
        hasNotes ||= cell.note !== undefined && cell.note !== null;
        const value = valueFromExcelCell(cell, options, worksheet.name);
        const style = importedStyle(cell);
        if (!value && !style) return;
        populated += 1;
        if ((populated & 4_095) === 0) checkAbort(options);
        if (populated > limit) {
          throw new RangeError(`Sheetwrite: XLSX import exceeds maxCells ${limit}`);
        }
        rowCount = Math.max(rowCount, rowNumber);
        cells.push({
          rowOffset: rowNumber - 1,
          colOffset: colNumber - 1,
          value: value ?? { kind: "literal", value: null },
          ...(style ? { style } : {}),
        });
      });
    });
    if (meta && metadata) restoreMetadataReferences(cells, meta, metadata);
    if (hasDataValidation && !meta?.validationRules?.length) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel data validation rules could not be mapped safely and were dropped",
        sheet: worksheet.name,
      });
    }
    if (hasNotes && !meta?.notes?.length) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel cell notes could not be mapped safely and were dropped",
        sheet: worksheet.name,
      });
    }
    if (worksheet.getImages().length > 0) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel worksheet images are not represented by WorkbookSnapshot and were dropped",
        sheet: worksheet.name,
      });
    }
    if (worksheet.getTables().length > 0) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel table definitions are not represented by WorkbookSnapshot and were dropped",
        sheet: worksheet.name,
      });
    }
    if (worksheet.autoFilter) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel auto-filters are not represented by WorkbookSnapshot and were dropped",
        sheet: worksheet.name,
      });
    }
    if (modelHasContent(worksheet.model, "sheetProtection") && !meta?.protectedRanges?.length) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel worksheet protection could not be mapped to host-resolved protected ranges",
        sheet: worksheet.name,
      });
    }
    if (modelHasContent(worksheet.model, "conditionalFormattings")) {
      warn(options, {
        code: "unsupported-feature",
        message: "Excel conditional formatting rules cannot be mapped losslessly and were dropped",
        sheet: worksheet.name,
      });
    }
    const rowMeta: NonNullable<SheetSnapshot["rowMeta"]> = [];
    for (let row = 1; row <= worksheet.rowCount; row++) {
      const source = worksheet.getRow(row);
      if (source.height !== undefined || source.hidden) {
        rowCount = Math.max(rowCount, row);
        rowMeta.push([
          row - 1,
          {
            ...(source.height !== undefined ? { height: source.height } : {}),
            ...(source.hidden ? { hidden: true } : {}),
          },
        ]);
      }
    }
    const merges = worksheet.model.merges
      .map(mergeFromA1)
      .filter((merge): merge is MergeRange => merge !== null);
    for (const merge of merges) {
      rowCount = Math.max(rowCount, merge.r1 + 1);
      appendWorksheetColumns(columns, worksheet, merge.c1 + 1);
    }
    const frozen = worksheet.views?.find((view) => view.state === "frozen");
    const frozenRows =
      frozen && "ySplit" in frozen && typeof frozen.ySplit === "number" ? frozen.ySplit : undefined;
    const frozenCols =
      frozen && "xSplit" in frozen && typeof frozen.xSplit === "number" ? frozen.xSplit : undefined;
    sheets.push({
      id,
      name: worksheet.name,
      order,
      rowCount,
      columns,
      ...(frozenRows ? { frozenRows } : {}),
      ...(frozenCols ? { frozenCols } : {}),
      ...(rowMeta.length > 0 ? { rowMeta } : {}),
      ...(merges.length > 0 ? { merges } : {}),
      ...(meta?.conditionalFormats
        ? { conditionalFormats: structuredClone(meta.conditionalFormats) }
        : {}),
      ...(meta?.rowGroups ? { rowGroups: structuredClone(meta.rowGroups) } : {}),
      ...(meta?.validationRules ? { validationRules: structuredClone(meta.validationRules) } : {}),
      ...(meta?.protectedRanges ? { protectedRanges: structuredClone(meta.protectedRanges) } : {}),
      ...(meta?.notes ? { notes: structuredClone(meta.notes) } : {}),
      ...(meta?.sortKeys ? { sortKeys: structuredClone(meta.sortKeys) } : {}),
      ...(meta?.filters ? { filters: structuredClone(meta.filters) } : {}),
      cells:
        cells.length > 0
          ? [{ startRow: 0, startCol: 0, rowCount, colCount: columns.length, cells }]
          : [],
    });
  }

  const activeIndex = workbook.views?.[0]?.activeTab ?? 0;
  const activeSheet = sheets[Math.min(activeIndex, sheets.length - 1)]?.id ?? sheets[0]!.id;
  const namedRanges = metadata?.workbook.namedRanges ?? namedRangesFromWorkbook(workbook, sheetIds);
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
  const checked = validateWorkbookSnapshot(snapshot);
  if (!checked.ok) {
    throw new TypeError(
      `Sheetwrite: imported invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
    );
  }
  return checked.value;
}

/**
 * ExcelJS is intentionally confined to the optional `@sheetwrite/xlsx`
 * package. The MIT browser build preserves formulas, worksheets, styles,
 * merges, dimensions, and frozen views.
 */
export const excelJsWorkbookBackend: XlsxWorkbookBackend = {
  name: "exceljs",
  toXlsxWorkbook: toWorkbookXlsx,
  fromXlsxWorkbook: fromWorkbookXlsx,
};
