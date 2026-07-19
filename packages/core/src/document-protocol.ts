import { boundedJsonByteLength, JsonByteLengthError } from "./json-byte-length.js";
import type { MergeRange, Range } from "./types/coordinates.js";
import type {
  DocumentOp,
  MutationIssue,
  SheetSnapshot,
  Workbook,
  WorkbookSnapshot,
} from "./types/document.js";
import type { TransactionResourceLimits } from "./types/transaction.js";

/** Current workbook snapshot schema version accepted by Sheetwrite. */
export const WORKBOOK_SCHEMA_VERSION = 1 as const;

/**
 * Inclusive defaults for every atomic document transaction accepted by a
 * Store or Grid. Encoded bytes are the UTF-8 JSON size of the DocumentOp array.
 */
export const DEFAULT_TRANSACTION_RESOURCE_LIMITS: Readonly<TransactionResourceLimits> =
  Object.freeze({
    maxOperations: 10_000,
    maxEncodedBytes: 8 * 1024 * 1024,
  });

/** Successful byte/count inspection or one structured transaction rejection. */
export type TransactionResourceValidationResult =
  | {
      ok: true;
      operationCount: number;
      encodedBytes: number;
    }
  | {
      ok: false;
      issue: Extract<MutationIssue, { kind: "resource-limit" }>;
    };

const TRANSACTION_RESOURCE_KEYS = [
  "maxOperations",
  "maxEncodedBytes",
] as const satisfies readonly (keyof TransactionResourceLimits)[];

/**
 * Validate and merge transaction ceiling overrides without retaining the
 * caller-owned object. Every ceiling is an inclusive non-negative safe integer.
 */
export function resolveTransactionResourceLimits(
  overrides: Partial<TransactionResourceLimits> = {},
): Readonly<TransactionResourceLimits> {
  const limits: TransactionResourceLimits = { ...DEFAULT_TRANSACTION_RESOURCE_LIMITS };
  for (const resource of TRANSACTION_RESOURCE_KEYS) {
    const value = overrides[resource];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        `Transaction resource limit ${resource} must be a non-negative safe integer`,
      );
    }
    limits[resource] = value;
  }
  return Object.freeze(limits);
}

/**
 * Incrementally validate the operation count and exact encoded payload size
 * without constructing a JSON string. Compact operation ranges are measured by
 * their serialized fields; their logical cell area is deliberately irrelevant.
 */
export function validateTransactionResources(
  operations: readonly DocumentOp[],
  limits: Readonly<TransactionResourceLimits> = DEFAULT_TRANSACTION_RESOURCE_LIMITS,
): TransactionResourceValidationResult {
  if (!Array.isArray(operations)) {
    throw new TypeError("Transaction patches must be an array of DocumentOps");
  }
  if (operations.length > limits.maxOperations) {
    return {
      ok: false,
      issue: {
        kind: "resource-limit",
        severity: "error",
        resource: "operations",
        actual: operations.length,
        max: limits.maxOperations,
        message: `Transaction operation count ${operations.length} exceeds maximum ${limits.maxOperations}`,
      },
    };
  }
  try {
    return {
      ok: true,
      operationCount: operations.length,
      encodedBytes: boundedJsonByteLength(operations, limits.maxEncodedBytes, {
        omitUndefinedProperties: true,
      }),
    };
  } catch (error) {
    if (!(error instanceof JsonByteLengthError) || error.code !== "limit") throw error;
    const actual = error.actual ?? limits.maxEncodedBytes + 1;
    return {
      ok: false,
      issue: {
        kind: "resource-limit",
        severity: "error",
        resource: "encoded-bytes",
        actual,
        max: limits.maxEncodedBytes,
        message: `Transaction encoded operation payload exceeds maximum ${limits.maxEncodedBytes} bytes (${actual} bytes observed)`,
      },
    };
  }
}

/** Allocation mode used when enforcing snapshot construction capacity. */
export type SnapshotStorageMode = "dense" | "paged";

/** Resource ceilings applied before snapshot normalization or store allocation. */
export interface SnapshotResourceLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxMetadataEntries: number;
  maxSerializedBytes: number;
  maxLogicalCellsPerSheet: number;
  maxDenseCells: number;
}

/** Conservative defaults that retain the million-row paged-sheet contract. */
export const DEFAULT_SNAPSHOT_RESOURCE_LIMITS: Readonly<SnapshotResourceLimits> = Object.freeze({
  maxSheets: 256,
  maxRowsPerSheet: 1_000_000,
  maxColumnsPerSheet: 16_384,
  maxMetadataEntries: 1_000_000,
  maxSerializedBytes: 64 * 1024 * 1024,
  maxLogicalCellsPerSheet: 0xffff_ffff,
  maxDenseCells: 5_000_000,
});

/** Validation and allocation policy for an untrusted workbook snapshot. */
export interface SnapshotValidationOptions {
  storage?: SnapshotStorageMode;
  resourceLimits?: Partial<SnapshotResourceLimits>;
}

/** Stable resource failure raised by direct workbook construction paths. */
export class SnapshotResourceError extends RangeError {
  readonly code = "resource-limit";

  constructor(
    readonly resource: keyof SnapshotResourceLimits,
    readonly limit: number,
    readonly actual: number,
    options?: ErrorOptions,
  ) {
    super(
      actual > limit
        ? `Snapshot ${resource} limit ${limit} exceeded by ${actual}`
        : `Snapshot allocation failed for ${actual} within ${resource} limit ${limit}`,
      options,
    );
    this.name = "SnapshotResourceError";
  }
}

/** Path-qualified validation failure for a document operation. */
export interface DocumentValidationError {
  path: string;
  code:
    | "unsupported-schema"
    | "invalid-value"
    | "duplicate-id"
    | "missing-reference"
    | "out-of-bounds"
    | "overlapping-merge"
    | "non-serializable"
    | "resource-limit";
  message: string;
}

/** Success or structured errors returned by document validation. */
export type DocumentValidationResult =
  | { ok: true; value: WorkbookSnapshot }
  | { ok: false; errors: DocumentValidationError[] };

/** Path-qualified schema failure found while validating an untrusted snapshot. */
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
  code: "non-serializable" | "resource-limit";
  message: string;
}

interface JsonInspectionState {
  readonly maxBytes: number;
  bytes: number;
}

interface ResolvedSnapshotValidationOptions {
  readonly storage: SnapshotStorageMode;
  readonly limits: SnapshotResourceLimits;
}

const SNAPSHOT_RESOURCE_KEYS = [
  "maxSheets",
  "maxRowsPerSheet",
  "maxColumnsPerSheet",
  "maxMetadataEntries",
  "maxSerializedBytes",
  "maxLogicalCellsPerSheet",
  "maxDenseCells",
] as const satisfies readonly (keyof SnapshotResourceLimits)[];

const SHEET_METADATA_ARRAY_KEYS = [
  "rowMeta",
  "merges",
  "conditionalFormats",
  "validationRules",
  "protectedRanges",
  "notes",
  "sortKeys",
  "filters",
  "rowGroups",
  "cells",
] as const;

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
  return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

function childPath(path: string, key: string): string {
  if (path === "$") {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
  }
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function consumeBytes(state: JsonInspectionState, count: number): boolean {
  if (count > state.maxBytes - state.bytes) return false;
  state.bytes += count;
  return true;
}

function consumeJsonString(state: JsonInspectionState, value: string): boolean {
  if (!consumeBytes(state, 2)) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    let bytes: number;
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a) {
      bytes = 2;
    } else if (code === 0x0c || code === 0x0d) {
      bytes = 2;
    } else if (code < 0x20) {
      bytes = 6;
    } else if (code < 0x80) {
      bytes = 1;
    } else if (code < 0x800) {
      bytes = 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes = 4;
        index += 1;
      } else {
        bytes = 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes = 6;
    } else {
      bytes = 3;
    }
    if (!consumeBytes(state, bytes)) return false;
  }
  return true;
}

function serializedLimitIssue(path: string, maxBytes: number): JsonSafetyIssue {
  return {
    path,
    code: "resource-limit",
    message: `Snapshot maxSerializedBytes limit ${maxBytes} exceeded`,
  };
}

function findJsonSafetyIssue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  state: JsonInspectionState,
): JsonSafetyIssue | undefined {
  if (value === undefined) {
    return { path, code: "non-serializable", message: "undefined is not JSON-safe" };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { path, code: "non-serializable", message: "Numbers must be finite" };
    }
    const serialized = Object.is(value, -0) ? "0" : String(value);
    return consumeBytes(state, serialized.length)
      ? undefined
      : serializedLimitIssue(path, state.maxBytes);
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return {
      path,
      code: "non-serializable",
      message: `${typeof value} values are not JSON-safe`,
    };
  }
  if (value === null) {
    return consumeBytes(state, 4) ? undefined : serializedLimitIssue(path, state.maxBytes);
  }
  if (typeof value === "boolean") {
    return consumeBytes(state, value ? 4 : 5)
      ? undefined
      : serializedLimitIssue(path, state.maxBytes);
  }
  if (typeof value === "string") {
    return consumeJsonString(state, value) ? undefined : serializedLimitIssue(path, state.maxBytes);
  }
  if (typeof value !== "object") {
    return { path, code: "non-serializable", message: "Value is not JSON-safe" };
  }
  if (ancestors.has(value)) {
    return { path, code: "non-serializable", message: "Cyclic values are not JSON-safe" };
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return {
        path,
        code: "non-serializable",
        message: "Arrays with custom prototypes are not JSON-safe",
      };
    }
    if (!consumeBytes(state, 2 + Math.max(0, value.length - 1))) {
      return serializedLimitIssue(path, state.maxBytes);
    }
    ancestors.add(value);
    for (let index = 0; index < value.length; index++) {
      const itemPath = `${path}[${index}]`;
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        ancestors.delete(value);
        return {
          path: itemPath,
          code: "non-serializable",
          message: "Array entries must be enumerable data properties",
        };
      }
      const issue = findJsonSafetyIssue(descriptor.value, itemPath, ancestors, state);
      if (issue) {
        ancestors.delete(value);
        return issue;
      }
    }
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        ancestors.delete(value);
        return {
          path: childPath(path, key),
          code: "non-serializable",
          message: "Arrays may contain only indexed data properties",
        };
      }
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      ancestors.delete(value);
      return {
        path,
        code: "non-serializable",
        message: "Symbol-keyed properties are not JSON-safe",
      };
    }
    ancestors.delete(value);
    return undefined;
  }

  if (!isPlainRecord(value)) {
    return { path, code: "non-serializable", message: "Only plain objects are JSON-safe" };
  }
  if (!consumeBytes(state, 2)) return serializedLimitIssue(path, state.maxBytes);
  ancestors.add(value);
  let propertyCount = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    const propertyPath = childPath(path, key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      ancestors.delete(value);
      return {
        path: propertyPath,
        code: "non-serializable",
        message: "Object properties must be enumerable data properties",
      };
    }
    if (
      (propertyCount > 0 && !consumeBytes(state, 1)) ||
      !consumeJsonString(state, key) ||
      !consumeBytes(state, 1)
    ) {
      ancestors.delete(value);
      return serializedLimitIssue(propertyPath, state.maxBytes);
    }
    propertyCount += 1;
    const issue = findJsonSafetyIssue(descriptor.value, propertyPath, ancestors, state);
    if (issue) {
      ancestors.delete(value);
      return issue;
    }
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    ancestors.delete(value);
    return {
      path,
      code: "non-serializable",
      message: "Symbol-keyed properties are not JSON-safe",
    };
  }
  ancestors.delete(value);
  return undefined;
}

function resourceValidationError(
  resource: keyof SnapshotResourceLimits,
  limit: number,
  actual: number,
  path: string,
): DocumentValidationError {
  return {
    path,
    code: "resource-limit",
    message: `Snapshot ${resource} limit ${limit} exceeded by ${actual}`,
  };
}

function resolveSnapshotValidationOptions(
  options: SnapshotValidationOptions,
): ResolvedSnapshotValidationOptions | DocumentValidationError {
  const storage = options.storage ?? "dense";
  if (storage !== "dense" && storage !== "paged") {
    return {
      path: "options.storage",
      code: "invalid-value",
      message: "Snapshot storage must be dense or paged",
    };
  }
  const limits: SnapshotResourceLimits = { ...DEFAULT_SNAPSHOT_RESOURCE_LIMITS };
  for (const resource of SNAPSHOT_RESOURCE_KEYS) {
    const override = options.resourceLimits?.[resource];
    if (override === undefined) continue;
    if (!nonNegativeInteger(override)) {
      return {
        path: `options.resourceLimits.${resource}`,
        code: "invalid-value",
        message: `${resource} must be a non-negative safe integer`,
      };
    }
    limits[resource] = override;
  }
  return { storage, limits };
}

function arrayDataValue(array: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
  return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

function productExceeds(left: number, right: number, limit: number): boolean {
  return left !== 0 && right > Math.floor(limit / left);
}

function preflightSnapshotResources(
  input: unknown,
  options: ResolvedSnapshotValidationOptions,
): DocumentValidationError | undefined {
  if (!isPlainRecord(input)) return undefined;
  const sheets = ownValue(input, "sheets");
  if (!Array.isArray(sheets)) return undefined;
  const { limits } = options;
  if (sheets.length > limits.maxSheets) {
    return resourceValidationError("maxSheets", limits.maxSheets, sheets.length, "sheets");
  }

  let metadataEntries = 0;
  const workbook = ownValue(input, "workbook");
  if (isPlainRecord(workbook)) {
    const namedRanges = ownValue(workbook, "namedRanges");
    if (Array.isArray(namedRanges)) {
      metadataEntries = namedRanges.length;
      if (metadataEntries > limits.maxMetadataEntries) {
        return resourceValidationError(
          "maxMetadataEntries",
          limits.maxMetadataEntries,
          metadataEntries,
          "workbook.namedRanges",
        );
      }
    }
  }

  let denseCells = 0;
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    const sheet = arrayDataValue(sheets, sheetIndex);
    if (!isPlainRecord(sheet)) continue;
    const path = `sheets[${sheetIndex}]`;
    const rowCount = ownValue(sheet, "rowCount");
    const columns = ownValue(sheet, "columns");
    if (nonNegativeInteger(rowCount) && rowCount > limits.maxRowsPerSheet) {
      return resourceValidationError(
        "maxRowsPerSheet",
        limits.maxRowsPerSheet,
        rowCount,
        `${path}.rowCount`,
      );
    }
    if (Array.isArray(columns) && columns.length > limits.maxColumnsPerSheet) {
      return resourceValidationError(
        "maxColumnsPerSheet",
        limits.maxColumnsPerSheet,
        columns.length,
        `${path}.columns`,
      );
    }
    if (nonNegativeInteger(rowCount) && Array.isArray(columns)) {
      if (productExceeds(rowCount, columns.length, limits.maxLogicalCellsPerSheet)) {
        return resourceValidationError(
          "maxLogicalCellsPerSheet",
          limits.maxLogicalCellsPerSheet,
          rowCount * columns.length,
          path,
        );
      }
      if (options.storage === "dense") {
        const remaining = limits.maxDenseCells - denseCells;
        if (remaining < 0 || productExceeds(rowCount, columns.length, remaining)) {
          return resourceValidationError(
            "maxDenseCells",
            limits.maxDenseCells,
            denseCells + rowCount * columns.length,
            path,
          );
        }
        denseCells += rowCount * columns.length;
      }
    }

    for (const key of SHEET_METADATA_ARRAY_KEYS) {
      const entries = ownValue(sheet, key);
      if (!Array.isArray(entries)) continue;
      if (entries.length > limits.maxMetadataEntries - metadataEntries) {
        return resourceValidationError(
          "maxMetadataEntries",
          limits.maxMetadataEntries,
          metadataEntries + entries.length,
          `${path}.${key}`,
        );
      }
      metadataEntries += entries.length;
    }
  }
  return undefined;
}

/** Reject workbook dimensions before a direct store or grid allocates JS/WASM buffers. */
export function assertWorkbookAllocationLimits(
  workbook: Workbook,
  options: SnapshotValidationOptions = {},
): void {
  const resolved = resolveSnapshotValidationOptions(options);
  if ("code" in resolved) {
    throw new TypeError(resolved.message);
  }
  const { limits } = resolved;
  if (workbook.sheets.length > limits.maxSheets) {
    throw new SnapshotResourceError("maxSheets", limits.maxSheets, workbook.sheets.length);
  }

  let denseCells = 0;
  let metadataEntries = workbook.namedRanges?.length ?? 0;
  if (metadataEntries > limits.maxMetadataEntries) {
    throw new SnapshotResourceError(
      "maxMetadataEntries",
      limits.maxMetadataEntries,
      metadataEntries,
    );
  }
  for (const sheet of workbook.sheets) {
    if (!nonNegativeInteger(sheet.rowCount) || sheet.rowCount > limits.maxRowsPerSheet) {
      throw new SnapshotResourceError("maxRowsPerSheet", limits.maxRowsPerSheet, sheet.rowCount);
    }
    if (sheet.columns.length > limits.maxColumnsPerSheet) {
      throw new SnapshotResourceError(
        "maxColumnsPerSheet",
        limits.maxColumnsPerSheet,
        sheet.columns.length,
      );
    }
    if (productExceeds(sheet.rowCount, sheet.columns.length, limits.maxLogicalCellsPerSheet)) {
      throw new SnapshotResourceError(
        "maxLogicalCellsPerSheet",
        limits.maxLogicalCellsPerSheet,
        sheet.rowCount * sheet.columns.length,
      );
    }
    if (resolved.storage === "dense") {
      const remaining = limits.maxDenseCells - denseCells;
      if (remaining < 0 || productExceeds(sheet.rowCount, sheet.columns.length, remaining)) {
        throw new SnapshotResourceError(
          "maxDenseCells",
          limits.maxDenseCells,
          denseCells + sheet.rowCount * sheet.columns.length,
        );
      }
      denseCells += sheet.rowCount * sheet.columns.length;
    }

    metadataEntries +=
      (sheet.rowHeights?.size ?? 0) +
      (sheet.hiddenRows?.size ?? 0) +
      (sheet.merges?.length ?? 0) +
      (sheet.conditionalFormats?.length ?? 0) +
      (sheet.validationRules?.length ?? 0) +
      (sheet.protectedRanges?.length ?? 0) +
      (sheet.notes?.length ?? 0) +
      (sheet.sortKeys?.length ?? 0) +
      (sheet.filters?.length ?? 0) +
      (sheet.rowGroups?.length ?? 0);
    if (metadataEntries > limits.maxMetadataEntries) {
      throw new SnapshotResourceError(
        "maxMetadataEntries",
        limits.maxMetadataEntries,
        metadataEntries,
      );
    }
  }
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

function validateValidationComparison(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
  textLength: boolean,
): void {
  const comparison = recordAt(value, path, errors);
  if (!comparison) return;
  const operator = ownValue(comparison, "operator");
  const interval = operator === "between" || operator === "notBetween";
  const single = [
    "equal",
    "notEqual",
    "greaterThan",
    "lessThan",
    "greaterThanOrEqual",
    "lessThanOrEqual",
  ].includes(String(operator));
  if (!interval && !single) {
    invalid(errors, `${path}.operator`, "Validation comparison operator is invalid");
    return;
  }

  const validateOperand = (key: "min" | "max" | "value"): number | undefined => {
    const operand = ownValue(comparison, key);
    if (textLength) {
      if (nonNegativeInteger(operand)) return operand;
    } else if (finiteNumber(operand)) {
      return operand;
    }
    invalid(
      errors,
      `${path}.${key}`,
      textLength
        ? "Text length comparison operands must be non-negative integers"
        : "Validation comparison operands must be finite",
    );
    return undefined;
  };

  if (interval) {
    const min = validateOperand("min");
    const max = validateOperand("max");
    if (ownValue(comparison, "value") !== undefined) {
      invalid(errors, path, "Interval validation comparisons may not define value");
    }
    if (min !== undefined && max !== undefined && min > max) {
      invalid(errors, path, "Validation comparison minimum may not exceed maximum");
    }
    return;
  }

  validateOperand("value");
  if (ownValue(comparison, "min") !== undefined || ownValue(comparison, "max") !== undefined) {
    invalid(errors, path, "Single-value validation comparisons may not define min or max");
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
    const comparison = ownValue(condition, "comparison");
    if (comparison !== undefined && (min !== undefined || max !== undefined)) {
      invalid(errors, path, "Validation comparison may not be combined with legacy min or max");
    }
    if (comparison !== undefined) {
      validateValidationComparison(comparison, `${path}.comparison`, errors, false);
    }
    if (min !== undefined && !finiteNumber(min)) {
      invalid(errors, `${path}.min`, "Validation minimum must be finite");
    }
    if (max !== undefined && !finiteNumber(max)) {
      invalid(errors, `${path}.max`, "Validation maximum must be finite");
    }
    if (finiteNumber(min) && finiteNumber(max) && min > max) {
      invalid(errors, path, "Validation minimum may not exceed maximum");
    }
    if (kind === "number") optionalBoolean(condition, "integer", path, errors);
    return;
  }
  if (kind === "textLength") {
    const min = ownValue(condition, "min");
    const max = ownValue(condition, "max");
    const comparison = ownValue(condition, "comparison");
    if (comparison !== undefined && (min !== undefined || max !== undefined)) {
      invalid(errors, path, "Text length comparison may not be combined with legacy min or max");
    }
    if (comparison !== undefined) {
      validateValidationComparison(comparison, `${path}.comparison`, errors, true);
    }
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
  const visibility = ownValue(sheet, "visibility");
  if (
    visibility !== undefined &&
    visibility !== "visible" &&
    visibility !== "hidden" &&
    visibility !== "veryHidden"
  ) {
    invalid(errors, `${path}.visibility`, "Sheet visibility is invalid");
  }

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

interface IndexedMerge extends MergeRange {
  index: number;
}

interface MergeIntervalNode {
  rect: IndexedMerge;
  left: MergeIntervalNode | null;
  right: MergeIntervalNode | null;
  height: number;
  maxC1: number;
  minIndex: number;
  maxIndex: number;
}

export interface MergeValidationStats {
  normalized: number;
  nodeVisits: number;
  errors: number;
}

let lastMergeValidationStats: MergeValidationStats = {
  normalized: 0,
  nodeVisits: 0,
  errors: 0,
};

export function getLastMergeValidationStatsForTest(): MergeValidationStats {
  return { ...lastMergeValidationStats };
}

function mergeNodeHeight(node: MergeIntervalNode | null): number {
  return node?.height ?? 0;
}

function updateMergeNode(node: MergeIntervalNode): MergeIntervalNode {
  node.height = Math.max(mergeNodeHeight(node.left), mergeNodeHeight(node.right)) + 1;
  node.maxC1 = Math.max(node.rect.c1, node.left?.maxC1 ?? -1, node.right?.maxC1 ?? -1);
  node.minIndex = Math.min(
    node.rect.index,
    node.left?.minIndex ?? Number.POSITIVE_INFINITY,
    node.right?.minIndex ?? Number.POSITIVE_INFINITY,
  );
  node.maxIndex = Math.max(node.rect.index, node.left?.maxIndex ?? -1, node.right?.maxIndex ?? -1);
  return node;
}

function rotateMergeRight(root: MergeIntervalNode): MergeIntervalNode {
  const pivot = root.left!;
  root.left = pivot.right;
  pivot.right = updateMergeNode(root);
  return updateMergeNode(pivot);
}

function rotateMergeLeft(root: MergeIntervalNode): MergeIntervalNode {
  const pivot = root.right!;
  root.right = pivot.left;
  pivot.left = updateMergeNode(root);
  return updateMergeNode(pivot);
}

function balanceMergeNode(node: MergeIntervalNode): MergeIntervalNode {
  updateMergeNode(node);
  const balance = mergeNodeHeight(node.left) - mergeNodeHeight(node.right);
  if (balance > 1) {
    if (mergeNodeHeight(node.left!.left) < mergeNodeHeight(node.left!.right)) {
      node.left = rotateMergeLeft(node.left!);
    }
    return rotateMergeRight(node);
  }
  if (balance < -1) {
    if (mergeNodeHeight(node.right!.right) < mergeNodeHeight(node.right!.left)) {
      node.right = rotateMergeRight(node.right!);
    }
    return rotateMergeLeft(node);
  }
  return node;
}

function compareIndexedMerge(left: IndexedMerge, right: IndexedMerge): number {
  return left.c0 - right.c0 || left.index - right.index;
}

function insertMergeNode(node: MergeIntervalNode | null, rect: IndexedMerge): MergeIntervalNode {
  if (!node) {
    return {
      rect,
      left: null,
      right: null,
      height: 1,
      maxC1: rect.c1,
      minIndex: rect.index,
      maxIndex: rect.index,
    };
  }
  if (compareIndexedMerge(rect, node.rect) < 0) node.left = insertMergeNode(node.left, rect);
  else node.right = insertMergeNode(node.right, rect);
  return balanceMergeNode(node);
}

function removeMergeNode(
  node: MergeIntervalNode | null,
  rect: IndexedMerge,
): MergeIntervalNode | null {
  if (!node) return null;
  const order = compareIndexedMerge(rect, node.rect);
  if (order < 0) node.left = removeMergeNode(node.left, rect);
  else if (order > 0) node.right = removeMergeNode(node.right, rect);
  else {
    if (!node.left) return node.right;
    if (!node.right) return node.left;
    let successor = node.right;
    while (successor.left) successor = successor.left;
    node.rect = successor.rect;
    node.right = removeMergeNode(node.right, successor.rect);
  }
  return balanceMergeNode(node);
}

function lowerIndexOverlap(
  node: MergeIntervalNode | null,
  rect: IndexedMerge,
): IndexedMerge | null {
  if (!node || node.maxC1 < rect.c0 || node.minIndex >= rect.index) return null;
  lastMergeValidationStats.nodeVisits += 1;
  const left = lowerIndexOverlap(node.left, rect);
  if (left) return left;
  if (node.rect.index < rect.index && node.rect.c0 <= rect.c1 && node.rect.c1 >= rect.c0) {
    return node.rect;
  }
  if (node.rect.c0 > rect.c1) return null;
  return lowerIndexOverlap(node.right, rect);
}

function higherIndexOverlap(
  node: MergeIntervalNode | null,
  rect: IndexedMerge,
): IndexedMerge | null {
  if (!node || node.maxC1 < rect.c0 || node.maxIndex <= rect.index) return null;
  lastMergeValidationStats.nodeVisits += 1;
  const left = higherIndexOverlap(node.left, rect);
  if (left) return left;
  if (node.rect.index > rect.index && node.rect.c0 <= rect.c1 && node.rect.c1 >= rect.c0) {
    return node.rect;
  }
  if (node.rect.c0 > rect.c1) return null;
  return higherIndexOverlap(node.right, rect);
}

function overlappingMergeIndices(merges: readonly MergeRange[]): boolean[] {
  const indexed: IndexedMerge[] = merges.map((merge, index) => ({ ...merge, index }));
  const starts = indexed
    .slice()
    .sort((left, right) => left.r0 - right.r0 || left.index - right.index);
  const ends = indexed
    .slice()
    .sort((left, right) => left.r1 - right.r1 || left.index - right.index);
  const overlapping = new Array<boolean>(merges.length).fill(false);
  let active: MergeIntervalNode | null = null;
  let unflagged: MergeIntervalNode | null = null;
  let endIndex = 0;

  for (const rect of starts) {
    while ((ends[endIndex]?.r1 ?? Number.POSITIVE_INFINITY) < rect.r0) {
      const expired = ends[endIndex++]!;
      active = removeMergeNode(active, expired);
      unflagged = removeMergeNode(unflagged, expired);
    }

    if (lowerIndexOverlap(active, rect)) overlapping[rect.index] = true;
    let later = higherIndexOverlap(unflagged, rect);
    while (later) {
      overlapping[later.index] = true;
      unflagged = removeMergeNode(unflagged, later);
      later = higherIndexOverlap(unflagged, rect);
    }

    active = insertMergeNode(active, rect);
    if (!overlapping[rect.index]) unflagged = insertMergeNode(unflagged, rect);
  }

  return overlapping;
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
  lastMergeValidationStats = { normalized: 0, nodeVisits: 0, errors: 0 };
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
      lastMergeValidationStats.normalized += 1;
      const mergePath = `${path}.merges[${mergeIndex}]`;
      if (merge.r1 >= sheet.rowCount || merge.c1 >= sheet.columns.length) {
        invalid(errors, mergePath, "Merge lies outside the sheet", "out-of-bounds");
      }
      merges.push(merge);
    }
    const overlappingMerges = overlappingMergeIndices(merges);
    for (let mergeIndex = 0; mergeIndex < overlappingMerges.length; mergeIndex++) {
      if (!overlappingMerges[mergeIndex]) continue;
      lastMergeValidationStats.errors += 1;
      invalid(
        errors,
        `${path}.merges[${mergeIndex}]`,
        "Merged regions may not overlap",
        "overlapping-merge",
      );
    }

    const occupied = new Set<string>();
    for (let blockIndex = 0; blockIndex < sheet.cells.length; blockIndex++) {
      const block = sheet.cells[blockIndex]!;
      const blockPath = `${path}.cells[${blockIndex}]`;
      const blockInBounds =
        block.startRow <= sheet.rowCount &&
        block.rowCount <= sheet.rowCount - block.startRow &&
        block.startCol <= sheet.columns.length &&
        block.colCount <= sheet.columns.length - block.startCol;
      if (!blockInBounds) {
        invalid(errors, blockPath, "Cell block lies outside the sheet", "out-of-bounds");
      }
      for (let cellIndex = 0; cellIndex < block.cells.length; cellIndex++) {
        const cell = block.cells[cellIndex]!;
        const cellPath = `${blockPath}.cells[${cellIndex}]`;
        if (cell.rowOffset >= block.rowCount || cell.colOffset >= block.colCount) {
          invalid(errors, cellPath, "Cell offset lies outside its block", "out-of-bounds");
          continue;
        }
        if (!blockInBounds) continue;
        const key = `${block.startRow + cell.rowOffset}:${block.startCol + cell.colOffset}`;
        if (occupied.has(key)) {
          invalid(errors, cellPath, "A snapshot cell may appear only once", "duplicate-id");
        }
        occupied.add(key);
      }
    }
    const metadataRows = new Set<number>();
    for (let index = 0; index < (sheet.rowMeta?.length ?? 0); index++) {
      const row = sheet.rowMeta![index]![0];
      if (row >= sheet.rowCount) {
        invalid(
          errors,
          `${path}.rowMeta[${index}][0]`,
          "Row metadata lies outside the sheet",
          "out-of-bounds",
        );
      } else if (metadataRows.has(row)) {
        invalid(
          errors,
          `${path}.rowMeta[${index}][0]`,
          "Row metadata indices must be unique",
          "duplicate-id",
        );
      }
      metadataRows.add(row);
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
export function validateWorkbookSnapshot(
  input: unknown,
  options: SnapshotValidationOptions = {},
): DocumentValidationResult {
  try {
    const resolved = resolveSnapshotValidationOptions(options);
    if ("code" in resolved) return { ok: false, errors: [resolved] };
    const resourceIssue = preflightSnapshotResources(input, resolved);
    if (resourceIssue) return { ok: false, errors: [resourceIssue] };
    const issue = findJsonSafetyIssue(input, "$", new Set<object>(), {
      bytes: 0,
      maxBytes: resolved.limits.maxSerializedBytes,
    });
    if (issue) {
      return {
        ok: false,
        errors: [{ path: issue.path, code: issue.code, message: issue.message }],
      };
    }
    return validateJsonSafeSnapshot(input);
  } catch (error) {
    const resourceFailure = error instanceof RangeError;
    return {
      ok: false,
      errors: [
        {
          path: "$",
          code: resourceFailure ? "resource-limit" : "invalid-value",
          message: resourceFailure
            ? "Snapshot inspection exceeded a safe resource limit"
            : "Snapshot could not be inspected safely",
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
