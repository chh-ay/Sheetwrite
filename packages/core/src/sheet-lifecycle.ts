import { validConditionalRules } from "./conditional-format.js";
import { validateSheetName } from "./sheet-name.js";
import type { SheetId } from "./types/coordinates.js";
import type {
  DocumentOp,
  Sheet,
  SheetLifecycleIssueCode,
  SheetSnapshot,
  SheetVisibility,
} from "./types/document.js";
import {
  integerAt,
  mergeCrossesFreeze,
  mergesOverlap,
  normalizeMerge,
  positiveCount,
  uniqueColumnKeys,
  validMerge,
  validNotes,
  validProtectedRanges,
  validSortAndFilters,
  validValidationRules,
} from "./store/ranges.js";

export interface SheetLifecycleState {
  readonly sheets: Array<{
    id: SheetId;
    name: string;
    visibility: SheetVisibility;
  }>;
}

export type SheetLifecycleOperationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: SheetLifecycleIssueCode };

export function createSheetLifecycleState(
  sheets: readonly { id: SheetId; name: string; visibility?: SheetVisibility }[],
): SheetLifecycleState {
  return {
    sheets: sheets.map(({ id, name, visibility }) => ({
      id,
      name,
      visibility: visibility ?? "visible",
    })),
  };
}

function addSheetSnapshotIssue(
  snapshot: SheetSnapshot,
  existing: readonly { id: SheetId; name: string }[],
): SheetLifecycleIssueCode | null {
  if (!snapshot.id) return "invalid-sheet";
  if (existing.some((sheet) => sheet.id === snapshot.id)) return "duplicate-sheet-id";
  const name = validateSheetName(
    snapshot.name,
    existing.map((sheet) => sheet.name),
  );
  if (!name.ok) return name.code;
  if (!integerAt(snapshot.order) || snapshot.order > existing.length) return "invalid-position";
  if (
    !integerAt(snapshot.rowCount) ||
    snapshot.columns.length === 0 ||
    !uniqueColumnKeys(snapshot.columns)
  ) {
    return "invalid-sheet";
  }
  const merges = snapshot.merges?.map(normalizeMerge) ?? [];
  const candidate: Sheet = {
    id: snapshot.id,
    name: name.name,
    visibility: snapshot.visibility,
    rowCount: snapshot.rowCount,
    columns: snapshot.columns,
    frozenRows: snapshot.frozenRows,
    frozenCols: snapshot.frozenCols,
    validationRules: snapshot.validationRules,
    protectedRanges: snapshot.protectedRanges,
    notes: snapshot.notes,
    sortKeys: snapshot.sortKeys,
    filters: snapshot.filters,
    tables: snapshot.tables,
  };
  if (
    (snapshot.frozenRows !== undefined && snapshot.frozenRows > snapshot.rowCount) ||
    (snapshot.frozenCols !== undefined && snapshot.frozenCols > snapshot.columns.length) ||
    merges.some((merge) => !validMerge(candidate, merge) || mergeCrossesFreeze(candidate, merge)) ||
    merges.some((merge, index) =>
      merges.slice(index + 1).some((other) => mergesOverlap(merge, other)),
    ) ||
    !validConditionalRules(candidate, snapshot.conditionalFormats ?? []) ||
    !validValidationRules(candidate, snapshot.validationRules ?? []) ||
    !validProtectedRanges(candidate, snapshot.protectedRanges ?? []) ||
    !validNotes(candidate) ||
    !validSortAndFilters(candidate, snapshot.sortKeys ?? [], snapshot.filters ?? []) ||
    (snapshot.rowMeta ?? []).some(
      ([row, meta]) =>
        !integerAt(row) ||
        row >= snapshot.rowCount ||
        (meta.height !== undefined && (!Number.isFinite(meta.height) || meta.height <= 0)),
    ) ||
    (snapshot.rowGroups ?? []).some(
      (group) =>
        !integerAt(group.start) ||
        !integerAt(group.end) ||
        group.start > group.end ||
        group.end >= snapshot.rowCount,
    ) ||
    snapshot.cells.some(
      (block) =>
        !integerAt(block.startRow) ||
        !integerAt(block.startCol) ||
        !positiveCount(block.rowCount) ||
        !positiveCount(block.colCount) ||
        block.startRow + block.rowCount > snapshot.rowCount ||
        block.startCol + block.colCount > snapshot.columns.length ||
        block.cells.some(
          (cell) =>
            !integerAt(cell.rowOffset) ||
            !integerAt(cell.colOffset) ||
            cell.rowOffset >= block.rowCount ||
            cell.colOffset >= block.colCount,
        ),
    )
  ) {
    return "invalid-sheet";
  }
  return null;
}

export function canAddSheetSnapshot(
  snapshot: SheetSnapshot,
  existing: readonly { id: SheetId; name: string }[],
): boolean {
  return addSheetSnapshotIssue(snapshot, existing) === null;
}

/** Simulates and validates a serializable worksheet lifecycle operation. */
export function applySheetLifecycleOperation(
  state: SheetLifecycleState,
  operation: DocumentOp,
): SheetLifecycleOperationResult | null {
  if (operation.op === "addSheet") {
    const issue = addSheetSnapshotIssue(operation.sheet, state.sheets);
    if (issue) return { ok: false, code: issue };
    const name = validateSheetName(
      operation.sheet.name,
      state.sheets.map((sheet) => sheet.name),
    );
    if (!name.ok) return { ok: false, code: name.code };
    state.sheets.splice(operation.sheet.order, 0, {
      id: operation.sheet.id,
      name: name.name,
      visibility: operation.sheet.visibility ?? "visible",
    });
    return { ok: true };
  }
  if (operation.op === "removeSheet") {
    const index = state.sheets.findIndex((sheet) => sheet.id === operation.sheet);
    if (index < 0) return { ok: false, code: "sheet-not-found" };
    if (
      state.sheets.length <= 1 ||
      (state.sheets[index]!.visibility === "visible" &&
        state.sheets.filter((sheet) => sheet.visibility === "visible").length <= 1)
    ) {
      return { ok: false, code: "last-visible-sheet" };
    }
    state.sheets.splice(index, 1);
    return { ok: true };
  }
  if (operation.op === "renameSheet") {
    const sheet = state.sheets.find((candidate) => candidate.id === operation.sheet);
    if (!sheet) return { ok: false, code: "sheet-not-found" };
    const name = validateSheetName(
      operation.name,
      state.sheets
        .filter((candidate) => candidate.id !== operation.sheet)
        .map((candidate) => candidate.name),
    );
    if (!name.ok) return { ok: false, code: name.code };
    sheet.name = name.name;
    return { ok: true };
  }
  if (operation.op === "moveSheet") {
    const from = state.sheets.findIndex((sheet) => sheet.id === operation.sheet);
    if (from < 0) return { ok: false, code: "sheet-not-found" };
    if (!integerAt(operation.to) || operation.to >= state.sheets.length) {
      return { ok: false, code: "invalid-position" };
    }
    const [sheet] = state.sheets.splice(from, 1);
    state.sheets.splice(operation.to, 0, sheet!);
    return { ok: true };
  }
  if (operation.op === "setSheetVisibility") {
    const sheet = state.sheets.find((candidate) => candidate.id === operation.sheet);
    if (!sheet) return { ok: false, code: "sheet-not-found" };
    if (
      sheet.visibility === "visible" &&
      operation.visibility !== "visible" &&
      state.sheets.filter((candidate) => candidate.visibility === "visible").length <= 1
    ) {
      return { ok: false, code: "last-visible-sheet" };
    }
    sheet.visibility = operation.visibility;
    return { ok: true };
  }
  return null;
}
