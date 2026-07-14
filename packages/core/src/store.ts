import {
  type CompactRangeHistory,
  IncompleteDataError,
  type RangeMutationAllocationStats,
  type SheetwriteStoreOptions,
  StoreDataEngine,
} from "./store/data-engine.js";
import { StoreMutationPolicy } from "./store/mutation-policy.js";
import { decodeWorkbookSnapshot } from "./store/snapshot-codec.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { AggregateOp, ColumnarData, RowData } from "./types/data.js";
import type {
  ColumnFilter,
  CommitReason,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectionResolver,
  RowGroup,
  SortKey,
  Workbook,
  WorkbookSnapshot,
} from "./types/document.js";
import type {
  CellLoadState,
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
} from "./types/transaction.js";

export type { CompactRangeHistory, RangeMutationAllocationStats, SheetwriteStoreOptions };
export { IncompleteDataError };

type ChangeListener = (event: ChangeEvent) => void;

/** Stable public facade and the sole transaction, epoch, policy, and event barrier. */
export class SheetwriteStore implements Store {
  private readonly engine: StoreDataEngine;
  private readonly listeners = new Set<ChangeListener>();
  private epoch = 0;
  private protectionResolver: ProtectionResolver | undefined;
  private mutationPolicy: MutationPolicyMode;
  private readonly policy: StoreMutationPolicy;
  private documentId?: string;
  private documentVersion?: number;

  constructor(workbook: Workbook, data?: ColumnarData, options: SheetwriteStoreOptions = {}) {
    this.engine = new StoreDataEngine(workbook, data, options);
    this.policy = new StoreMutationPolicy(workbook);
    this.protectionResolver = options.protectionResolver;
    this.mutationPolicy = options.mutationPolicy ?? "atomic";
  }

  static fromSnapshot(input: unknown): SheetwriteStore {
    const { snapshot, workbook } = decodeWorkbookSnapshot(input);
    let store: SheetwriteStore | undefined;
    try {
      store = new SheetwriteStore(workbook);
      store.documentId = snapshot.documentId;
      store.documentVersion = snapshot.version;
      store.epoch = snapshot.version ?? 0;
      store.engine.hydrateSnapshot(snapshot);
      return store;
    } catch (error) {
      store?.dispose();
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
    const options =
      typeof reasonOrOptions === "string" ? { commitReason: reasonOrOptions } : reasonOrOptions;
    const commitReason = options.commitReason ?? "api";
    const source = options.source ?? "local";
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
      return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
    }
    if (source === "local" && tx.patches.some((patch) => !this.engine.canApplyLocally(patch))) {
      return { status: "noop", epoch: this.epoch, reason: "incomplete-data" };
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

    const hasListeners = this.listeners.size > 0;
    const effects = this.engine.applyPatches(
      effectiveTx.patches,
      source === "remote",
      hasListeners,
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

  acknowledgeOperations(operations: readonly DocumentOp[]): void {
    this.engine.acknowledgeOperations(operations);
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

  loadRows(
    sheet: SheetId,
    start: number,
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    this.engine.loadRows(sheet, start, rows, protect);
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
