import type { DocumentOp, MergeRange, Range, SheetSnapshot, WorkbookSnapshot } from "./types.js";

export const WORKBOOK_SCHEMA_VERSION = 1 as const;

export interface DocumentValidationError {
  path: string;
  code:
    | "unsupported-schema"
    | "invalid-value"
    | "duplicate-id"
    | "missing-reference"
    | "out-of-bounds"
    | "overlapping-merge"
    | "non-serializable";
  message: string;
}

export type DocumentValidationResult =
  | { ok: true; value: WorkbookSnapshot }
  | { ok: false; errors: DocumentValidationError[] };

export class SnapshotValidationError extends Error {
  readonly code = "invalid-snapshot";

  constructor(readonly errors: readonly DocumentValidationError[]) {
    super(errors[0]?.message ?? "Invalid workbook snapshot");
    this.name = "SnapshotValidationError";
  }
}

type PlainRecord = Record<string, unknown>;

interface JsonSafetyIssue {
  path: string;
  message: string;
}

function nonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function ownValue(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function childPath(path: string, key: string): string {
  if (path === "$") {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
  }
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function findJsonSafetyIssue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): JsonSafetyIssue | undefined {
  if (value === undefined) {
    return { path, message: "undefined is not JSON-safe" };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? undefined : { path, message: "Numbers must be finite" };
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return { path, message: `${typeof value} values are not JSON-safe` };
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return undefined;
  }
  if (typeof value !== "object") {
    return { path, message: "Value is not JSON-safe" };
  }
  if (ancestors.has(value)) {
    return { path, message: "Cyclic values are not JSON-safe" };
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return { path, message: "Arrays with custom prototypes are not JSON-safe" };
    }
    const indexKeys: string[] = [];
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        return {
          path: typeof key === "string" ? childPath(path, key) : path,
          message: "Arrays may contain only indexed data properties",
        };
      }
      indexKeys.push(key);
    }
    if (indexKeys.length !== value.length) {
      let missingIndex = 0;
      while (missingIndex < indexKeys.length && indexKeys[missingIndex] === String(missingIndex)) {
        missingIndex++;
      }
      return { path: `${path}[${missingIndex}]`, message: "Sparse arrays are not JSON-safe" };
    }
    ancestors.add(value);
    for (const key of indexKeys) {
      const itemPath = `${path}[${key}]`;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        ancestors.delete(value);
        return { path: itemPath, message: "Array entries must be enumerable data properties" };
      }
      const issue = findJsonSafetyIssue(descriptor.value, itemPath, ancestors);
      if (issue) {
        ancestors.delete(value);
        return issue;
      }
    }
    ancestors.delete(value);
    return undefined;
  }

  if (!isPlainRecord(value)) {
    return { path, message: "Only plain objects are JSON-safe" };
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      ancestors.delete(value);
      return { path, message: "Symbol-keyed properties are not JSON-safe" };
    }
    const propertyPath = childPath(path, key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      ancestors.delete(value);
      return {
        path: propertyPath,
        message: "Object properties must be enumerable data properties",
      };
    }
    const issue = findJsonSafetyIssue(descriptor.value, propertyPath, ancestors);
    if (issue) {
      ancestors.delete(value);
      return issue;
    }
  }
  ancestors.delete(value);
  return undefined;
}

function invalid(
  errors: DocumentValidationError[],
  path: string,
  message: string,
  code: DocumentValidationError["code"] = "invalid-value",
): void {
  errors.push({ path, code, message });
}

function recordAt(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): PlainRecord | undefined {
  if (isPlainRecord(value)) return value;
  invalid(errors, path, `${path} must be an object`);
  return undefined;
}

function arrayAt(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  invalid(errors, path, `${path} must be an array`);
  return undefined;
}

function optionalArray(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
): unknown[] | undefined {
  const value = ownValue(record, key);
  return value === undefined ? undefined : arrayAt(value, `${path}.${key}`, errors);
}

function requireString(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
  nonEmpty = false,
): string | undefined {
  const value = ownValue(record, key);
  if (typeof value === "string" && (!nonEmpty || value.length > 0)) return value;
  invalid(errors, `${path}.${key}`, `${key} must be ${nonEmpty ? "a non-empty " : "a "}string`);
  return undefined;
}

function optionalString(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
): void {
  const value = ownValue(record, key);
  if (value !== undefined && typeof value !== "string") {
    invalid(errors, `${path}.${key}`, `${key} must be a string`);
  }
}

function optionalBoolean(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
): void {
  const value = ownValue(record, key);
  if (value !== undefined && typeof value !== "boolean") {
    invalid(errors, `${path}.${key}`, `${key} must be a boolean`);
  }
}

function requireNonNegativeInteger(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
  positive = false,
): number | undefined {
  const value = ownValue(record, key);
  if (nonNegativeInteger(value) && (!positive || value > 0)) return value;
  invalid(
    errors,
    `${path}.${key}`,
    `${key} must be a ${positive ? "positive" : "non-negative"} integer`,
  );
  return undefined;
}

function scalar(value: unknown): boolean {
  return (
    value === null || typeof value === "string" || typeof value === "boolean" || finiteNumber(value)
  );
}

function validateCellBorder(value: unknown, path: string, errors: DocumentValidationError[]): void {
  const border = recordAt(value, path, errors);
  if (!border) return;
  optionalString(border, "color", path, errors);
  const width = ownValue(border, "width");
  if (width !== undefined && (!finiteNumber(width) || width < 0)) {
    invalid(errors, `${path}.width`, "Border width must be finite and non-negative");
  }
  const style = ownValue(border, "style");
  if (style !== undefined && !["solid", "dashed", "dotted"].includes(String(style))) {
    invalid(errors, `${path}.style`, "Border style is invalid");
  }
}

function validateCellStyle(value: unknown, path: string, errors: DocumentValidationError[]): void {
  const style = recordAt(value, path, errors);
  if (!style) return;
  for (const key of ["bold", "italic", "underline", "strikethrough", "wrap"]) {
    optionalBoolean(style, key, path, errors);
  }
  for (const key of ["color", "backgroundColor"]) {
    optionalString(style, key, path, errors);
  }
  const fontSize = ownValue(style, "fontSize");
  if (fontSize !== undefined && (!finiteNumber(fontSize) || fontSize < 0)) {
    invalid(errors, `${path}.fontSize`, "fontSize must be finite and non-negative");
  }
  const align = ownValue(style, "align");
  if (align !== undefined && !["left", "center", "right"].includes(String(align))) {
    invalid(errors, `${path}.align`, "align must be left, center, or right");
  }
  const borders = ownValue(style, "border");
  if (borders !== undefined) {
    const borderRecord = recordAt(borders, `${path}.border`, errors);
    if (borderRecord) {
      for (const side of ["all", "top", "right", "bottom", "left"]) {
        const border = ownValue(borderRecord, side);
        if (border !== undefined) validateCellBorder(border, `${path}.border.${side}`, errors);
      }
    }
  }
}

function validateAddress(value: unknown, path: string, errors: DocumentValidationError[]): void {
  const address = recordAt(value, path, errors);
  if (!address) return;
  requireString(address, "sheet", path, errors, true);
  requireNonNegativeInteger(address, "row", path, errors);
  requireNonNegativeInteger(address, "col", path, errors);
}

function validateRangeShape(value: unknown, path: string, errors: DocumentValidationError[]): void {
  const range = recordAt(value, path, errors);
  if (!range) return;
  requireString(range, "sheet", path, errors, true);
  for (const end of ["start", "end"]) {
    const coordinatePath = `${path}.${end}`;
    const coordinate = recordAt(ownValue(range, end), coordinatePath, errors);
    if (!coordinate) continue;
    requireNonNegativeInteger(coordinate, "row", coordinatePath, errors);
    requireNonNegativeInteger(coordinate, "col", coordinatePath, errors);
  }
}

function validateCellValueShape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const cellValue = recordAt(value, path, errors);
  if (!cellValue) return;
  const kind = ownValue(cellValue, "kind");
  if (kind === "literal") {
    const literal = ownValue(cellValue, "value");
    if (!scalar(literal)) invalid(errors, `${path}.value`, "Literal values must be JSON scalars");
    return;
  }
  if (kind === "formula") {
    requireString(cellValue, "src", path, errors);
    return;
  }
  if (kind === "ref") {
    validateAddress(ownValue(cellValue, "target"), `${path}.target`, errors);
    return;
  }
  invalid(errors, `${path}.kind`, "Cell value kind must be literal, formula, or ref");
}

function validateColumnShape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const column = recordAt(value, path, errors);
  if (!column) return;
  requireString(column, "key", path, errors, true);
  requireString(column, "header", path, errors);
  const width = ownValue(column, "width");
  if (!finiteNumber(width) || width < 0) {
    invalid(errors, `${path}.width`, "Column width must be finite and non-negative");
  }
  const type = ownValue(column, "type");
  if (!["text", "number", "date", "currency"].includes(String(type))) {
    invalid(errors, `${path}.type`, "Column type is invalid");
  }
  for (const key of ["numberFormat", "numberLocale", "renderer"]) {
    optionalString(column, key, path, errors);
  }
  optionalBoolean(column, "visible", path, errors);
  for (const key of ["headerStyle", "cellStyle"]) {
    const style = ownValue(column, key);
    if (style !== undefined) validateCellStyle(style, `${path}.${key}`, errors);
  }
}

function validateConditionalPredicate(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const predicate = recordAt(value, path, errors);
  if (!predicate) return;
  const kind = ownValue(predicate, "kind");
  if (kind === "greaterThan" || kind === "lessThan") {
    if (!finiteNumber(ownValue(predicate, "value"))) {
      invalid(errors, `${path}.value`, "Conditional comparison value must be finite");
    }
  } else if (kind === "equal") {
    if (!scalar(ownValue(predicate, "value"))) {
      invalid(errors, `${path}.value`, "Conditional equality value must be a scalar");
    }
  } else if (kind === "contains") {
    requireString(predicate, "text", path, errors);
    optionalBoolean(predicate, "matchCase", path, errors);
  } else {
    invalid(errors, `${path}.kind`, "Conditional format predicate kind is invalid");
  }
}

function validateValidationCondition(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const condition = recordAt(value, path, errors);
  if (!condition) return;
  const kind = ownValue(condition, "kind");
  if (kind === "list") {
    const values = arrayAt(ownValue(condition, "values"), `${path}.values`, errors);
    if (values && values.length === 0) {
      invalid(errors, `${path}.values`, "List validation needs at least one value");
    }
    values?.forEach((entry, index) => {
      if (!scalar(entry)) {
        invalid(errors, `${path}.values[${index}]`, "List validation values must be scalars");
      }
    });
    optionalBoolean(condition, "allowCustom", path, errors);
    return;
  }
  if (kind === "number" || kind === "date") {
    const min = ownValue(condition, "min");
    const max = ownValue(condition, "max");
    if (min !== undefined && !finiteNumber(min)) {
      invalid(errors, `${path}.min`, "Validation minimum must be finite");
    }
    if (max !== undefined && !finiteNumber(max)) {
      invalid(errors, `${path}.max`, "Validation maximum must be finite");
    }
    if (finiteNumber(min) && finiteNumber(max) && min > max) {
      invalid(errors, path, "Validation minimum may not exceed maximum");
    }
    return;
  }
  if (kind === "textLength") {
    const min = ownValue(condition, "min");
    const max = ownValue(condition, "max");
    if (min !== undefined && !nonNegativeInteger(min)) {
      invalid(errors, `${path}.min`, "Text length minimum must be a non-negative integer");
    }
    if (max !== undefined && !nonNegativeInteger(max)) {
      invalid(errors, `${path}.max`, "Text length maximum must be a non-negative integer");
    }
    if (nonNegativeInteger(min) && nonNegativeInteger(max) && min > max) {
      invalid(errors, path, "Text length minimum may not exceed maximum");
    }
    return;
  }
  if (kind === "checkbox") {
    for (const key of ["checkedValue", "uncheckedValue"]) {
      const entry = ownValue(condition, key);
      if (entry !== undefined && !scalar(entry)) {
        invalid(errors, `${path}.${key}`, `${key} must be a scalar`);
      }
    }
    return;
  }
  invalid(errors, `${path}.kind`, "Validation condition kind is invalid");
}

function validateFilterShape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const filter = recordAt(value, path, errors);
  if (!filter) return;
  const kind = ownValue(filter, "kind");
  if (kind === "values") {
    const values = arrayAt(ownValue(filter, "values"), `${path}.values`, errors);
    values?.forEach((entry, index) => {
      if (!scalar(entry))
        invalid(errors, `${path}.values[${index}]`, "Filter values must be scalars");
    });
  } else if (kind === "contains") {
    requireString(filter, "text", path, errors);
    optionalBoolean(filter, "matchCase", path, errors);
  } else if (kind === "compare") {
    const operation = ownValue(filter, "op");
    if (!["gt", "gte", "lt", "lte", "eq", "neq"].includes(String(operation))) {
      invalid(errors, `${path}.op`, "Filter comparison operation is invalid");
    }
    if (!finiteNumber(ownValue(filter, "value"))) {
      invalid(errors, `${path}.value`, "Filter comparison value must be finite");
    }
  } else if (kind !== "empty" && kind !== "nonEmpty") {
    invalid(errors, `${path}.kind`, "Filter kind is invalid");
  }
}

function validateSheetShape(value: unknown, path: string, errors: DocumentValidationError[]): void {
  const sheet = recordAt(value, path, errors);
  if (!sheet) return;
  requireString(sheet, "id", path, errors, true);
  requireString(sheet, "name", path, errors);
  requireNonNegativeInteger(sheet, "order", path, errors);
  requireNonNegativeInteger(sheet, "rowCount", path, errors);

  const columns = arrayAt(ownValue(sheet, "columns"), `${path}.columns`, errors);
  if (columns && columns.length === 0) {
    invalid(errors, `${path}.columns`, "A sheet needs at least one column");
  }
  columns?.forEach((column, index) => {
    validateColumnShape(column, `${path}.columns[${index}]`, errors);
  });

  for (const key of ["frozenRows", "frozenCols"]) {
    const frozen = ownValue(sheet, key);
    if (frozen !== undefined && !nonNegativeInteger(frozen)) {
      invalid(errors, `${path}.${key}`, `${key} must be a non-negative integer`);
    }
  }

  const rowMeta = optionalArray(sheet, "rowMeta", path, errors);
  rowMeta?.forEach((entry, index) => {
    const entryPath = `${path}.rowMeta[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      invalid(errors, entryPath, "Row metadata must be a [row, metadata] tuple");
      return;
    }
    if (!nonNegativeInteger(entry[0])) {
      invalid(errors, `${entryPath}[0]`, "Row metadata index must be a non-negative integer");
    }
    const metadata = recordAt(entry[1], `${entryPath}[1]`, errors);
    if (!metadata) return;
    const height = ownValue(metadata, "height");
    if (height !== undefined && (!finiteNumber(height) || height < 0)) {
      invalid(errors, `${entryPath}[1].height`, "Row height must be finite and non-negative");
    }
    optionalBoolean(metadata, "hidden", `${entryPath}[1]`, errors);
  });

  const merges = optionalArray(sheet, "merges", path, errors);
  merges?.forEach((entry, index) => {
    const mergePath = `${path}.merges[${index}]`;
    const merge = recordAt(entry, mergePath, errors);
    if (!merge) return;
    for (const key of ["r0", "c0", "r1", "c1"]) {
      requireNonNegativeInteger(merge, key, mergePath, errors);
    }
  });

  const conditionalFormats = optionalArray(sheet, "conditionalFormats", path, errors);
  conditionalFormats?.forEach((entry, index) => {
    const formatPath = `${path}.conditionalFormats[${index}]`;
    const format = recordAt(entry, formatPath, errors);
    if (!format) return;
    validateRangeShape(ownValue(format, "range"), `${formatPath}.range`, errors);
    validateConditionalPredicate(ownValue(format, "when"), `${formatPath}.when`, errors);
    validateCellStyle(ownValue(format, "style"), `${formatPath}.style`, errors);
  });

  const validationRules = optionalArray(sheet, "validationRules", path, errors);
  validationRules?.forEach((entry, index) => {
    const rulePath = `${path}.validationRules[${index}]`;
    const rule = recordAt(entry, rulePath, errors);
    if (!rule) return;
    requireString(rule, "id", rulePath, errors, true);
    validateRangeShape(ownValue(rule, "range"), `${rulePath}.range`, errors);
    validateValidationCondition(ownValue(rule, "condition"), `${rulePath}.condition`, errors);
    const policy = ownValue(rule, "policy");
    if (!["reject", "warn", "allow"].includes(String(policy))) {
      invalid(errors, `${rulePath}.policy`, "Validation policy is invalid");
    }
    optionalBoolean(rule, "allowBlank", rulePath, errors);
    optionalString(rule, "helpText", rulePath, errors);
  });

  const protectedRanges = optionalArray(sheet, "protectedRanges", path, errors);
  protectedRanges?.forEach((entry, index) => {
    const protectedPath = `${path}.protectedRanges[${index}]`;
    const protectedRange = recordAt(entry, protectedPath, errors);
    if (!protectedRange) return;
    requireString(protectedRange, "id", protectedPath, errors, true);
    validateRangeShape(ownValue(protectedRange, "range"), `${protectedPath}.range`, errors);
    optionalString(protectedRange, "label", protectedPath, errors);
    optionalString(protectedRange, "permissionKey", protectedPath, errors);
  });

  const notes = optionalArray(sheet, "notes", path, errors);
  notes?.forEach((entry, index) => {
    const notePath = `${path}.notes[${index}]`;
    const note = recordAt(entry, notePath, errors);
    if (!note) return;
    validateAddress(ownValue(note, "addr"), `${notePath}.addr`, errors);
    requireString(note, "text", notePath, errors, true);
  });

  const sortKeys = optionalArray(sheet, "sortKeys", path, errors);
  sortKeys?.forEach((entry, index) => {
    const sortPath = `${path}.sortKeys[${index}]`;
    const sortKey = recordAt(entry, sortPath, errors);
    if (!sortKey) return;
    requireNonNegativeInteger(sortKey, "col", sortPath, errors);
    const ascending = ownValue(sortKey, "ascending");
    if (typeof ascending !== "boolean") {
      invalid(errors, `${sortPath}.ascending`, "ascending must be a boolean");
    }
  });

  const filters = optionalArray(sheet, "filters", path, errors);
  filters?.forEach((entry, index) => {
    const filterPath = `${path}.filters[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      invalid(errors, filterPath, "Filters must be [column, filter] tuples");
      return;
    }
    if (!nonNegativeInteger(entry[0])) {
      invalid(errors, `${filterPath}[0]`, "Filter column must be a non-negative integer");
    }
    validateFilterShape(entry[1], `${filterPath}[1]`, errors);
  });

  const rowGroups = optionalArray(sheet, "rowGroups", path, errors);
  rowGroups?.forEach((entry, index) => {
    const groupPath = `${path}.rowGroups[${index}]`;
    const group = recordAt(entry, groupPath, errors);
    if (!group) return;
    requireNonNegativeInteger(group, "start", groupPath, errors);
    requireNonNegativeInteger(group, "end", groupPath, errors);
    const collapsed = ownValue(group, "collapsed");
    if (typeof collapsed !== "boolean") {
      invalid(errors, `${groupPath}.collapsed`, "collapsed must be a boolean");
    }
  });

  const blocks = arrayAt(ownValue(sheet, "cells"), `${path}.cells`, errors);
  blocks?.forEach((entry, blockIndex) => {
    const blockPath = `${path}.cells[${blockIndex}]`;
    const block = recordAt(entry, blockPath, errors);
    if (!block) return;
    for (const key of ["startRow", "startCol"]) {
      requireNonNegativeInteger(block, key, blockPath, errors);
    }
    for (const key of ["rowCount", "colCount"]) {
      requireNonNegativeInteger(block, key, blockPath, errors, true);
    }
    const cells = arrayAt(ownValue(block, "cells"), `${blockPath}.cells`, errors);
    cells?.forEach((cellEntry, cellIndex) => {
      const cellPath = `${blockPath}.cells[${cellIndex}]`;
      const cell = recordAt(cellEntry, cellPath, errors);
      if (!cell) return;
      requireNonNegativeInteger(cell, "rowOffset", cellPath, errors);
      requireNonNegativeInteger(cell, "colOffset", cellPath, errors);
      validateCellValueShape(ownValue(cell, "value"), `${cellPath}.value`, errors);
      const style = ownValue(cell, "style");
      if (style !== undefined) validateCellStyle(style, `${cellPath}.style`, errors);
    });
  });
}

function normalizedMerge(merge: MergeRange): MergeRange {
  return {
    r0: Math.min(merge.r0, merge.r1),
    c0: Math.min(merge.c0, merge.c1),
    r1: Math.max(merge.r0, merge.r1),
    c1: Math.max(merge.c0, merge.c1),
  };
}

function overlaps(a: MergeRange, b: MergeRange): boolean {
  return a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;
}

function rangeInSheet(range: Range, sheet: SheetSnapshot): boolean {
  return (
    range.sheet === sheet.id &&
    Math.max(range.start.row, range.end.row) < sheet.rowCount &&
    Math.max(range.start.col, range.end.col) < sheet.columns.length
  );
}

function validateJsonSafeSnapshot(input: unknown): DocumentValidationResult {
  const errors: DocumentValidationError[] = [];
  const candidate = recordAt(input, "$", errors);
  if (!candidate) return { ok: false, errors };

  const schemaVersion = ownValue(candidate, "schemaVersion");
  if (schemaVersion !== WORKBOOK_SCHEMA_VERSION) {
    invalid(
      errors,
      "schemaVersion",
      `Unsupported workbook schema version: ${String(schemaVersion)}`,
      "unsupported-schema",
    );
  }
  const documentId = ownValue(candidate, "documentId");
  if (documentId !== undefined && typeof documentId !== "string") {
    invalid(errors, "documentId", "documentId must be a string");
  }
  const version = ownValue(candidate, "version");
  if (version !== undefined && !nonNegativeInteger(version)) {
    invalid(errors, "version", "version must be a non-negative integer");
  }

  const workbook = recordAt(ownValue(candidate, "workbook"), "workbook", errors);
  if (workbook) {
    requireString(workbook, "activeSheet", "workbook", errors, true);
    const namedRanges = optionalArray(workbook, "namedRanges", "workbook", errors);
    namedRanges?.forEach((entry, index) => {
      const namedPath = `workbook.namedRanges[${index}]`;
      const namedRange = recordAt(entry, namedPath, errors);
      if (!namedRange) return;
      const name = requireString(namedRange, "name", namedPath, errors, true);
      if (
        name !== undefined &&
        (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
          /^[A-Za-z]+\d+$/.test(name) ||
          /^(TRUE|FALSE)$/i.test(name))
      ) {
        invalid(errors, `${namedPath}.name`, "Named range name must be formula-safe");
      }
      optionalString(namedRange, "scope", namedPath, errors);
      validateRangeShape(ownValue(namedRange, "range"), `${namedPath}.range`, errors);
    });
  }

  const sheets = arrayAt(ownValue(candidate, "sheets"), "sheets", errors);
  if (sheets && sheets.length === 0) {
    invalid(errors, "sheets", "At least one sheet is required");
  }
  sheets?.forEach((sheet, index) => {
    validateSheetShape(sheet, `sheets[${index}]`, errors);
  });
  if (errors.length > 0) return { ok: false, errors };

  // Shape validation above proves the complete schema before this trust-boundary cast.
  const validated = input as WorkbookSnapshot;
  const ids = new Set<string>();
  const orders = new Set<number>();
  const normalizedSheets: SheetSnapshot[] = [];

  for (let sheetIndex = 0; sheetIndex < validated.sheets.length; sheetIndex++) {
    const sheet = validated.sheets[sheetIndex]!;
    const path = `sheets[${sheetIndex}]`;
    if (ids.has(sheet.id)) {
      invalid(errors, `${path}.id`, "Sheet IDs must be unique", "duplicate-id");
    }
    ids.add(sheet.id);
    if (orders.has(sheet.order)) {
      invalid(errors, `${path}.order`, "Sheet order must be unique", "duplicate-id");
    }
    orders.add(sheet.order);

    const columnKeys = new Set<string>();
    for (let columnIndex = 0; columnIndex < sheet.columns.length; columnIndex++) {
      const column = sheet.columns[columnIndex]!;
      if (columnKeys.has(column.key)) {
        invalid(
          errors,
          `${path}.columns[${columnIndex}].key`,
          "Column keys must be unique and stable",
          "duplicate-id",
        );
      }
      columnKeys.add(column.key);
    }

    const merges: MergeRange[] = [];
    for (let mergeIndex = 0; mergeIndex < (sheet.merges?.length ?? 0); mergeIndex++) {
      const merge = normalizedMerge(sheet.merges![mergeIndex]!);
      const mergePath = `${path}.merges[${mergeIndex}]`;
      if (merge.r1 >= sheet.rowCount || merge.c1 >= sheet.columns.length) {
        invalid(errors, mergePath, "Merge lies outside the sheet", "out-of-bounds");
      }
      if (merges.some((existing) => overlaps(existing, merge))) {
        invalid(errors, mergePath, "Merged regions may not overlap", "overlapping-merge");
      }
      merges.push(merge);
    }

    const occupied = new Set<string>();
    for (let blockIndex = 0; blockIndex < sheet.cells.length; blockIndex++) {
      const block = sheet.cells[blockIndex]!;
      const blockPath = `${path}.cells[${blockIndex}]`;
      if (
        block.startRow + block.rowCount > sheet.rowCount ||
        block.startCol + block.colCount > sheet.columns.length
      ) {
        invalid(errors, blockPath, "Cell block lies outside the sheet", "out-of-bounds");
      }
      for (let cellIndex = 0; cellIndex < block.cells.length; cellIndex++) {
        const cell = block.cells[cellIndex]!;
        const cellPath = `${blockPath}.cells[${cellIndex}]`;
        if (cell.rowOffset >= block.rowCount || cell.colOffset >= block.colCount) {
          invalid(errors, cellPath, "Cell offset lies outside its block", "out-of-bounds");
          continue;
        }
        const key = `${block.startRow + cell.rowOffset}:${block.startCol + cell.colOffset}`;
        if (occupied.has(key)) {
          invalid(errors, cellPath, "A snapshot cell may appear only once", "duplicate-id");
        }
        occupied.add(key);
      }
    }

    for (let index = 0; index < (sheet.rowMeta?.length ?? 0); index++) {
      const row = sheet.rowMeta![index]![0];
      if (row >= sheet.rowCount) {
        invalid(
          errors,
          `${path}.rowMeta[${index}][0]`,
          "Row metadata lies outside the sheet",
          "out-of-bounds",
        );
      }
    }
    for (const [field, value, limit] of [
      ["frozenRows", sheet.frozenRows, sheet.rowCount],
      ["frozenCols", sheet.frozenCols, sheet.columns.length],
    ] as const) {
      if (value !== undefined && value > limit) {
        invalid(errors, `${path}.${field}`, `${field} lies outside the sheet`, "out-of-bounds");
      }
    }
    for (let index = 0; index < (sheet.rowGroups?.length ?? 0); index++) {
      const group = sheet.rowGroups![index]!;
      if (group.start > group.end || group.end >= sheet.rowCount) {
        invalid(
          errors,
          `${path}.rowGroups[${index}]`,
          "Row group lies outside the sheet",
          "out-of-bounds",
        );
      }
    }
    for (let index = 0; index < (sheet.conditionalFormats?.length ?? 0); index++) {
      if (!rangeInSheet(sheet.conditionalFormats![index]!.range, sheet)) {
        invalid(
          errors,
          `${path}.conditionalFormats[${index}].range`,
          "Conditional format range lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    const validationIds = new Set<string>();
    for (let index = 0; index < (sheet.validationRules?.length ?? 0); index++) {
      const rule = sheet.validationRules![index]!;
      if (validationIds.has(rule.id)) {
        invalid(
          errors,
          `${path}.validationRules[${index}].id`,
          "Validation rule IDs must be unique",
          "duplicate-id",
        );
      }
      validationIds.add(rule.id);
      if (!rangeInSheet(rule.range, sheet)) {
        invalid(
          errors,
          `${path}.validationRules[${index}].range`,
          "Validation rule range lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    const protectionIds = new Set<string>();
    for (let index = 0; index < (sheet.protectedRanges?.length ?? 0); index++) {
      const protectedRange = sheet.protectedRanges![index]!;
      if (protectionIds.has(protectedRange.id)) {
        invalid(
          errors,
          `${path}.protectedRanges[${index}].id`,
          "Protected range IDs must be unique",
          "duplicate-id",
        );
      }
      protectionIds.add(protectedRange.id);
      if (!rangeInSheet(protectedRange.range, sheet)) {
        invalid(
          errors,
          `${path}.protectedRanges[${index}].range`,
          "Protected range lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    const noteAddresses = new Set<string>();
    for (let index = 0; index < (sheet.notes?.length ?? 0); index++) {
      const note = sheet.notes![index]!;
      const key = `${note.addr.row}:${note.addr.col}`;
      if (
        note.addr.sheet !== sheet.id ||
        note.addr.row >= sheet.rowCount ||
        note.addr.col >= sheet.columns.length
      ) {
        invalid(
          errors,
          `${path}.notes[${index}].addr`,
          "Note address lies outside the sheet",
          "out-of-bounds",
        );
      } else if (noteAddresses.has(key)) {
        invalid(
          errors,
          `${path}.notes[${index}].addr`,
          "Note addresses must be unique",
          "duplicate-id",
        );
      }
      noteAddresses.add(key);
    }

    const sortColumns = new Set<number>();
    for (let index = 0; index < (sheet.sortKeys?.length ?? 0); index++) {
      const key = sheet.sortKeys![index]!;
      if (key.col >= sheet.columns.length) {
        invalid(
          errors,
          `${path}.sortKeys[${index}].col`,
          "Sort column lies outside the sheet",
          "out-of-bounds",
        );
      } else if (sortColumns.has(key.col)) {
        invalid(
          errors,
          `${path}.sortKeys[${index}].col`,
          "Sort columns must be unique",
          "duplicate-id",
        );
      }
      sortColumns.add(key.col);
    }

    const filterColumns = new Set<number>();
    for (let index = 0; index < (sheet.filters?.length ?? 0); index++) {
      const column = sheet.filters![index]![0];
      if (column >= sheet.columns.length) {
        invalid(
          errors,
          `${path}.filters[${index}][0]`,
          "Filter column lies outside the sheet",
          "out-of-bounds",
        );
      } else if (filterColumns.has(column)) {
        invalid(
          errors,
          `${path}.filters[${index}][0]`,
          "Filter columns must be unique",
          "duplicate-id",
        );
      }
      filterColumns.add(column);
    }

    const normalizedSheet: SheetSnapshot = {
      ...sheet,
      merges: merges.length > 0 ? merges : undefined,
      validationRules: sheet.validationRules
        ? [...sheet.validationRules].sort((a, b) => a.id.localeCompare(b.id))
        : undefined,
      protectedRanges: sheet.protectedRanges
        ? [...sheet.protectedRanges].sort((a, b) => a.id.localeCompare(b.id))
        : undefined,
      notes: sheet.notes
        ? [...sheet.notes].sort((a, b) => a.addr.row - b.addr.row || a.addr.col - b.addr.col)
        : undefined,
      filters: sheet.filters ? [...sheet.filters].sort((a, b) => a[0] - b[0]) : undefined,
      rowMeta: sheet.rowMeta ? [...sheet.rowMeta].sort((a, b) => a[0] - b[0]) : undefined,
      cells: sheet.cells.map((block) => ({
        ...block,
        cells: [...block.cells].sort(
          (a, b) => a.rowOffset - b.rowOffset || a.colOffset - b.colOffset,
        ),
      })),
    };
    if (normalizedSheet.merges === undefined) delete normalizedSheet.merges;
    if (normalizedSheet.validationRules === undefined) delete normalizedSheet.validationRules;
    if (normalizedSheet.protectedRanges === undefined) delete normalizedSheet.protectedRanges;
    if (normalizedSheet.notes === undefined) delete normalizedSheet.notes;
    if (normalizedSheet.filters === undefined) delete normalizedSheet.filters;
    if (normalizedSheet.rowMeta === undefined) delete normalizedSheet.rowMeta;
    normalizedSheets.push(normalizedSheet);
  }

  if (!ids.has(validated.workbook.activeSheet)) {
    invalid(errors, "workbook.activeSheet", "Active sheet must exist", "missing-reference");
  }

  const sheetById = new Map(validated.sheets.map((sheet) => [sheet.id, sheet]));
  for (let sheetIndex = 0; sheetIndex < validated.sheets.length; sheetIndex++) {
    const sheet = validated.sheets[sheetIndex]!;
    for (let blockIndex = 0; blockIndex < sheet.cells.length; blockIndex++) {
      const block = sheet.cells[blockIndex]!;
      for (let cellIndex = 0; cellIndex < block.cells.length; cellIndex++) {
        const cell = block.cells[cellIndex]!;
        if (cell.value.kind !== "ref") continue;
        const targetSheet = sheetById.get(cell.value.target.sheet);
        const targetPath = `sheets[${sheetIndex}].cells[${blockIndex}].cells[${cellIndex}].value.target`;
        if (!targetSheet) {
          invalid(errors, targetPath, "Cell reference sheet must exist", "missing-reference");
        } else if (
          cell.value.target.row >= targetSheet.rowCount ||
          cell.value.target.col >= targetSheet.columns.length
        ) {
          invalid(
            errors,
            targetPath,
            "Cell reference target lies outside the sheet",
            "out-of-bounds",
          );
        }
      }
    }
  }

  const namedRangeIds = new Set<string>();
  for (let index = 0; index < (validated.workbook.namedRanges?.length ?? 0); index++) {
    const namedRange = validated.workbook.namedRanges![index]!;
    const namedPath = `workbook.namedRanges[${index}]`;
    const id = `${namedRange.scope ?? ""}\u0000${namedRange.name.toUpperCase()}`;
    if (namedRangeIds.has(id)) {
      invalid(
        errors,
        `${namedPath}.name`,
        "Named range names must be unique within their scope",
        "duplicate-id",
      );
    }
    namedRangeIds.add(id);
    if (namedRange.scope !== undefined && !sheetById.has(namedRange.scope)) {
      invalid(
        errors,
        `${namedPath}.scope`,
        "Named range scope sheet must exist",
        "missing-reference",
      );
    }
    const targetSheet = sheetById.get(namedRange.range.sheet);
    if (!targetSheet) {
      invalid(errors, `${namedPath}.range`, "Named range sheet must exist", "missing-reference");
    } else if (!rangeInSheet(namedRange.range, targetSheet)) {
      invalid(errors, `${namedPath}.range`, "Named range lies outside the sheet", "out-of-bounds");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...validated,
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      sheets: normalizedSheets.sort((a, b) => a.order - b.order),
    },
  };
}

/** Validate and canonically order a schema-1 snapshot without hydrating runtime state. */
export function validateWorkbookSnapshot(input: unknown): DocumentValidationResult {
  try {
    const issue = findJsonSafetyIssue(input, "$", new Set<object>());
    if (issue) {
      return {
        ok: false,
        errors: [{ path: issue.path, code: "non-serializable", message: issue.message }],
      };
    }
    return validateJsonSafeSnapshot(input);
  } catch {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          code: "invalid-value",
          message: "Snapshot could not be inspected safely",
        },
      ],
    };
  }
}

/** Exhaustive stable target identity used by persistence/logging layers. */
export function documentOpTarget(operation: DocumentOp): string {
  switch (operation.op) {
    case "set":
      return operation.addr.sheet;
    case "setNote":
      return operation.addr.sheet;
    case "setRange":
    case "setBlock":
    case "setRangeStyle":
    case "clearRange":
      return operation.range.sheet;
    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
    case "setColumn":
    case "setRowMeta":
    case "addMerge":
    case "removeMerge":
    case "removeSheet":
    case "renameSheet":
    case "moveSheet":
    case "setSheetMeta":
    case "setValidationRule":
    case "removeValidationRule":
    case "setProtectedRange":
    case "removeProtectedRange":
      return operation.sheet;
    case "addSheet":
      return operation.sheet.id;
    case "setNamedRange":
      return operation.namedRange.name;
    case "removeNamedRange":
      return operation.name;
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}
