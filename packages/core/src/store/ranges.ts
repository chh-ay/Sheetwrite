import type { Column } from "../types/cell.js";
import type { CellAddress, MergeRange, Range, SheetId } from "../types/coordinates.js";
import type {
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  ProtectedRange,
  Sheet,
  SheetVisibility,
  SortKey,
} from "../types/document.js";

export function integerAt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function positiveCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function uniqueColumnKeys(columns: readonly Column[]): boolean {
  const keys = new Set<string>();
  for (const column of columns) {
    if (!column.key || keys.has(column.key)) return false;
    keys.add(column.key);
  }
  return true;
}

/** Right visible neighbor, then left; `removedIndex` retains ordering after removal. */
export function visibleSheetNeighbor(
  sheets: readonly { id: SheetId; visibility?: SheetVisibility }[],
  source: SheetId,
  removedIndex?: number,
): SheetId | null {
  const sourceIndex = sheets.findIndex((sheet) => sheet.id === source);
  const rightStart =
    sourceIndex >= 0
      ? sourceIndex + 1
      : Math.max(0, Math.min(removedIndex ?? sheets.length, sheets.length));
  for (let index = rightStart; index < sheets.length; index++) {
    const sheet = sheets[index]!;
    if ((sheet.visibility ?? "visible") === "visible") return sheet.id;
  }
  const leftStart =
    sourceIndex >= 0 ? sourceIndex - 1 : Math.min(rightStart - 1, sheets.length - 1);
  for (let index = leftStart; index >= 0; index--) {
    const sheet = sheets[index]!;
    if ((sheet.visibility ?? "visible") === "visible") return sheet.id;
  }
  return null;
}

export function normalizedRange(range: Range): Range {
  return {
    sheet: range.sheet,
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}

export function normalizeMerge(merge: MergeRange): MergeRange {
  return {
    r0: Math.min(merge.r0, merge.r1),
    c0: Math.min(merge.c0, merge.c1),
    r1: Math.max(merge.r0, merge.r1),
    c1: Math.max(merge.c0, merge.c1),
  };
}

export function validMerge(sheet: Sheet, merge: MergeRange): boolean {
  return (
    [merge.r0, merge.c0, merge.r1, merge.c1].every(integerAt) &&
    merge.r0 <= merge.r1 &&
    merge.c0 <= merge.c1 &&
    merge.r1 < sheet.rowCount &&
    merge.c1 < sheet.columns.length &&
    (merge.r0 !== merge.r1 || merge.c0 !== merge.c1)
  );
}

export function mergesOverlap(left: MergeRange, right: MergeRange): boolean {
  return left.r0 <= right.r1 && right.r0 <= left.r1 && left.c0 <= right.c1 && right.c0 <= left.c1;
}

export function sameMerge(left: MergeRange, right: MergeRange): boolean {
  const normalized = normalizeMerge(left);
  return (
    normalized.r0 === right.r0 &&
    normalized.c0 === right.c0 &&
    normalized.r1 === right.r1 &&
    normalized.c1 === right.c1
  );
}

export function mergeCrossesFreeze(sheet: Sheet, merge: MergeRange): boolean {
  const frozenRows = sheet.frozenRows ?? 0;
  const frozenCols = sheet.frozenCols ?? 0;
  return (
    (merge.r0 < frozenRows && merge.r1 >= frozenRows) ||
    (merge.c0 < frozenCols && merge.c1 >= frozenCols)
  );
}

function validValidationComparison(value: unknown, textLength: boolean): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const comparison = value as Record<string, unknown>;
  const operator = comparison.operator;
  const validOperand = (operand: unknown): operand is number =>
    textLength
      ? typeof operand === "number" && Number.isSafeInteger(operand) && operand >= 0
      : typeof operand === "number" && Number.isFinite(operand);

  if (operator === "between" || operator === "notBetween") {
    return (
      validOperand(comparison.min) &&
      validOperand(comparison.max) &&
      comparison.min <= comparison.max &&
      comparison.value === undefined
    );
  }
  if (
    ![
      "equal",
      "notEqual",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ].includes(String(operator))
  ) {
    return false;
  }
  return (
    validOperand(comparison.value) && comparison.min === undefined && comparison.max === undefined
  );
}

export function validValidationRules(sheet: Sheet, rules: readonly DataValidationRule[]): boolean {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!rule.id || ids.has(rule.id) || rule.range.sheet !== sheet.id) return false;
    ids.add(rule.id);
    const range = normalizedRange(rule.range);
    if (
      !integerAt(range.start.row) ||
      !integerAt(range.start.col) ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length ||
      !["reject", "warn", "allow"].includes(rule.policy)
    ) {
      return false;
    }
    const condition = rule.condition;
    if (condition.kind === "list") {
      if (!Array.isArray(condition.values) || condition.values.length === 0) return false;
    } else if (condition.kind === "number" || condition.kind === "date") {
      if (
        (condition.min !== undefined && !Number.isFinite(condition.min)) ||
        (condition.max !== undefined && !Number.isFinite(condition.max)) ||
        (condition.min !== undefined &&
          condition.max !== undefined &&
          condition.min > condition.max) ||
        (condition.comparison !== undefined &&
          (condition.min !== undefined ||
            condition.max !== undefined ||
            !validValidationComparison(condition.comparison, false)))
      ) {
        return false;
      }
    } else if (condition.kind === "textLength") {
      if (
        (condition.min !== undefined &&
          (!Number.isSafeInteger(condition.min) || condition.min < 0)) ||
        (condition.max !== undefined &&
          (!Number.isSafeInteger(condition.max) || condition.max < 0)) ||
        (condition.min !== undefined &&
          condition.max !== undefined &&
          condition.min > condition.max) ||
        (condition.comparison !== undefined &&
          (condition.min !== undefined ||
            condition.max !== undefined ||
            !validValidationComparison(condition.comparison, true)))
      ) {
        return false;
      }
    } else if (condition.kind !== "checkbox") {
      return false;
    }
  }
  return true;
}

export function validProtectedRanges(sheet: Sheet, ranges: readonly ProtectedRange[]): boolean {
  const ids = new Set<string>();
  for (const protectedRange of ranges) {
    const range = normalizedRange(protectedRange.range);
    if (
      !protectedRange.id ||
      ids.has(protectedRange.id) ||
      range.sheet !== sheet.id ||
      !integerAt(range.start.row) ||
      !integerAt(range.start.col) ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length
    ) {
      return false;
    }
    ids.add(protectedRange.id);
  }
  return true;
}

export function validNotes(sheet: Sheet): boolean {
  const addresses = new Set<string>();
  for (const note of sheet.notes ?? []) {
    const key = `${note.addr.row}:${note.addr.col}`;
    if (
      note.addr.sheet !== sheet.id ||
      !integerAt(note.addr.row) ||
      !integerAt(note.addr.col) ||
      note.addr.row >= sheet.rowCount ||
      note.addr.col >= sheet.columns.length ||
      typeof note.text !== "string" ||
      note.text.length === 0 ||
      addresses.has(key)
    ) {
      return false;
    }
    addresses.add(key);
  }
  return true;
}

export function validSortAndFilters(
  sheet: Sheet,
  sortKeys: readonly SortKey[],
  filters: readonly [number, ColumnFilter][],
): boolean {
  const sorted = new Set<number>();
  for (const key of sortKeys) {
    if (!integerAt(key.col) || key.col >= sheet.columns.length || sorted.has(key.col)) return false;
    sorted.add(key.col);
  }
  const filtered = new Set<number>();
  for (const [col, filter] of filters) {
    if (!integerAt(col) || col >= sheet.columns.length || filtered.has(col)) return false;
    filtered.add(col);
    if (
      filter.kind === "values"
        ? !Array.isArray(filter.values)
        : filter.kind === "contains"
          ? typeof filter.text !== "string"
          : filter.kind === "compare"
            ? !["gt", "gte", "lt", "lte", "eq", "neq"].includes(filter.op) ||
              !Number.isFinite(filter.value)
            : filter.kind !== "empty" && filter.kind !== "nonEmpty"
    ) {
      return false;
    }
  }
  return true;
}

export function patchSheetId(patch: DocumentOp): SheetId | null {
  switch (patch.op) {
    case "set":
    case "setNote":
      return patch.addr.sheet;
    case "setRange":
    case "setBlock":
    case "setRangeStyle":
    case "clearRange":
      return patch.range.sheet;
    case "addTable":
      return patch.table.range.sheet;
    case "setNamedRange":
    case "removeNamedRange":
      return null;
    case "addSheet":
      return patch.sheet.id;
    default:
      return patch.sheet;
  }
}

export function cellRange(addr: CellAddress): Range {
  return {
    sheet: addr.sheet,
    start: { row: addr.row, col: addr.col },
    end: { row: addr.row, col: addr.col },
  };
}

export function fullSheetRange(sheet: Sheet): Range {
  return {
    sheet: sheet.id,
    start: { row: 0, col: 0 },
    end: { row: sheet.rowCount - 1, col: sheet.columns.length - 1 },
  };
}

export function rangesIntersect(left: Range, right: Range): boolean {
  if (left.sheet !== right.sheet) return false;
  const a = normalizedRange(left);
  const b = normalizedRange(right);
  return (
    a.start.row <= b.end.row &&
    b.start.row <= a.end.row &&
    a.start.col <= b.end.col &&
    b.start.col <= a.end.col
  );
}

export function rangeContains(range: Range, addr: CellAddress): boolean {
  if (range.sheet !== addr.sheet) return false;
  const normalized = normalizedRange(range);
  return (
    addr.row >= normalized.start.row &&
    addr.row <= normalized.end.row &&
    addr.col >= normalized.start.col &&
    addr.col <= normalized.end.col
  );
}

export function rebaseRangeRows<T extends { range: Range }>(
  item: T,
  sheet: SheetId,
  remap: (row: number) => number | null,
): T | null {
  if (item.range.sheet !== sheet) return item;
  const span = remapSpan(item.range.start.row, item.range.end.row, remap);
  if (!span) return null;
  return {
    ...item,
    range: {
      ...item.range,
      start: { ...item.range.start, row: span[0] },
      end: { ...item.range.end, row: span[1] },
    },
  };
}

export function rebaseRangeCols<T extends { range: Range }>(
  item: T,
  sheet: SheetId,
  remap: (col: number) => number | null,
): T | null {
  if (item.range.sheet !== sheet) return item;
  const span = remapSpan(item.range.start.col, item.range.end.col, remap);
  if (!span) return null;
  return {
    ...item,
    range: {
      ...item.range,
      start: { ...item.range.start, col: span[0] },
      end: { ...item.range.end, col: span[1] },
    },
  };
}

export function remapSpan(
  start: number,
  end: number,
  remap: (index: number) => number | null,
): [number, number] | null {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  let mappedStart: number | null = null;
  for (let index = low; index <= high; index++) {
    const mapped = remap(index);
    if (mapped !== null) {
      mappedStart = mapped;
      break;
    }
  }
  if (mappedStart === null) return null;
  let mappedEnd = mappedStart;
  for (let index = high; index >= low; index--) {
    const mapped = remap(index);
    if (mapped !== null) {
      mappedEnd = mapped;
      break;
    }
  }
  return [Math.min(mappedStart, mappedEnd), Math.max(mappedStart, mappedEnd)];
}

export function moveIndex(index: number, from: number, count: number, to: number): number {
  if (index >= from && index < from + count) return to + index - from;
  const removed = index < from ? index : index - count;
  return removed >= to ? removed + count : removed;
}
