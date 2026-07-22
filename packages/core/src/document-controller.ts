import {
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  validateTransactionResources,
} from "./document-protocol.js";
import {
  type HistoryAction,
  type HistoryPart,
  type HistoryResourceStats,
  materializeHistoryAction,
  UndoManager,
} from "./history.js";
import type { SheetwriteStore } from "./store.js";
import type { GridTransactionAdmissionDecision } from "./transaction-admission.js";
import type { CellValue, Column } from "./types/cell.js";
import type { CellAddress, MergeRange, Range, SheetId } from "./types/coordinates.js";
import type {
  CommitReason,
  DocumentOp,
  MutationIssue,
  Sheet,
  SheetSnapshot,
  SnapshotCell,
} from "./types/document.js";
import type { Store } from "./types/store.js";
import type { WorkbookTablePatch } from "./types/table.js";
import type {
  ApplyTransactionResult,
  GridTransaction,
  RemoteOperationOptions,
  TransactionResourceLimits,
} from "./types/transaction.js";

export interface DocumentControllerOptions {
  store: Store;
  loadable: SheetwriteStore | null;
  readOnly: () => boolean;
  epoch: () => number;
  materializeVirtualColumns: (patches: DocumentOp[]) => DocumentOp[];
  onMutationRejected: (issues: MutationIssue[]) => void;
  onHistoryApplied: () => void;
  transactionResourceLimits?: Readonly<TransactionResourceLimits>;
  admitTransaction?: (operations: readonly DocumentOp[]) => GridTransactionAdmissionDecision;
}

/**
 * Owns local document policy, inverse capture, and undo/redo state. It has no
 * DOM or renderer dependency; GridImpl remains responsible for visual
 * invalidation after the store emits its document change.
 */
export class DocumentController {
  private readonly history = new UndoManager();
  private applyingHistory = false;
  private readonly transactionResourceLimits: Readonly<TransactionResourceLimits>;

  constructor(private readonly options: DocumentControllerOptions) {
    this.transactionResourceLimits =
      options.transactionResourceLimits ?? DEFAULT_TRANSACTION_RESOURCE_LIMITS;
  }

  applyTransaction(transaction: GridTransaction): ApplyTransactionResult {
    return this.commit(transaction.patches, "api");
  }

  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options: RemoteOperationOptions = {},
  ): ApplyTransactionResult {
    const resourceValidation = validateTransactionResources(
      operations,
      this.transactionResourceLimits,
    );
    if (!resourceValidation.ok) {
      return {
        status: "rejected",
        epoch: this.options.epoch(),
        issues: [resourceValidation.issue],
      };
    }
    return this.options.store.applyTransaction(
      { patches: operations.slice() },
      {
        source: "remote",
        commitReason: options.commitReason ?? "api",
        localReplay: options.localReplay,
      },
    );
  }

  commit(input: DocumentOp[], reason: CommitReason): ApplyTransactionResult {
    const inputResources = validateTransactionResources(input, this.transactionResourceLimits);
    if (!inputResources.ok) {
      return {
        status: "rejected",
        epoch: this.options.epoch(),
        issues: [inputResources.issue],
      };
    }
    if (this.options.readOnly()) {
      return { status: "noop", epoch: this.options.epoch(), reason: "read-only" };
    }
    if (input.length === 0) {
      return { status: "noop", epoch: this.options.epoch(), reason: "empty" };
    }
    const patches = this.options.materializeVirtualColumns(input);
    if (patches !== input) {
      const materializedResources = validateTransactionResources(
        patches,
        this.transactionResourceLimits,
      );
      if (!materializedResources.ok) {
        return {
          status: "rejected",
          epoch: this.options.epoch(),
          issues: [materializedResources.issue],
        };
      }
    }
    if (patches.some((patch) => this.options.loadable?.canApplyLocally(patch) === false)) {
      return { status: "noop", epoch: this.options.epoch(), reason: "incomplete-data" };
    }

    const admission = this.options.admitTransaction?.(patches);
    if (admission && !admission.ok) {
      this.options.onMutationRejected([admission.issue]);
      return {
        status: "rejected",
        epoch: this.options.epoch(),
        issues: [admission.issue],
      };
    }
    const reservation = admission?.reservation;

    if (this.applyingHistory) {
      let outcome: ApplyTransactionResult;
      try {
        outcome = this.storeApply(patches, reason);
      } catch (error) {
        reservation?.cancel();
        throw error;
      }
      reservation?.finish(outcome);
      if (outcome.status === "rejected") this.options.onMutationRejected(outcome.issues);
      return outcome;
    }

    const inverseByPatch = new Map<DocumentOp, Array<DocumentOp | HistoryPart>>();
    let outcome: ApplyTransactionResult;
    try {
      for (const patch of patches) inverseByPatch.set(patch, this.inversePatch(patch));
      outcome = this.storeApply(patches, reason);
    } catch (error) {
      reservation?.cancel();
      for (const inverse of inverseByPatch.values()) {
        for (const item of inverse) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
      }
      throw error;
    }
    reservation?.finish(outcome);
    if (outcome.status !== "applied") {
      for (const inverse of inverseByPatch.values()) {
        for (const item of inverse) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
      }
      if (outcome.status === "rejected") this.options.onMutationRejected(outcome.issues);
      return outcome;
    }
    if (outcome.rejections?.length) this.options.onMutationRejected(outcome.rejections);

    const applied = outcome.transaction.patches;
    const appliedSet = new Set(applied);
    const inverse: HistoryAction = [];
    for (const [patch, items] of inverseByPatch) {
      if (!appliedSet.has(patch)) {
        for (const item of items) {
          if ("kind" in item && item.kind === "rangeSnapshot") item.dispose();
        }
        continue;
      }
      for (const item of items) {
        inverse.push("kind" in item ? item : { kind: "patches", patches: [item] });
      }
    }
    for (const patch of applied) this.rebaseHistoryFor(patch);
    this.history.push(inverse, applied);
    return outcome;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): void {
    const action = this.history.undo();
    if (!action) return;
    try {
      if (!this.applyHistoryPatches(action, "undo")) this.history.restoreUndo();
    } catch (error) {
      this.history.restoreUndo();
      throw error;
    }
  }

  redo(): void {
    const action = this.history.redo();
    if (!action) return;
    try {
      if (!this.applyHistoryPatches(action, "redo")) this.history.restoreRedo();
    } catch (error) {
      this.history.restoreRedo();
      throw error;
    }
  }

  getHistoryResourceStats(): HistoryResourceStats {
    return this.history.getResourceStats();
  }

  destroy(): void {
    this.history.clear();
  }

  private storeApply(patches: DocumentOp[], reason: CommitReason): ApplyTransactionResult {
    return this.options.store.applyTransaction({ patches }, { commitReason: reason });
  }

  private inversePatch(patch: DocumentOp): Array<DocumentOp | HistoryPart> {
    switch (patch.op) {
      case "set":
        return [this.inverseSetPatch(patch)];
      case "setRange":
      case "setBlock":
      case "setRangeStyle":
      case "clearRange": {
        const compact = this.compactHistoryPart(patch.range);
        return compact
          ? [compact]
          : [
              {
                op: "setRange",
                range: patch.range,
                cells: this.snapshotRangeCells(patch.range),
              },
            ];
      }
      case "addRows":
        return [{ op: "removeRows", sheet: patch.sheet, at: patch.at, count: patch.count }];
      case "removeRows": {
        const sheet = this.sheetById(patch.sheet);
        const range =
          sheet && sheet.columns.length > 0
            ? {
                sheet: patch.sheet,
                start: { row: patch.at, col: 0 },
                end: { row: patch.at + patch.count - 1, col: sheet.columns.length - 1 },
              }
            : null;
        const compact = range ? this.compactHistoryPart(range) : null;
        return compact
          ? [{ op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count }, compact]
          : [
              { op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count },
              ...this.snapshotRows(patch.sheet, patch.at, patch.count),
            ];
      }
      case "moveRows":
        return [
          {
            op: "moveRows",
            sheet: patch.sheet,
            from: patch.to,
            count: patch.count,
            to: patch.from,
          },
        ];
      case "addColumns":
        return [
          {
            op: "removeColumns",
            sheet: patch.sheet,
            at: patch.at,
            count: patch.columns.length,
          },
        ];
      case "removeColumns": {
        const sheet = this.sheetById(patch.sheet);
        const range =
          sheet && sheet.rowCount > 0
            ? {
                sheet: patch.sheet,
                start: { row: 0, col: patch.at },
                end: { row: sheet.rowCount - 1, col: patch.at + patch.count - 1 },
              }
            : null;
        const compact = range ? this.compactHistoryPart(range) : null;
        return compact
          ? [
              {
                op: "addColumns",
                sheet: patch.sheet,
                at: patch.at,
                columns: this.snapshotColumns(patch.sheet, patch.at, patch.count),
              },
              compact,
            ]
          : [
              {
                op: "addColumns",
                sheet: patch.sheet,
                at: patch.at,
                columns: this.snapshotColumns(patch.sheet, patch.at, patch.count),
              },
              ...this.snapshotColumnCells(patch.sheet, patch.at, patch.count),
            ];
      }
      case "moveColumns":
        return [
          {
            op: "moveColumns",
            sheet: patch.sheet,
            from: patch.to,
            count: patch.count,
            to: patch.from,
          },
        ];
      case "setColumn": {
        const sheet = this.sheetById(patch.sheet);
        const column = sheet?.columns[patch.col];
        return column
          ? [
              {
                op: "setColumn",
                sheet: patch.sheet,
                col: patch.col,
                patch: previousColumnPatch(column, patch.patch),
              },
            ]
          : [];
      }
      case "setRowMeta": {
        const sheet = this.sheetById(patch.sheet);
        if (!sheet) return [];
        const height = sheet.rowHeights?.get(patch.row);
        const hidden = sheet.hiddenRows?.has(patch.row) ?? false;
        return [
          {
            op: "setRowMeta",
            sheet: patch.sheet,
            row: patch.row,
            meta: height === undefined && !hidden ? null : { height, hidden },
          },
        ];
      }
      case "addMerge":
        return [
          { op: "removeMerge", sheet: patch.sheet, merge: patch.merge },
          ...this.snapshotCellsInMerge(patch.sheet, patch.merge),
        ];
      case "removeMerge":
        return [{ op: "addMerge", sheet: patch.sheet, merge: patch.merge }];
      case "addSheet":
        return [{ op: "removeSheet", sheet: patch.sheet.id }];
      case "removeSheet": {
        const snapshot = this.snapshotSheet(patch.sheet);
        if (!snapshot) return [];
        const restore: DocumentOp[] = [
          { op: "addSheet", sheet: snapshot },
          ...this.snapshotExternalFormulaAndRefs(patch.sheet),
        ];
        for (const namedRange of this.options.store.getWorkbook().namedRanges ?? []) {
          if (namedRange.range.sheet === patch.sheet || namedRange.scope === patch.sheet) {
            restore.push({ op: "setNamedRange", namedRange: { ...namedRange } });
          }
        }
        return restore;
      }
      case "renameSheet": {
        const sheet = this.sheetById(patch.sheet);
        return sheet ? [{ op: "renameSheet", sheet: patch.sheet, name: sheet.name }] : [];
      }
      case "moveSheet": {
        const from = this.options.store
          .getWorkbook()
          .sheets.findIndex((sheet) => sheet.id === patch.sheet);
        return from < 0 ? [] : [{ op: "moveSheet", sheet: patch.sheet, to: from }];
      }
      case "setSheetVisibility": {
        const sheet = this.sheetById(patch.sheet);
        return sheet
          ? [
              {
                op: "setSheetVisibility",
                sheet: patch.sheet,
                visibility: sheet.visibility ?? "visible",
              },
            ]
          : [];
      }
      case "addTable":
        return [
          {
            op: "removeTable",
            sheet: patch.table.range.sheet,
            tableId: patch.table.id,
          },
        ];
      case "updateTable": {
        const table = this.sheetById(patch.sheet)?.tables?.find(
          (candidate) => candidate.id === patch.tableId,
        );
        if (!table) return [];
        const previous: WorkbookTablePatch = {};
        if (patch.patch.name !== undefined) previous.name = table.name;
        if (patch.patch.range !== undefined) previous.range = structuredClone(table.range);
        if (patch.patch.columns !== undefined) previous.columns = structuredClone(table.columns);
        if (patch.patch.headerRow !== undefined) previous.headerRow = table.headerRow;
        if (patch.patch.totalsRow !== undefined) previous.totalsRow = table.totalsRow;
        if (patch.patch.style !== undefined) {
          previous.style = table.style ? structuredClone(table.style) : null;
        }
        if (patch.patch.unsupportedFeatures !== undefined) {
          previous.unsupportedFeatures = structuredClone(table.unsupportedFeatures ?? []);
        }
        return [
          {
            op: "updateTable",
            sheet: patch.sheet,
            tableId: patch.tableId,
            patch: previous,
          },
        ];
      }
      case "removeTable": {
        const table = this.sheetById(patch.sheet)?.tables?.find(
          (candidate) => candidate.id === patch.tableId,
        );
        return table ? [{ op: "addTable", table: structuredClone(table) }] : [];
      }
      case "setSheetMeta": {
        const sheet = this.sheetById(patch.sheet);
        if (!sheet) return [];
        return [
          {
            op: "setSheetMeta",
            sheet: patch.sheet,
            patch: {
              frozenRows:
                patch.patch.frozenRows === undefined ? undefined : (sheet.frozenRows ?? 0),
              frozenCols:
                patch.patch.frozenCols === undefined ? undefined : (sheet.frozenCols ?? 0),
              conditionalFormats:
                patch.patch.conditionalFormats === undefined
                  ? undefined
                  : (sheet.conditionalFormats?.map((rule) => ({ ...rule })) ?? []),
              rowGroups:
                patch.patch.rowGroups === undefined
                  ? undefined
                  : (sheet.rowGroups?.map((group) => ({ ...group })) ?? []),
              sortKeys:
                patch.patch.sortKeys === undefined
                  ? undefined
                  : (sheet.sortKeys?.map((key) => ({ ...key })) ?? []),
              filters:
                patch.patch.filters === undefined
                  ? undefined
                  : (sheet.filters?.map(([col, filter]) => [col, structuredClone(filter)]) ?? []),
            },
          },
        ];
      }
      case "setValidationRule": {
        const previous = this.sheetById(patch.sheet)?.validationRules?.find(
          (rule) => rule.id === patch.rule.id,
        );
        return previous
          ? [{ op: "setValidationRule", sheet: patch.sheet, rule: structuredClone(previous) }]
          : [{ op: "removeValidationRule", sheet: patch.sheet, id: patch.rule.id }];
      }
      case "removeValidationRule": {
        const previous = this.sheetById(patch.sheet)?.validationRules?.find(
          (rule) => rule.id === patch.id,
        );
        return previous
          ? [{ op: "setValidationRule", sheet: patch.sheet, rule: structuredClone(previous) }]
          : [];
      }
      case "setProtectedRange": {
        const previous = this.sheetById(patch.sheet)?.protectedRanges?.find(
          (range) => range.id === patch.protectedRange.id,
        );
        return previous
          ? [
              {
                op: "setProtectedRange",
                sheet: patch.sheet,
                protectedRange: structuredClone(previous),
              },
            ]
          : [{ op: "removeProtectedRange", sheet: patch.sheet, id: patch.protectedRange.id }];
      }
      case "removeProtectedRange": {
        const previous = this.sheetById(patch.sheet)?.protectedRanges?.find(
          (range) => range.id === patch.id,
        );
        return previous
          ? [
              {
                op: "setProtectedRange",
                sheet: patch.sheet,
                protectedRange: structuredClone(previous),
              },
            ]
          : [];
      }
      case "setNote": {
        const previous = this.sheetById(patch.addr.sheet)?.notes?.find(
          (note) => note.addr.row === patch.addr.row && note.addr.col === patch.addr.col,
        );
        return [
          {
            op: "setNote",
            addr: { ...patch.addr },
            text: previous?.text ?? null,
          },
        ];
      }
      case "setNamedRange": {
        const previous = this.options.store
          .getWorkbook()
          .namedRanges?.find(
            (range) =>
              range.name.toUpperCase() === patch.namedRange.name.toUpperCase() &&
              range.scope === patch.namedRange.scope,
          );
        return previous
          ? [{ op: "setNamedRange", namedRange: { ...previous } }]
          : [
              {
                op: "removeNamedRange",
                name: patch.namedRange.name,
                scope: patch.namedRange.scope,
              },
            ];
      }
      case "removeNamedRange": {
        const previous = this.options.store
          .getWorkbook()
          .namedRanges?.find(
            (range) =>
              range.name.toUpperCase() === patch.name.toUpperCase() && range.scope === patch.scope,
          );
        return previous ? [{ op: "setNamedRange", namedRange: { ...previous } }] : [];
      }
    }
  }

  private compactHistoryPart(range: Range): HistoryPart | null {
    const snapshot = this.options.loadable?.captureRangeHistory(range);
    if (!snapshot) return null;
    return {
      kind: "rangeSnapshot",
      range: snapshot.range,
      byteLength: snapshot.byteLength,
      toPatch: (target) => snapshot.toDocumentOp(target),
      dispose: () => snapshot.dispose(),
    };
  }

  private inverseSetPatch(patch: Extract<DocumentOp, { op: "set" }>): DocumentOp {
    const formula =
      this.options.loadable?.getFormula(patch.addr) ?? this.options.store.getFormula(patch.addr);
    const refTarget = this.options.store.getRefTarget(patch.addr);
    const cell = this.options.store.getCell(patch.addr);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : refTarget
        ? { kind: "ref", target: refTarget }
        : { kind: "literal", value: cell.resolved };

    return {
      op: "set",
      addr: patch.addr,
      value,
      style: cell.style,
    };
  }

  private snapshotRows(sheetId: SheetId, at: number, count: number): DocumentOp[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];

    const patches: DocumentOp[] = [];
    const end = Math.min(sheet.rowCount, at + count);
    for (let row = at; row < end; row++) {
      for (let col = 0; col < sheet.columns.length; col++) {
        patches.push(this.snapshotCell({ sheet: sheetId, row, col }));
      }
    }
    return patches;
  }

  private snapshotColumns(sheetId: SheetId, at: number, count: number): Column[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];
    return sheet.columns.slice(at, at + count).map((column) => ({ ...column }));
  }

  private snapshotColumnCells(sheetId: SheetId, at: number, count: number): DocumentOp[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];

    const patches: DocumentOp[] = [];
    const end = Math.min(sheet.columns.length, at + count);
    for (let row = 0; row < sheet.rowCount; row++) {
      for (let col = at; col < end; col++) {
        patches.push(this.snapshotCell({ sheet: sheetId, row, col }));
      }
    }
    return patches;
  }

  private snapshotCell(addr: CellAddress): Extract<DocumentOp, { op: "set" }> {
    const formula = this.options.store.getFormula(addr);
    const refTarget = this.options.store.getRefTarget(addr);
    const cell = this.options.store.getCell(addr);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : refTarget
        ? { kind: "ref", target: refTarget }
        : { kind: "literal", value: cell.resolved };
    return { op: "set", addr, value, style: cell.style };
  }

  private snapshotRangeCells(range: Range): SnapshotCell[] {
    const r0 = Math.min(range.start.row, range.end.row);
    const r1 = Math.max(range.start.row, range.end.row);
    const c0 = Math.min(range.start.col, range.end.col);
    const c1 = Math.max(range.start.col, range.end.col);
    const cells: SnapshotCell[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const patch = this.snapshotCell({ sheet: range.sheet, row, col });
        cells.push({
          rowOffset: row - r0,
          colOffset: col - c0,
          value: patch.value,
          style: patch.style,
        });
      }
    }
    return cells;
  }

  private snapshotCellsInMerge(sheet: SheetId, merge: MergeRange): DocumentOp[] {
    const patches: DocumentOp[] = [];
    const r0 = Math.min(merge.r0, merge.r1);
    const r1 = Math.max(merge.r0, merge.r1);
    const c0 = Math.min(merge.c0, merge.c1);
    const c1 = Math.max(merge.c0, merge.c1);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        patches.push(this.snapshotCell({ sheet, row, col }));
      }
    }
    return patches;
  }

  private snapshotSheet(id: SheetId): SheetSnapshot | null {
    const sheet = this.sheetById(id);
    if (!sheet) return null;
    const cells: SnapshotCell[] = [];
    for (let row = 0; row < sheet.rowCount; row++) {
      for (let col = 0; col < sheet.columns.length; col++) {
        const patch = this.snapshotCell({ sheet: id, row, col });
        const literalEmpty = patch.value.kind === "literal" && patch.value.value === null;
        if (literalEmpty && Object.keys(patch.style ?? {}).length === 0) continue;
        cells.push({ rowOffset: row, colOffset: col, value: patch.value, style: patch.style });
      }
    }
    const rowMeta: Array<[number, { height?: number; hidden?: boolean }]> = [];
    const rows = new Set([
      ...(sheet.rowHeights?.keys() ?? []),
      ...(sheet.hiddenRows?.values() ?? []),
    ]);
    for (const row of [...rows].sort((left, right) => left - right)) {
      rowMeta.push([
        row,
        {
          height: sheet.rowHeights?.get(row),
          hidden: sheet.hiddenRows?.has(row) || undefined,
        },
      ]);
    }
    return {
      id: sheet.id,
      name: sheet.name,
      visibility: sheet.visibility,
      order: this.options.store.getWorkbook().sheets.findIndex((candidate) => candidate.id === id),
      rowCount: sheet.rowCount,
      columns: sheet.columns.map((column) => ({ ...column })),
      frozenRows: sheet.frozenRows,
      frozenCols: sheet.frozenCols,
      rowMeta,
      merges: sheet.merges?.map((candidate) => ({ ...candidate })),
      conditionalFormats: sheet.conditionalFormats?.map((rule) => ({ ...rule })),
      validationRules: structuredClone(sheet.validationRules),
      protectedRanges: structuredClone(sheet.protectedRanges),
      notes: structuredClone(sheet.notes),
      sortKeys: structuredClone(sheet.sortKeys),
      filters: structuredClone(sheet.filters),
      rowGroups: sheet.rowGroups?.map((group) => ({ ...group })),
      tables: structuredClone(sheet.tables),
      cells:
        cells.length === 0
          ? []
          : [
              {
                startRow: 0,
                startCol: 0,
                rowCount: sheet.rowCount,
                colCount: sheet.columns.length,
                cells,
              },
            ],
    };
  }

  private snapshotExternalFormulaAndRefs(removedSheet: SheetId): DocumentOp[] {
    const patches: DocumentOp[] = [];
    for (const sheet of this.options.store.getWorkbook().sheets) {
      if (sheet.id === removedSheet) continue;
      for (let row = 0; row < sheet.rowCount; row++) {
        for (let col = 0; col < sheet.columns.length; col++) {
          const addr = { sheet: sheet.id, row, col };
          if (this.options.store.getFormula(addr) || this.options.store.getRefTarget(addr)) {
            patches.push(this.snapshotCell(addr));
          }
        }
      }
    }
    return patches;
  }

  private rebaseHistoryFor(patch: DocumentOp): void {
    switch (patch.op) {
      case "addRows":
        this.history.rebaseRows(patch.sheet, patch.at, patch.count);
        break;
      case "removeRows":
        this.history.rebaseRows(patch.sheet, patch.at, -patch.count);
        break;
      case "addColumns":
        this.history.rebaseCols(patch.sheet, patch.at, patch.columns.length);
        break;
      case "removeColumns":
        this.history.rebaseCols(patch.sheet, patch.at, -patch.count);
        break;
    }
  }

  private applyHistoryPatches(action: HistoryAction, reason: "undo" | "redo"): boolean {
    const patches = materializeHistoryAction(action);
    if (patches.length === 0) return false;

    this.applyingHistory = true;
    let outcome: ApplyTransactionResult;
    try {
      outcome = this.commit(patches, reason);
    } finally {
      this.applyingHistory = false;
    }
    if (outcome.status !== "applied") return false;
    for (const patch of outcome.transaction.patches) this.rebaseHistoryFor(patch);
    this.options.onHistoryApplied();
    return true;
  }

  private sheetById(id: SheetId): Sheet | null {
    return this.options.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
  }
}

function previousColumnPatch(column: Column, changed: Partial<Column>): Partial<Column> {
  const previous: Partial<Column> = {};
  for (const key of Object.keys(changed) as Array<keyof Column>) {
    Reflect.set(previous, key, column[key]);
  }
  return previous;
}
