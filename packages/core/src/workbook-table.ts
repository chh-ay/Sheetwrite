import { SheetwriteError } from "./errors.js";
import type { Sheet } from "./types/document.js";
import type {
  WorkbookTable,
  WorkbookTableColumn,
  WorkbookTableStyle,
  WorkbookTableUnsupportedFeature,
} from "./types/table.js";

/** Resource ceilings for canonical workbook-table metadata and identifiers. */
export interface WorkbookTableResourceLimits {
  maxTables: number;
  maxColumnsPerTable: number;
  maxNameLength: number;
  maxIdLength: number;
  maxStyleNameLength: number;
  maxUnsupportedFeaturesPerTable: number;
}

/** Independent metadata ceilings enforced before table arrays cross the WASM boundary. */
export const DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS: Readonly<WorkbookTableResourceLimits> =
  Object.freeze({
    maxTables: 1_024,
    maxColumnsPerTable: 16_384,
    maxNameLength: 255,
    maxIdLength: 128,
    maxStyleNameLength: 255,
    maxUnsupportedFeaturesPerTable: 16,
  });

/** Stable reason code returned when a workbook table name is rejected. */
export type WorkbookTableNameIssueCode =
  | "empty"
  | "too-long"
  | "invalid-characters"
  | "cell-reference"
  | "duplicate";

/** Result of validating and NFC-normalizing a workbook table name. */
export type WorkbookTableNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; code: WorkbookTableNameIssueCode };

const TABLE_NAME = /^[\p{L}_\\][\p{L}\p{N}_.\\]*$/u;
const A1_REFERENCE = /^[A-Za-z]{1,3}[1-9][0-9]*$/;
const R1C1_REFERENCE = /^R[1-9][0-9]*C[1-9][0-9]*$/i;
const UNSUPPORTED_FEATURES: Readonly<Record<WorkbookTableUnsupportedFeature, true>> = Object.freeze(
  {
    "auto-filter": true,
    "sort-state": true,
    "calculated-columns": true,
    "totals-functions": true,
    "query-table": true,
    "external-data": true,
    extensions: true,
  },
);

/** Locale-independent key used for table and table-column collision checks. */
export function workbookTableNameKey(name: string): string {
  return name.normalize("NFC").toUpperCase();
}

/** Validate and NFC-normalize an ECMA-compatible structured-reference name. */
export function validateWorkbookTableName(
  input: string,
  existingNames: readonly string[] = [],
  maxLength = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxNameLength,
): WorkbookTableNameValidationResult {
  const name = input.normalize("NFC");
  if (name.length === 0) return { ok: false, code: "empty" };
  if (name.length > maxLength) return { ok: false, code: "too-long" };
  if (!TABLE_NAME.test(name)) return { ok: false, code: "invalid-characters" };
  if (A1_REFERENCE.test(name) || R1C1_REFERENCE.test(name)) {
    return { ok: false, code: "cell-reference" };
  }
  const key = workbookTableNameKey(name);
  if (existingNames.some((candidate) => workbookTableNameKey(candidate) === key)) {
    return { ok: false, code: "duplicate" };
  }
  return { ok: true, name };
}

function validId(value: string, limits: Readonly<WorkbookTableResourceLimits>): boolean {
  return value.length > 0 && value.length <= limits.maxIdLength;
}

function validColumn(
  column: WorkbookTableColumn,
  names: Set<string>,
  ids: Set<string>,
  limits: Readonly<WorkbookTableResourceLimits>,
): boolean {
  const idKey = workbookTableNameKey(column.id);
  if (!validId(column.id, limits) || column.id !== column.id.normalize("NFC") || ids.has(idKey)) {
    return false;
  }
  if (
    column.name.length === 0 ||
    column.name.length > limits.maxNameLength ||
    column.name !== column.name.normalize("NFC") ||
    /[[\],]/u.test(column.name) ||
    column.name.startsWith("@") ||
    column.name.startsWith("#")
  ) {
    return false;
  }
  const key = workbookTableNameKey(column.name);
  if (names.has(key)) return false;
  if (column.totalsRowLabel !== undefined && column.totalsRowLabel.length > limits.maxNameLength) {
    return false;
  }
  ids.add(idKey);
  names.add(key);
  return true;
}

function validStyle(
  style: WorkbookTableStyle | undefined,
  limits: Readonly<WorkbookTableResourceLimits>,
): boolean {
  if (!style) return true;
  if (style.name !== undefined && style.name.length > limits.maxStyleNameLength) return false;
  return [
    style.showFirstColumn,
    style.showLastColumn,
    style.showRowStripes,
    style.showColumnStripes,
  ].every((value) => value === undefined || typeof value === "boolean");
}

/** Validate one canonical table against sheet bounds and workbook-global identities. */
export function validWorkbookTable(
  table: WorkbookTable,
  sheet: Sheet,
  existing: readonly WorkbookTable[],
  limits: Readonly<WorkbookTableResourceLimits> = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
): boolean {
  if (!validId(table.id, limits) || existing.some((candidate) => candidate.id === table.id)) {
    return false;
  }
  const validatedName = validateWorkbookTableName(
    table.name,
    existing.map((candidate) => candidate.name),
    limits.maxNameLength,
  );
  if (!validatedName.ok || validatedName.name !== table.name) return false;
  if (table.range.sheet !== sheet.id) return false;
  const r0 = Math.min(table.range.start.row, table.range.end.row);
  const r1 = Math.max(table.range.start.row, table.range.end.row);
  const c0 = Math.min(table.range.start.col, table.range.end.col);
  const c1 = Math.max(table.range.start.col, table.range.end.col);
  if (
    table.range.start.row !== r0 ||
    table.range.end.row !== r1 ||
    table.range.start.col !== c0 ||
    table.range.end.col !== c1
  ) {
    return false;
  }
  if (
    !Number.isSafeInteger(r0) ||
    !Number.isSafeInteger(r1) ||
    !Number.isSafeInteger(c0) ||
    !Number.isSafeInteger(c1) ||
    r0 < 0 ||
    c0 < 0 ||
    r1 >= sheet.rowCount ||
    c1 >= sheet.columns.length
  ) {
    return false;
  }
  const width = c1 - c0 + 1;
  if (width > limits.maxColumnsPerTable || table.columns.length !== width) return false;
  if (typeof table.headerRow !== "boolean" || typeof table.totalsRow !== "boolean") return false;
  if (table.headerRow && table.totalsRow && r0 === r1) return false;
  const columnNames = new Set<string>();
  const columnIds = new Set<string>();
  if (!table.columns.every((column) => validColumn(column, columnNames, columnIds, limits))) {
    return false;
  }
  if (!validStyle(table.style, limits)) return false;
  if (
    (table.unsupportedFeatures?.length ?? 0) > limits.maxUnsupportedFeaturesPerTable ||
    new Set(table.unsupportedFeatures).size !== (table.unsupportedFeatures?.length ?? 0) ||
    table.unsupportedFeatures?.some((feature) => UNSUPPORTED_FEATURES[feature] !== true)
  ) {
    return false;
  }
  return !existing.some((candidate) => {
    if (candidate.range.sheet !== table.range.sheet) return false;
    const otherR0 = Math.min(candidate.range.start.row, candidate.range.end.row);
    const otherR1 = Math.max(candidate.range.start.row, candidate.range.end.row);
    const otherC0 = Math.min(candidate.range.start.col, candidate.range.end.col);
    const otherC1 = Math.max(candidate.range.start.col, candidate.range.end.col);
    return r0 <= otherR1 && r1 >= otherR0 && c0 <= otherC1 && c1 >= otherC0;
  });
}

/** Reject an invalid or oversized live workbook before table arrays are copied to WASM. */
export function assertWorkbookTables(
  sheets: readonly Sheet[],
  limits: Readonly<WorkbookTableResourceLimits> = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  reservedNames: readonly string[] = [],
): void {
  const tableCount = sheets.reduce((count, sheet) => count + (sheet.tables?.length ?? 0), 0);
  if (tableCount > limits.maxTables) {
    throw new SheetwriteError(
      "resource-limit",
      "snapshot-allocate",
      `Sheetwrite: workbook table limit is ${limits.maxTables}; observed ${tableCount}`,
      { context: { resource: "tables", limit: limits.maxTables, actual: tableCount } },
    );
  }
  const reserved = new Set(reservedNames.map(workbookTableNameKey));
  const accepted: WorkbookTable[] = [];
  for (const sheet of sheets) {
    for (const table of sheet.tables ?? []) {
      if (
        reserved.has(workbookTableNameKey(table.name)) ||
        !validWorkbookTable(table, sheet, accepted, limits)
      ) {
        throw new SheetwriteError(
          "invalid-snapshot",
          "snapshot-allocate",
          `Sheetwrite: invalid or namespace-conflicting workbook table ${table.id || "<empty>"}`,
          { context: { tableId: table.id, sheet: sheet.id } },
        );
      }
      accepted.push(table);
    }
  }
}
