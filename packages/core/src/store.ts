import {
  assertWorkbookAllocationLimits,
  DEFAULT_SNAPSHOT_RESOURCE_LIMITS,
  resolveTransactionResourceLimits,
  SnapshotResourceError,
  type SnapshotResourceLimits,
  SnapshotValidationError,
  validateDocumentOperationShape,
  validateTransactionResources,
} from "./document-protocol.js";
import type {
  RuntimeMemoryObservation,
  RuntimeResourceOperation,
  RuntimeResourcePhase,
  RuntimeResourceSnapshot,
  TransientResourcePeak,
} from "./resource-accounting.js";
import { applySheetLifecycleOperation, createSheetLifecycleState } from "./sheet-lifecycle.js";
import {
  type CompactRangeHistory,
  IncompleteDataError,
  type RangeMutationAllocationStats,
  StoreDataEngine,
  type SheetwriteStoreOptions as StoreDataEngineOptions,
} from "./store/data-engine.js";
import { StoreMutationPolicy } from "./store/mutation-policy.js";
import { patchSheetId } from "./store/ranges.js";
import { decodeWorkbookSnapshot } from "./store/snapshot-codec.js";
import { setTransactionStorageRevision } from "./transaction-admission.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { AggregateOp, ColumnarData, DataSourceColumnBand, RowData } from "./types/data.js";
import type {
  ColumnFilter,
  CommitReason,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectionResolver,
  RowGroup,
  SheetLifecycleIssueCode,
  SortKey,
  Workbook,
  WorkbookSnapshot,
} from "./types/document.js";
import type {
  CellLoadState,
  ClipboardWindowView,
  PagedStoreStats,
  QueryCapability,
  ResolvedCell,
  Store,
  VisibleWindowView,
} from "./types/store.js";
import type {
  ApplyTransactionResult,
  ChangeEvent,
  Transaction,
  TransactionApplicationOptions,
  TransactionResourceLimits,
} from "./types/transaction.js";

export type { CompactRangeHistory, RangeMutationAllocationStats };
export { IncompleteDataError };

/** Storage layout plus snapshot and transaction resource ceilings for one store. */
export interface SheetwriteStoreOptions extends StoreDataEngineOptions {
  /** Overrides canonical snapshot/workbook allocation ceilings before construction. */
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
  /** Overrides inclusive operation-count and encoded-byte ceilings for every transaction. */
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
}

type ChangeListener = (event: ChangeEvent) => void;
const SHEET_LIFECYCLE_MESSAGES: Readonly<Record<SheetLifecycleIssueCode, string>> = {
  blank: "Sheet name cannot be blank",
  "too-long": "Sheet name exceeds 31 UTF-16 code units",
  "forbidden-character": "Sheet name contains a forbidden character",
  "edge-apostrophe": "Sheet name cannot begin or end with an apostrophe",
  duplicate: "Sheet name duplicates another sheet case-insensitively",
  "duplicate-sheet-id": "Sheet ID already exists",
  "sheet-not-found": "Sheet does not exist",
  "invalid-sheet": "Sheet snapshot is invalid",
  "invalid-position": "Sheet position is out of bounds",
  "last-visible-sheet": "Workbook must retain at least one visible sheet",
};

function isSnapshotAllocationFailure(error: unknown): boolean {
  if (error instanceof SnapshotResourceError || error instanceof RangeError) return true;
  if (typeof error === "string") {
    return /allocation|capacity|memory|resource limit|out of bounds memory access/i.test(error);
  }
  if (typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError) {
    return true;
  }
  return (
    error instanceof Error &&
    /allocation|capacity|memory|resource limit|out of bounds memory access/i.test(error.message)
  );
}

/** Stable public facade and the sole transaction, epoch, policy, and event barrier. */
export class SheetwriteStore implements Store {
  private readonly engine: StoreDataEngine;
  private readonly listeners = new Set<ChangeListener>();
  private epoch = 0;
  private detailedChangeCapture = false;
  private protectionResolver: ProtectionResolver | undefined;
  private mutationPolicy: MutationPolicyMode;
  private readonly policy: StoreMutationPolicy;
  private readonly transactionResourceLimits: Readonly<TransactionResourceLimits>;
  private documentId?: string;
  private documentVersion?: number;

  constructor(workbook: Workbook, data?: ColumnarData, options: SheetwriteStoreOptions = {}) {
    this.transactionResourceLimits = resolveTransactionResourceLimits(
      options.transactionResourceLimits,
    );
    const storage = options.storage ?? "dense";
    assertWorkbookAllocationLimits(workbook, {
      storage,
      resourceLimits: options.snapshotResourceLimits,
    });
    try {
      this.engine = new StoreDataEngine(workbook, data, options);
    } catch (error) {
      if (!isSnapshotAllocationFailure(error)) throw error;
      const resource = storage === "dense" ? "maxDenseCells" : "maxLogicalCellsPerSheet";
      let actual = 0;
      for (const sheet of workbook.sheets) {
        const cells = sheet.rowCount * sheet.columns.length;
        actual = storage === "dense" ? actual + cells : Math.max(actual, cells);
      }
      throw new SnapshotResourceError(
        resource,
        options.snapshotResourceLimits?.[resource] ?? DEFAULT_SNAPSHOT_RESOURCE_LIMITS[resource],
        actual,
        { cause: error },
      );
    }
    this.policy = new StoreMutationPolicy(workbook);
    this.protectionResolver = options.protectionResolver;
    this.mutationPolicy = options.mutationPolicy ?? "atomic";
  }

  static fromSnapshot(input: unknown, options: SheetwriteStoreOptions = {}): SheetwriteStore {
    resolveTransactionResourceLimits(options.transactionResourceLimits);
    const { snapshot, workbook } = decodeWorkbookSnapshot(input, {
      storage: options.storage ?? "dense",
      resourceLimits: options.snapshotResourceLimits,
    });
    let store: SheetwriteStore | undefined;
    try {
      store = new SheetwriteStore(workbook, undefined, options);
      store.documentId = snapshot.documentId;
      store.documentVersion = snapshot.version;
      store.epoch = snapshot.version ?? 0;
      store.engine.hydrateSnapshot(snapshot);
      return store;
    } catch (error) {
      store?.dispose();
      if (isSnapshotAllocationFailure(error)) {
        throw new SnapshotValidationError([
          {
            path: "$",
            code: "resource-limit",
            message: error instanceof Error ? error.message : "Snapshot allocation failed",
          },
        ]);
      }
      throw error;
    }
  }

  setProtectionResolver(
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode = this.mutationPolicy,
  ): void {
    this.protectionResolver = resolver;
    this.mutationPolicy = mode;
  }

  getRangeMutationAllocationStats(): RangeMutationAllocationStats {
    return this.engine.getRangeMutationAllocationStats();
  }

  resetRangeMutationAllocationStats(): void {
    this.engine.resetRangeMutationAllocationStats();
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    return this.engine.getRuntimeResourceSnapshot(operation, phase, runtime);
  }

  resetRuntimeResourceAccounting(): void {
    this.engine.resetRuntimeResourceAccounting();
  }

  getFormulaMatrixResourcePeak(): TransientResourcePeak {
    return this.engine.getFormulaMatrixResourcePeak();
  }

  resetFormulaMatrixResourcePeak(): void {
    this.engine.resetFormulaMatrixResourcePeak();
  }

  withResourceOperation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    return this.engine.withResourceOperation(operation, run);
  }

  isPaged(sheet: SheetId): boolean {
    return this.engine.isPaged(sheet);
  }

  getPagedStats(sheet: SheetId): PagedStoreStats {
    return this.engine.getPagedStats(sheet);
  }

  queryCapability(sheet: SheetId): QueryCapability {
    return this.engine.queryCapability(sheet);
  }

  getCellLoadState(addr: CellAddress): CellLoadState {
    return this.engine.getCellLoadState(addr);
  }

  areColumnsFullyLoaded(
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ): boolean {
    return this.engine.areColumnsFullyLoaded(sheet, startRow, endRow, columns);
  }

  isRangeFullyLoaded(input: Range): boolean {
    return this.engine.isRangeFullyLoaded(input);
  }

  canApplyLocally(patch: DocumentOp): boolean {
    return this.engine.canApplyLocally(patch);
  }

  captureRangeHistory(input: Range): CompactRangeHistory | null {
    return this.engine.captureRangeHistory(input);
  }

  getWorkbook(): Workbook {
    return this.engine.getWorkbook();
  }

  getCell(addr: CellAddress): ResolvedCell {
    return this.engine.getCell(addr);
  }

  getFormula(addr: CellAddress): string | null {
    return this.engine.getFormula(addr);
  }
  /** Owning dynamic-array formula cell, or null when `addr` is not spilled. */
  getSpillAnchor(addr: CellAddress): CellAddress | null {
    return this.engine.getSpillAnchor(addr);
  }

  getRefTarget(addr: CellAddress): CellAddress | null {
    return this.engine.getRefTarget(addr);
  }

  recalculateVolatile(now = new Date()): void {
    this.engine.recomputeVolatile(now);
    this.epoch += 1;
    const event: ChangeEvent = {
      transaction: { patches: [] },
      changes: [],
      commitReason: "api",
      source: "local",
      epoch: this.epoch,
    };
    for (const listener of this.listeners) listener(event);
  }

  dataRowAt(sheet: SheetId, viewRow: number): number {
    return this.engine.dataRowAt(sheet, viewRow);
  }

  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    return this.engine.viewRowOf(sheet, dataRow);
  }

  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    return this.engine.getVisibleWindow(sheet, rows, cols);
  }

  getDataWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    return this.engine.getDataWindow(sheet, rows, cols);
  }

  getClipboardWindow(
    sheet: SheetId,
    viewRows: { start: number; end: number },
    cols: readonly number[],
  ): ClipboardWindowView {
    return this.engine.getClipboardWindow(sheet, viewRows, cols);
  }

  aggregate(sheet: SheetId, col: number, op: AggregateOp): number {
    return this.engine.aggregate(sheet, col, op);
  }

  sortBy(sheet: SheetId, col: number, ascending: boolean): void {
    this.sortByMulti(sheet, [{ col, ascending }]);
  }

  sortByMulti(sheet: SheetId, keys: readonly SortKey[]): void {
    if (keys.length > 0) this.requireCompleteQuery(sheet);
    void this.applyTransaction(
      {
        patches: [
          {
            op: "setSheetMeta",
            sheet,
            patch: { sortKeys: keys.map((key) => ({ ...key })) },
          },
        ],
      },
      "structure",
    );
  }

  setColumnFilter(sheet: SheetId, col: number, filter: ColumnFilter | null): void {
    if (filter !== null) this.requireCompleteQuery(sheet);
    const filters = new Map(this.sheetMeta(sheet).filters ?? []);
    if (filter === null) {
      if (!filters.delete(col)) return;
    } else {
      filters.set(col, JSON.parse(JSON.stringify(filter)));
    }
    void this.applyTransaction(
      {
        patches: [{ op: "setSheetMeta", sheet, patch: { filters: [...filters] } }],
      },
      "structure",
    );
  }

  filterBy(sheet: SheetId, col: number, needle: string): void {
    this.setColumnFilter(sheet, col, { kind: "contains", text: needle });
  }

  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.engine.columnFilters(sheet);
  }

  distinctValues(sheet: SheetId, col: number, limit = 1000): CellScalar[] {
    return this.engine.distinctValues(sheet, col, limit);
  }

  hideRows(sheet: SheetId, rows: readonly number[]): void {
    const meta = this.sheetMeta(sheet);
    const patches: DocumentOp[] = [];
    for (const row of new Set(rows)) {
      if (!Number.isInteger(row) || row < 0 || row >= meta.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet,
        row,
        meta: { height: meta.rowHeights?.get(row), hidden: true },
      });
    }
    void this.applyTransaction({ patches }, "structure");
  }

  showRows(sheet: SheetId, rows?: readonly number[]): void {
    const meta = this.sheetMeta(sheet);
    const targets = rows ?? [...(meta.hiddenRows ?? [])];
    const patches: DocumentOp[] = [];
    for (const row of new Set(targets)) {
      if (!Number.isInteger(row) || row < 0 || row >= meta.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet,
        row,
        meta: { height: meta.rowHeights?.get(row), hidden: false },
      });
    }
    void this.applyTransaction({ patches }, "structure");
  }

  hiddenRows(sheet: SheetId): number[] {
    return this.engine.hiddenRows(sheet);
  }

  groupRows(sheet: SheetId, start: number, end: number): void {
    const group = { start: Math.min(start, end), end: Math.max(start, end), collapsed: false };
    const groups = (this.sheetMeta(sheet).rowGroups ?? []).filter(
      (existing) => existing.start !== group.start || existing.end !== group.end,
    );
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: [...groups, group] } }] },
      "structure",
    );
  }

  ungroupRows(sheet: SheetId, start: number, end: number): void {
    const r0 = Math.min(start, end);
    const r1 = Math.max(start, end);
    const groups = (this.sheetMeta(sheet).rowGroups ?? []).filter(
      (group) => group.start !== r0 || group.end !== r1,
    );
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  setGroupCollapsed(sheet: SheetId, start: number, collapsed: boolean): void {
    const groups = (this.sheetMeta(sheet).rowGroups ?? []).map((group) =>
      group.start === start ? { ...group, collapsed } : group,
    );
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.engine.rowGroups(sheet);
  }

  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    return this.engine.dataEdge(sheet, row, col, dRow, dCol);
  }

  searchCells(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): CellAddress[] {
    return this.engine.searchCells(sheet, query, opts);
  }

  searchCellsFlat(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): Uint32Array {
    return this.engine.searchCellsFlat(sheet, query, opts);
  }

  clearView(sheet: SheetId): void {
    const meta = this.sheetMeta(sheet);
    if ((meta.sortKeys?.length ?? 0) === 0 && (meta.filters?.length ?? 0) === 0) return;
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { sortKeys: [], filters: [] } }] },
      "structure",
    );
  }

  viewRowCount(sheet: SheetId): number {
    return this.engine.viewRowCount(sheet);
  }

  hasView(sheet: SheetId): boolean {
    return this.engine.hasView(sheet);
  }

  ensureColumns(sheet: SheetId, columns: readonly Column[]): void {
    this.engine.ensureColumns(sheet, columns);
  }

  applyTransaction(
    tx: Transaction,
    reasonOrOptions: CommitReason | TransactionApplicationOptions = {},
  ): ApplyTransactionResult {
    const resourceValidation = validateTransactionResources(
      tx.patches,
      this.transactionResourceLimits,
    );
    if (!resourceValidation.ok) {
      return { status: "rejected", epoch: this.epoch, issues: [resourceValidation.issue] };
    }
    const sheetLifecycle = createSheetLifecycleState(this.engine.getWorkbook().sheets);
    for (let operationIndex = 0; operationIndex < tx.patches.length; operationIndex++) {
      const operationPath = `transaction.patches[${operationIndex}]`;
      const unsafeError = validateDocumentOperationShape(
        tx.patches[operationIndex],
        operationPath,
      ).find((error) => error.code !== "out-of-bounds");
      if (unsafeError) {
        return {
          status: "rejected",
          epoch: this.epoch,
          issues: [
            {
              kind: "invalid-operation",
              severity: "error",
              operationIndex,
              message: unsafeError.message,
            },
          ],
        };
      }
      const operation = tx.patches[operationIndex]!;
      const lifecycle = applySheetLifecycleOperation(sheetLifecycle, operation);
      if (lifecycle && !lifecycle.ok) {
        return {
          status: "rejected",
          epoch: this.epoch,
          issues: [
            {
              kind: "sheet-lifecycle",
              severity: "error",
              code: lifecycle.code,
              sheet:
                operation.op === "addSheet"
                  ? operation.sheet.id
                  : (patchSheetId(operation) ?? undefined),
              operationIndex,
              message: SHEET_LIFECYCLE_MESSAGES[lifecycle.code],
            },
          ],
        };
      }
      const requiredSheets: SheetId[] = [];
      if (operation.op === "addSheet") {
        for (const block of operation.sheet.cells) {
          for (const cell of block.cells) {
            if (cell.value.kind === "ref") requiredSheets.push(cell.value.target.sheet);
          }
        }
        for (const rule of operation.sheet.conditionalFormats ?? []) {
          requiredSheets.push(rule.range.sheet);
        }
        for (const hyperlink of operation.sheet.hyperlinks ?? []) {
          requiredSheets.push(hyperlink.range.sheet);
          if (hyperlink.target.kind === "internal") {
            requiredSheets.push(hyperlink.target.range.sheet);
          }
        }
        for (const rule of operation.sheet.validationRules ?? []) {
          requiredSheets.push(rule.range.sheet);
        }
        for (const entry of operation.sheet.protectedRanges ?? []) {
          requiredSheets.push(entry.range.sheet);
        }
        for (const note of operation.sheet.notes ?? []) requiredSheets.push(note.addr.sheet);
      } else {
        const primarySheet = patchSheetId(operation);
        if (lifecycle === null && primarySheet !== null) requiredSheets.push(primarySheet);
        if (operation.op === "set" && operation.value.kind === "ref") {
          requiredSheets.push(operation.value.target.sheet);
        } else if (operation.op === "setRange") {
          for (const cell of operation.cells) {
            if (cell.value.kind === "ref") requiredSheets.push(cell.value.target.sheet);
          }
        } else if (operation.op === "setBlock") {
          for (const [, target] of operation.block.refs ?? []) requiredSheets.push(target.sheet);
        } else if (operation.op === "setNamedRange") {
          requiredSheets.push(operation.namedRange.range.sheet);
          if (operation.namedRange.scope !== undefined) {
            requiredSheets.push(operation.namedRange.scope);
          }
        } else if (operation.op === "removeNamedRange" && operation.scope !== undefined) {
          requiredSheets.push(operation.scope);
        } else if (operation.op === "setHyperlink") {
          requiredSheets.push(operation.hyperlink.range.sheet);
          if (operation.hyperlink.target.kind === "internal") {
            requiredSheets.push(operation.hyperlink.target.range.sheet);
          }
        } else if (operation.op === "setValidationRule") {
          requiredSheets.push(operation.rule.range.sheet);
        } else if (operation.op === "setProtectedRange") {
          requiredSheets.push(operation.protectedRange.range.sheet);
        } else if (operation.op === "setSheetMeta") {
          for (const rule of operation.patch.conditionalFormats ?? []) {
            requiredSheets.push(rule.range.sheet);
          }
        }
      }
      const missingSheet = requiredSheets.find(
        (sheet) => !sheetLifecycle.sheets.some((candidate) => candidate.id === sheet),
      );
      if (missingSheet !== undefined) {
        return {
          status: "rejected",
          epoch: this.epoch,
          issues: [
            {
              kind: "invalid-operation",
              severity: "error",
              operationIndex,
              message: `Sheet ${missingSheet} does not exist`,
            },
          ],
        };
      }
    }
    const options =
      typeof reasonOrOptions === "string" ? { commitReason: reasonOrOptions } : reasonOrOptions;
    const commitReason = options.commitReason ?? "api";
    const source = options.source ?? "local";
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
      return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
    }

    let effectiveTx = tx;
    let policyWarnings: MutationIssue[] = [];
    let policyRejections: MutationIssue[] = [];
    if (source === "local") {
      const policy = this.policy.evaluate(
        tx.patches,
        commitReason,
        this.protectionResolver,
        this.mutationPolicy,
      );
      policyWarnings = policy.warnings;
      policyRejections = policy.rejections;
      if (policy.rejections.length > 0 && policy.patches.length === 0) {
        return { status: "rejected", epoch: this.epoch, issues: policy.rejections };
      }
      if (policy.patches.length !== tx.patches.length) {
        effectiveTx = { ...tx, patches: policy.patches };
      }
    }

    if (source === "local" || options.localReplay === true) {
      const dirtyCapacityIssue = this.engine.pagedDirtyCapacityIssue(effectiveTx.patches);
      if (dirtyCapacityIssue) {
        return { status: "rejected", epoch: this.epoch, issues: [dirtyCapacityIssue] };
      }
    }
    if (
      source === "local" &&
      effectiveTx.patches.some((patch) => !this.engine.canApplyLocally(patch))
    ) {
      return { status: "noop", epoch: this.epoch, reason: "incomplete-data" };
    }
    const hasListeners = this.listeners.size > 0;
    const effects = this.engine.applyPatches(
      effectiveTx.patches,
      source === "remote" && options.localReplay !== true,
      hasListeners,
      this.detailedChangeCapture,
    );
    if (effects.appliedPatches.length === 0) {
      return {
        status: "noop",
        epoch: this.epoch,
        reason: effectiveTx.patches.length === 0 ? "empty" : "out-of-bounds",
      };
    }

    this.epoch += 1;
    const transaction =
      effects.appliedPatches.length === effectiveTx.patches.length
        ? effectiveTx
        : { ...effectiveTx, patches: effects.appliedPatches };
    setTransactionStorageRevision(transaction, effects.storageRevision);
    if (!hasListeners) {
      return {
        status: "applied",
        epoch: this.epoch,
        transaction,
        ...(policyWarnings.length > 0 ? { warnings: policyWarnings } : {}),
        ...(policyRejections.length > 0 ? { rejections: policyRejections } : {}),
      };
    }

    const event: ChangeEvent = {
      transaction,
      changes: effects.changes ?? [],
      commitReason,
      source,
      epoch: this.epoch,
    };
    for (const listener of this.listeners) listener(event);
    return {
      status: "applied",
      epoch: this.epoch,
      transaction,
      ...(policyWarnings.length > 0 ? { warnings: policyWarnings } : {}),
      ...(policyRejections.length > 0 ? { rejections: policyRejections } : {}),
    };
  }

  on(_evt: "change", fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setDetailedChangeCapture(enabled: boolean): void {
    this.detailedChangeCapture = enabled;
  }

  acknowledgeOperations(operations: readonly DocumentOp[], storageRevision?: bigint): void {
    this.engine.acknowledgeOperations(operations, storageRevision);
  }

  exportSnapshot(): WorkbookSnapshot {
    return this.engine.exportSnapshot(this.documentId, this.documentVersion);
  }

  renameSheetFormulaIdentity(sheet: SheetId, name: string): boolean {
    return this.engine.renameSheetFormulaIdentity(sheet, name);
  }

  removeSheetFormulaIdentity(sheet: SheetId): boolean {
    return this.engine.removeSheetFormulaIdentity(sheet);
  }

  loadPage(
    sheet: SheetId,
    start: number,
    columns: readonly DataSourceColumnBand[],
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    this.engine.loadPage(sheet, start, columns, rows, protect);
  }

  dispose(): void {
    this.engine.dispose();
  }

  private requireCompleteQuery(sheet: SheetId): void {
    const capability = this.engine.queryCapability(sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet, capability);
  }

  private sheetMeta(sheet: SheetId) {
    const meta = this.engine.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    if (!meta) throw new Error(`unknown sheet: ${sheet}`);
    return meta;
  }
}
