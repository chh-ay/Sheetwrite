import type { DocumentOp, MergeRange, SheetSnapshot, WorkbookSnapshot } from "./types.js";

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

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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

function hasNonSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return true;
  }
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  if (value instanceof Map || value instanceof Set || ArrayBuffer.isView(value)) return true;
  seen.add(value);
  const invalid = Object.values(value).some((entry) => hasNonSerializable(entry, seen));
  seen.delete(value);
  return invalid;
}

/** Validate and canonically order a schema-1 snapshot without hydrating runtime state. */
export function validateWorkbookSnapshot(input: unknown): DocumentValidationResult {
  const errors: DocumentValidationError[] = [];
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      errors: [{ path: "$", code: "invalid-value", message: "Snapshot must be an object" }],
    };
  }
  const candidate = input as Partial<WorkbookSnapshot> & { schemaVersion?: unknown };
  if (candidate.schemaVersion !== WORKBOOK_SCHEMA_VERSION) {
    errors.push({
      path: "schemaVersion",
      code: "unsupported-schema",
      message: `Unsupported workbook schema version: ${String(candidate.schemaVersion)}`,
    });
  }
  if (hasNonSerializable(input)) {
    errors.push({
      path: "$",
      code: "non-serializable",
      message: "Snapshot contains a function, collection, typed array, bigint, symbol, or cycle",
    });
  }
  if (!Array.isArray(candidate.sheets) || candidate.sheets.length === 0) {
    errors.push({
      path: "sheets",
      code: "invalid-value",
      message: "At least one sheet is required",
    });
    return { ok: false, errors };
  }

  const ids = new Set<string>();
  const orders = new Set<number>();
  const normalizedSheets: SheetSnapshot[] = [];
  for (let index = 0; index < candidate.sheets.length; index++) {
    const sheet = candidate.sheets[index]!;
    const path = `sheets[${index}]`;
    if (!sheet.id || ids.has(sheet.id)) {
      errors.push({
        path: `${path}.id`,
        code: "duplicate-id",
        message: "Sheet IDs must be unique",
      });
    }
    ids.add(sheet.id);
    if (!integer(sheet.order) || orders.has(sheet.order)) {
      errors.push({
        path: `${path}.order`,
        code: "duplicate-id",
        message: "Sheet order must be unique",
      });
    }
    orders.add(sheet.order);
    if (!integer(sheet.rowCount)) {
      errors.push({
        path: `${path}.rowCount`,
        code: "invalid-value",
        message: "rowCount must be a non-negative integer",
      });
    }
    if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) {
      errors.push({
        path: `${path}.columns`,
        code: "invalid-value",
        message: "A sheet needs at least one column",
      });
      continue;
    }
    const keys = new Set<string>();
    for (let col = 0; col < sheet.columns.length; col++) {
      const column = sheet.columns[col]!;
      if (!column.key || keys.has(column.key)) {
        errors.push({
          path: `${path}.columns[${col}].key`,
          code: "duplicate-id",
          message: "Column keys must be unique and stable",
        });
      }
      keys.add(column.key);
      if (!Number.isFinite(column.width) || column.width < 0) {
        errors.push({
          path: `${path}.columns[${col}].width`,
          code: "invalid-value",
          message: "Column width must be finite and non-negative",
        });
      }
    }

    const merges: MergeRange[] = [];
    for (let mergeIndex = 0; mergeIndex < (sheet.merges?.length ?? 0); mergeIndex++) {
      const merge = normalizedMerge(sheet.merges![mergeIndex]!);
      const mergePath = `${path}.merges[${mergeIndex}]`;
      if (![merge.r0, merge.c0, merge.r1, merge.c1].every(integer)) {
        errors.push({
          path: mergePath,
          code: "invalid-value",
          message: "Merge coordinates must be non-negative integers",
        });
      } else if (merge.r1 >= sheet.rowCount || merge.c1 >= sheet.columns.length) {
        errors.push({
          path: mergePath,
          code: "out-of-bounds",
          message: "Merge lies outside the sheet",
        });
      }
      if (merges.some((existing) => overlaps(existing, merge))) {
        errors.push({
          path: mergePath,
          code: "overlapping-merge",
          message: "Merged regions may not overlap",
        });
      }
      merges.push(merge);
    }

    const occupied = new Set<string>();
    for (let blockIndex = 0; blockIndex < sheet.cells.length; blockIndex++) {
      const block = sheet.cells[blockIndex]!;
      const blockPath = `${path}.cells[${blockIndex}]`;
      if (
        ![block.startRow, block.startCol, block.rowCount, block.colCount].every(integer) ||
        block.rowCount === 0 ||
        block.colCount === 0
      ) {
        errors.push({
          path: blockPath,
          code: "invalid-value",
          message: "Cell block bounds must be positive integer dimensions",
        });
        continue;
      }
      if (
        block.startRow + block.rowCount > sheet.rowCount ||
        block.startCol + block.colCount > sheet.columns.length
      ) {
        errors.push({
          path: blockPath,
          code: "out-of-bounds",
          message: "Cell block lies outside the sheet",
        });
      }
      for (let cellIndex = 0; cellIndex < block.cells.length; cellIndex++) {
        const cell = block.cells[cellIndex]!;
        const cellPath = `${blockPath}.cells[${cellIndex}]`;
        if (
          !integer(cell.rowOffset) ||
          !integer(cell.colOffset) ||
          cell.rowOffset >= block.rowCount ||
          cell.colOffset >= block.colCount
        ) {
          errors.push({
            path: cellPath,
            code: "out-of-bounds",
            message: "Cell offset lies outside its block",
          });
          continue;
        }
        const key = `${block.startRow + cell.rowOffset}:${block.startCol + cell.colOffset}`;
        if (occupied.has(key)) {
          errors.push({
            path: cellPath,
            code: "duplicate-id",
            message: "A snapshot cell may appear only once",
          });
        }
        occupied.add(key);
      }
    }

    for (const [row] of sheet.rowMeta ?? []) {
      if (!integer(row) || row >= sheet.rowCount) {
        errors.push({
          path: `${path}.rowMeta`,
          code: "out-of-bounds",
          message: "Row metadata lies outside the sheet",
        });
      }
    }
    for (const [field, value, limit] of [
      ["frozenRows", sheet.frozenRows, sheet.rowCount],
      ["frozenCols", sheet.frozenCols, sheet.columns.length],
    ] as const) {
      if (value !== undefined && (!integer(value) || value > limit)) {
        errors.push({
          path: `${path}.${field}`,
          code: "out-of-bounds",
          message: `${field} lies outside the sheet`,
        });
      }
    }
    for (const group of sheet.rowGroups ?? []) {
      if (
        !integer(group.start) ||
        !integer(group.end) ||
        group.start > group.end ||
        group.end >= sheet.rowCount
      ) {
        errors.push({
          path: `${path}.rowGroups`,
          code: "out-of-bounds",
          message: "Row group lies outside the sheet",
        });
      }
    }
    normalizedSheets.push({
      ...sheet,
      merges: merges.length > 0 ? merges : undefined,
      rowMeta: sheet.rowMeta ? [...sheet.rowMeta].sort((a, b) => a[0] - b[0]) : undefined,
      cells: sheet.cells.map((block) => ({
        ...block,
        cells: [...block.cells].sort(
          (a, b) => a.rowOffset - b.rowOffset || a.colOffset - b.colOffset,
        ),
      })),
    });
  }

  const activeSheet = candidate.workbook?.activeSheet;
  if (!activeSheet || !ids.has(activeSheet)) {
    errors.push({
      path: "workbook.activeSheet",
      code: "missing-reference",
      message: "Active sheet must exist",
    });
  }
  const sheetById = new Map(candidate.sheets.map((sheet) => [sheet.id, sheet]));
  for (const sheet of candidate.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind !== "ref") continue;
        const targetSheet = sheetById.get(cell.value.target.sheet);
        const targetInBounds =
          targetSheet !== undefined &&
          integer(cell.value.target.row) &&
          integer(cell.value.target.col) &&
          cell.value.target.row < targetSheet.rowCount &&
          cell.value.target.col < targetSheet.columns.length;
        if (!targetInBounds) {
          errors.push({
            path: `sheets.${sheet.id}.cells`,
            code: targetSheet ? "out-of-bounds" : "missing-reference",
            message: "Cell reference target must exist and be in bounds",
          });
        }
      }
    }
  }
  for (const namedRange of candidate.workbook?.namedRanges ?? []) {
    const targetSheet = sheetById.get(namedRange.range.sheet);
    const { start, end } = namedRange.range;
    const inBounds =
      targetSheet !== undefined &&
      [start.row, start.col, end.row, end.col].every(integer) &&
      Math.max(start.row, end.row) < targetSheet.rowCount &&
      Math.max(start.col, end.col) < targetSheet.columns.length;
    if (!inBounds) {
      errors.push({
        path: `workbook.namedRanges.${namedRange.name}`,
        code: targetSheet ? "out-of-bounds" : "missing-reference",
        message: "Named range target must exist and be in bounds",
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // Every schema-1 field used below has been validated above; retain unknown at the API boundary.
  const validated = candidate as WorkbookSnapshot;
  return {
    ok: true,
    value: {
      ...validated,
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      sheets: normalizedSheets.sort((a, b) => a.order - b.order),
    },
  };
}

/** Exhaustive stable target identity used by persistence/logging layers. */
export function documentOpTarget(operation: DocumentOp): string {
  switch (operation.op) {
    case "set":
      return operation.addr.sheet;
    case "setRange":
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
