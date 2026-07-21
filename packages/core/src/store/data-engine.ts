import { CellStore, isLoaded, type RangeSnapshot } from "@sheetwrite/wasm";
import { parseCellLiteralInput } from "../cell-input.js";
import { dateToSerial } from "../date-serial.js";
import {
  consumeSourceSnapshot,
  type RangeSourceProjection,
  referenceTargetFromPacked,
} from "../reference.js";
import {
  BoundaryResourceAccounting,
  createRuntimeResourceSnapshot,
  decodeStoreMemoryStats,
  emptyStoreMemoryStats,
  type ResourceOwnerBytes,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourceSnapshot,
  type TransientResourcePeak,
} from "../resource-accounting.js";
import { StyleDictionary } from "../style-dictionary.js";
import type {
  CellFormat,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatRule,
} from "../types/cell.js";
import type { CellAddress, MergeRange, Range, SheetId } from "../types/coordinates.js";
import type { AggregateOp, ColumnarData, DataCell, RowData } from "../types/data.js";
import type {
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  NamedRangeSnapshot,
  PackedCellBlock,
  ProtectedRange,
  ProtectionResolver,
  RowGroup,
  Sheet,
  SheetSnapshot,
  Workbook,
  WorkbookSnapshot,
} from "../types/document.js";
import type {
  CellLoadState,
  ClipboardWindowView,
  PagedStoreStats,
  QueryCapability,
  ResolvedCell,
  VisibleWindowView,
} from "../types/store.js";
import type { ChangeEvent } from "../types/transaction.js";
import {
  applySheetLifecycleOperation,
  canAddSheetSnapshot,
  createSheetLifecycleState,
  integerAt,
  mergeCrossesFreeze,
  mergesOverlap,
  moveIndex,
  normalizedRange,
  normalizeMerge,
  patchSheetId,
  positiveCount,
  rebaseRangeCols,
  rebaseRangeRows,
  remapSpan,
  sameMerge,
  uniqueColumnKeys,
  validConditionalRules,
  validMerge,
  validNotes,
  validProtectedRanges,
  validSortAndFilters,
  validValidationRules,
} from "./ranges.js";
import { StoreSnapshotCodec } from "./snapshot-codec.js";
import { StoreViewState } from "./view-state.js";
import type { RecomputingCellStore } from "./wasm-contract.js";
import { StoreWindowReader } from "./window-reader.js";

// Mirror of the WASM cell tags.
const KIND_NUMBER = 1;
const KIND_STRING = 2;
const KIND_BOOL = 3;
const KIND_FORMULA = 4;

const AGG_OP: Record<AggregateOp, number> = { sum: 0, avg: 1, min: 2, max: 3, count: 4 };

/** Rows per allocation-lazy chunk; this matches the store engine's native default. */
const DEFAULT_PAGED_CHUNK_ROWS = 4_096;
/** Per-sheet budget for clean, unpinned chunks; dirty or visible chunks stay resident. */
const DEFAULT_PAGED_CACHE_BYTES = 32 * 1024 * 1024;
const DEFAULT_PAGED_DIRTY_CELL_LIMIT = 1_000_000;
const MAX_PAGED_REFERENCE_SIMULATION_ENTRIES = 100_000;
const EMPTY_U32 = new Uint32Array(0);

/** Store-local compact history resource. Never serialize `resource`. */
export interface CompactRangeHistory {
  readonly range: Range;
  readonly resource: RangeSnapshot;
  readonly byteLength: number;
  readonly refs: ReadonlyArray<[offset: number, target: CellAddress]>;
  toDocumentOp(range: Range): Extract<DocumentOp, { op: "setBlock" }>;
  dispose(): void;
}

export interface RangeMutationAllocationStats {
  readonly documentOperations: number;
  readonly jsPatchObjects: number;
  readonly ffiCalls: number;
  readonly maxTransferredArrayLength: number;
  readonly distinctStyleIds: number;
  readonly historySnapshots: number;
  readonly historySnapshotBytes: number;
  readonly historyMaterializations: number;
  readonly historyDisposals: number;
  readonly styleDictionaryEntries: number;
  readonly admissionReferenceEntriesScanned: number;
  readonly admissionReferenceMapsMaterialized: number;
}

export interface SheetwriteStoreOptions {
  /** Storage engine; defaults to eager `dense` allocation. */
  storage?: "dense" | "paged";
  /** Paged row chunk size; defaults to 4,096 and is normalized to a power of two. */
  chunkRows?: number;
  /** Per-sheet clean-chunk budget; defaults to 32 MiB. Dirty and pinned chunks may exceed it. */
  cacheBytes?: number;
  /** Maximum sparse local edits retained outside the clean page cache. Defaults to 1,000,000 cells; further edits reject atomically. */
  dirtyCellLimit?: number;
  /** Maximum clean references retained for exact multi-operation remove-sheet simulation. */
  referenceSimulationLimit?: number;
  protectionResolver?: ProtectionResolver;
  mutationPolicy?: MutationPolicyMode;
}

/** Error thrown when an operation requires datasource cells that are not loaded. */
export class IncompleteDataError extends Error {
  readonly capability: Extract<QueryCapability, { status: "incomplete" }>;

  constructor(sheet: SheetId, capability: Extract<QueryCapability, { status: "incomplete" }>) {
    super(`Sheetwrite: ${sheet} has unloaded datasource cells`);
    this.name = "IncompleteDataError";
    this.capability = capability;
  }
}
interface PagedDirtyPreflightState {
  handle: number | null;
  rows: number;
  cols: number;
  columnKeys: string[];
  dirty: number;
  additional: number;
  existing: Set<string> | null;
  seen: Set<string>;
}

export interface StoreDataEngineEffects {
  readonly appliedPatches: DocumentOp[];
  readonly changes: ChangeEvent["changes"] | null;
  readonly storageRevision: bigint;
}

function literalOf(value: CellScalar): CellValue {
  return { kind: "literal", value };
}

/**
 * Owns the raw workbook/WASM state and returns typed effects to the public
 * transaction facade. It never owns public listeners, epochs, or policy.
 */
export class StoreDataEngine {
  private readonly wasm: RecomputingCellStore;
  private readonly workbook: Workbook;
  private readonly storageOptions: SheetwriteStoreOptions;
  private readonly handles = new Map<SheetId, number>();
  private readonly styles = new StyleDictionary();
  private readonly sheetIdsByHandle: SheetId[] = [];
  private readonly view: StoreViewState;
  private readonly windowReader: StoreWindowReader;
  private readonly snapshotCodec: StoreSnapshotCodec;
  private readonly boundaryAccounting = new BoundaryResourceAccounting();
  private resourceOperation: RuntimeResourceOperation | null = "startup";
  private disposed = false;
  private committedBytesAfterDispose: number | null = null;
  private readonly spillBlockersDirty = new Set<SheetId>();
  private readonly rangeMutationStats = {
    documentOperations: 0,
    jsPatchObjects: 0,
    ffiCalls: 0,
    maxTransferredArrayLength: 0,
    distinctStyleIds: 0,
    historySnapshots: 0,
    historySnapshotBytes: 0,
    historyMaterializations: 0,
    historyDisposals: 0,
    admissionReferenceEntriesScanned: 0,
    admissionReferenceMapsMaterialized: 0,
  };

  constructor(workbook: Workbook, data?: ColumnarData, options: SheetwriteStoreOptions = {}) {
    if (!isLoaded()) {
      throw new Error("Sheetwrite: await initSheetwrite() before constructing SheetwriteStore");
    }
    if (
      options.referenceSimulationLimit !== undefined &&
      (!Number.isSafeInteger(options.referenceSimulationLimit) ||
        options.referenceSimulationLimit <= 0)
    ) {
      throw new Error("Sheetwrite: referenceSimulationLimit must be a positive safe integer");
    }
    if (data && options.storage === "paged") {
      throw new Error("Sheetwrite: ColumnarData requires dense storage");
    }
    this.workbook = workbook;
    this.storageOptions = options;
    this.wasm = new CellStore() as RecomputingCellStore;
    this.boundaryAccounting.record("startup", "js-to-wasm", 0, "scalar");
    this.view = new StoreViewState(this.wasm, workbook, this.handles);
    this.windowReader = new StoreWindowReader(this.wasm, workbook, this.handles, this.styles);
    this.snapshotCodec = new StoreSnapshotCodec(
      workbook,
      this.windowReader,
      (sheet, rowCount, colCount) => this.captureSourceProjection(sheet, 0, 0, rowCount, colCount),
    );
    for (const sheet of workbook.sheets) {
      const handle = this.allocateSheet(sheet.columns.length, sheet.rowCount);
      this.boundaryAccounting.record(
        this.resourceOperation ?? "startup",
        "js-to-wasm",
        (sheet.id.length + sheet.name.length) * 2,
        "scalar",
      );
      this.wasm.setSheetName(handle, sheet.id, sheet.name);
      this.handles.set(sheet.id, handle);
      this.sheetIdsByHandle[handle] = sheet.id;
      this.syncSpillBlockers(sheet);
    }
    for (const namedRange of workbook.namedRanges ?? []) {
      if (!this.syncNamedRange(namedRange)) {
        this.wasm.free();
        throw new Error(`invalid named range: ${namedRange.name}`);
      }
    }
    if (data) {
      this.withResourceOperation("ingest", () => this.loadColumnar(workbook.activeSheet, data));
    }
    this.resourceOperation = null;
  }

  /** Internal allocation counters for deterministic range-mutation gates. */
  getRangeMutationAllocationStats(): RangeMutationAllocationStats {
    return {
      ...this.rangeMutationStats,
      styleDictionaryEntries: this.styles.table.length,
    };
  }

  resetRangeMutationAllocationStats(): void {
    for (const key of Object.keys(this.rangeMutationStats) as Array<
      keyof typeof this.rangeMutationStats
    >) {
      this.rangeMutationStats[key] = 0;
    }
  }

  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot {
    let wasm;
    if (this.disposed) {
      wasm = emptyStoreMemoryStats(this.committedBytesAfterDispose);
    } else {
      const committed = this.wasm.wasmCommittedBytes();
      wasm = decodeStoreMemoryStats(this.wasm.memoryStats(), committed > 0 ? committed : null);
    }
    return createRuntimeResourceSnapshot({
      operation,
      phase,
      wasm,
      jsOwners: this.disposed ? [] : this.resourceOwners(),
      boundary: this.boundaryAccounting.snapshot(),
      runtime,
    });
  }

  resetRuntimeResourceAccounting(): void {
    this.boundaryAccounting.reset();
  }

  getFormulaMatrixResourcePeak(): TransientResourcePeak {
    const values = this.wasm.formulaMatrixResourceStats();
    if (
      values.length !== 3 ||
      !values.every((value) => Number.isSafeInteger(value) && value >= 0)
    ) {
      throw new Error("Invalid formula matrix resource stats");
    }
    return {
      owner: "wasm.formula.transient-matrices",
      peakBytes: values[1]!,
      allocations: values[2]!,
      measurement: "instrumented-operation-peak",
    };
  }

  resetFormulaMatrixResourcePeak(): void {
    this.wasm.resetFormulaMatrixResourceStats();
  }

  withResourceOperation<T>(operation: RuntimeResourceOperation, run: () => T): T {
    const previous = this.resourceOperation;
    this.resourceOperation = operation;
    try {
      return run();
    } finally {
      this.resourceOperation = previous;
    }
  }

  private resourceOwners(): ResourceOwnerBytes[] {
    let formulaSourceBytes = 0;
    for (const [key, value] of this.formulaSrc) {
      formulaSourceBytes += (key.length + value.length) * 2;
    }
    const refs = this.refs.getResourceStats();
    return [
      {
        owner: "js.store.sheet-handles",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: this.handles.size,
        measurement: "entry-count-only",
      },
      {
        owner: "js.store.formula-sources",
        logicalBytes: formulaSourceBytes,
        allocatedBytes: formulaSourceBytes,
        entries: this.formulaSrc.size,
        measurement: "utf16-upper-bound",
      },
      {
        owner: "js.store.reference-graph",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries:
          refs.references +
          refs.targetKeys +
          refs.reverseTargets +
          refs.reverseEdges +
          refs.cachedValues,
        measurement: "entry-count-only",
      },
      ...this.styles.resourceOwners(),
      ...this.view.resourceOwners(),
      ...this.windowReader.resourceOwners(),
    ];
  }

  private recordWindowBoundary(
    window: VisibleWindowView,
    fallbackOperation: RuntimeResourceOperation,
  ): void {
    const operation = this.resourceOperation ?? fallbackOperation;
    const calls = window.ffiBoundaryCalls ?? window.ffiCalls ?? 0;
    const largest = window.ffiLargestTransferBytes ?? 0;
    this.boundaryAccounting.record(
      operation,
      "js-to-wasm",
      window.ffiInputBytes ?? 0,
      "bulk",
      calls,
      largest,
    );
    this.boundaryAccounting.record(
      operation,
      "wasm-to-js",
      window.ffiOutputBytes ?? 0,
      "bulk",
      0,
      largest,
    );
  }

  private noteRangeMutationFfi(transferredArrayLength = 0, transferredBytes?: number): void {
    this.rangeMutationStats.ffiCalls += 1;
    this.rangeMutationStats.maxTransferredArrayLength = Math.max(
      this.rangeMutationStats.maxTransferredArrayLength,
      transferredArrayLength,
    );
    const bytes = transferredBytes ?? transferredArrayLength * Uint32Array.BYTES_PER_ELEMENT;
    this.boundaryAccounting.record(
      this.resourceOperation ?? "edit",
      "js-to-wasm",
      bytes,
      transferredArrayLength > 0 ? "bulk" : "scalar",
    );
  }

  private handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw new Error(`unknown sheet: ${sheet}`);
    return handle;
  }
  private syncSpillBlockers(sheet: Sheet): void {
    const bounds: number[] = [];
    for (const merge of sheet.merges ?? []) {
      bounds.push(merge.r0, merge.c0, merge.r1, merge.c1);
    }
    for (const protectedRange of sheet.protectedRanges ?? []) {
      const range = normalizedRange(protectedRange.range);
      bounds.push(range.start.row, range.start.col, range.end.row, range.end.col);
    }
    for (const validationRule of sheet.validationRules ?? []) {
      const range = normalizedRange(validationRule.range);
      bounds.push(range.start.row, range.start.col, range.end.row, range.end.col);
    }
    if (!this.wasm.setSpillBlockers(this.handleOf(sheet.id), Uint32Array.from(bounds))) {
      throw new RangeError(`spill blocker resource limit exceeded for sheet: ${sheet.id}`);
    }
  }

  private flushSpillBlockers(): void {
    for (const sheetId of this.spillBlockersDirty) {
      const sheet = this.workbook.sheets.find((candidate) => candidate.id === sheetId);
      if (sheet) this.syncSpillBlockers(sheet);
    }
    this.spillBlockersDirty.clear();
  }

  private spillAnchor(addr: CellAddress): CellAddress | null {
    const handle = this.handleOf(addr.sheet);
    const row = this.wasm.spillAnchorRow(handle, addr.row, addr.col);
    if (row === 0xffffffff) return null;
    const col = this.wasm.spillAnchorCol(handle, addr.row, addr.col);
    if (col === 0xffffffff) return null;
    return { sheet: addr.sheet, row, col };
  }

  private rangeCutsSpill(range: Range): boolean {
    const bounds = normalizedRange(range);
    const cols = Array.from(
      { length: bounds.end.col - bounds.start.col + 1 },
      (_, index) => bounds.start.col + index,
    );
    const owners = this.windowReader.spillOwnerCoordinates(
      bounds.sheet,
      { start: bounds.start.row, end: bounds.end.row + 1 },
      cols,
    );
    for (let offset = 0; offset < owners.length; offset += 2) {
      const row = owners[offset] ?? 0xffffffff;
      const col = owners[offset + 1] ?? 0xffffffff;
      if (row === 0xffffffff || col === 0xffffffff) continue;
      if (
        row < bounds.start.row ||
        row > bounds.end.row ||
        col < bounds.start.col ||
        col > bounds.end.col
      ) {
        return true;
      }
    }
    return false;
  }

  private captureSourceProjection(
    sheet: SheetId,
    rowStart: number,
    colStart: number,
    rows: number,
    cols: number,
  ): RangeSourceProjection | null {
    this.noteRangeMutationFfi();
    const snapshot = this.wasm.captureSources(this.handleOf(sheet), rowStart, colStart, rows, cols);
    return snapshot ? consumeSourceSnapshot(snapshot, this.sheetIdsByHandle) : null;
  }

  private namedRangeScope(scope: SheetId | undefined): number {
    return scope === undefined ? -1 : this.handleOf(scope);
  }

  private syncNamedRange(namedRange: NamedRangeSnapshot): boolean {
    const range = normalizedRange(namedRange.range);
    this.boundaryAccounting.record(
      this.resourceOperation ?? "edit",
      "js-to-wasm",
      namedRange.name.length * 2,
      "scalar",
    );
    return this.wasm.setNamedRange(
      namedRange.name,
      this.namedRangeScope(namedRange.scope),
      this.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      range.end.row,
      range.end.col,
    );
  }

  private sameNamedRange(
    namedRange: NamedRangeSnapshot,
    name: string,
    scope: SheetId | undefined,
  ): boolean {
    return namedRange.name.toUpperCase() === name.toUpperCase() && namedRange.scope === scope;
  }

  private allocateSheet(columns: number, rows: number): number {
    const handle =
      this.storageOptions.storage === "paged"
        ? this.wasm.addPagedSheet(
            columns,
            rows,
            this.storageOptions.chunkRows ?? DEFAULT_PAGED_CHUNK_ROWS,
            this.storageOptions.cacheBytes ?? DEFAULT_PAGED_CACHE_BYTES,
            this.storageOptions.dirtyCellLimit ?? DEFAULT_PAGED_DIRTY_CELL_LIMIT,
          )
        : this.wasm.addSheet(columns, rows);
    this.boundaryAccounting.record(this.resourceOperation ?? "edit", "js-to-wasm", 0, "scalar");
    return handle;
  }

  isPaged(sheet: SheetId): boolean {
    return this.wasm.isPaged(this.handleOf(sheet));
  }

  getPagedStats(sheet: SheetId): PagedStoreStats {
    const stats = this.wasm.pagedStats(this.handleOf(sheet));
    return {
      chunks: stats[0] ?? 0,
      loadedCells: stats[1] ?? 0,
      dirtyCells: stats[2] ?? 0,
      allocatedBytes: stats[3] ?? 0,
      dirtyAllocatedBytes: stats[5] ?? 0,
      fullyLoaded: stats[4] === 1,
    };
  }

  queryCapability(sheet: SheetId): QueryCapability {
    const meta = this.sheetMeta(sheet);
    const stats = this.getPagedStats(sheet);
    if (!this.isPaged(sheet) || stats.fullyLoaded) return { status: "complete" };
    return {
      status: "incomplete",
      loadedCells: stats.loadedCells,
      totalCells: meta.rowCount * meta.columns.length,
    };
  }

  getCellLoadState(addr: CellAddress): CellLoadState {
    const state = this.wasm.cellState(this.handleOf(addr.sheet), addr.row, addr.col);
    if (state === 0) return "unloaded";
    if (state === 1) return "loaded-empty";
    if (state === 3) return "local-edit";
    return "loaded-value";
  }

  isRangeFullyLoaded(input: Range): boolean {
    const range = normalizedRange(input);
    return this.wasm.rangeFullyLoaded(
      this.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      range.end.row,
      range.end.col,
    );
  }

  canApplyLocally(patch: DocumentOp): boolean {
    const sheet = patchSheetId(patch);
    if (sheet === null || !this.handles.has(sheet) || !this.isPaged(sheet)) return true;
    if (
      patch.op === "setSheetMeta" &&
      ((patch.patch.sortKeys?.length ?? 0) > 0 || (patch.patch.filters?.length ?? 0) > 0)
    ) {
      return this.queryCapability(sheet).status === "complete";
    }
    if (patch.op === "setRangeStyle" || patch.op === "clearRange") {
      return this.isRangeFullyLoaded(patch.range);
    }
    if (
      patch.op === "removeRows" ||
      patch.op === "moveRows" ||
      patch.op === "removeColumns" ||
      patch.op === "moveColumns"
    ) {
      return this.wasm.isFullyLoaded(this.handleOf(sheet));
    }
    return true;
  }

  pagedDirtyCapacityIssue(patches: readonly DocumentOp[]): MutationIssue | null {
    if (this.storageOptions.storage !== "paged") return null;
    const limit = this.storageOptions.dirtyCellLimit ?? DEFAULT_PAGED_DIRTY_CELL_LIMIT;
    const referenceSimulationLimit =
      this.storageOptions.referenceSimulationLimit ?? MAX_PAGED_REFERENCE_SIMULATION_ENTRIES;
    const wasmIndexLimit = 0xffff_ffff;
    const states = new Map<SheetId, PagedDirtyPreflightState>();
    const sheetLifecycle = createSheetLifecycleState(this.workbook.sheets);
    const referenceLifecycle = createSheetLifecycleState(this.workbook.sheets);
    const applicableRemove = patches.map((patch) => {
      const applied = applySheetLifecycleOperation(referenceLifecycle, patch);
      return patch.op === "removeSheet" && applied === true;
    });
    const removeAfter = new Array<boolean>(patches.length);
    let laterRemove = false;
    for (let index = patches.length - 1; index >= 0; index--) {
      removeAfter[index] = laterRemove;
      if (applicableRemove[index]) laterRemove = true;
    }
    let trackVirtualRefs = false;
    let referenceSimulationExceeded = false;
    let referenceSimulationActual = this.refs.entryCount();
    let virtualRefs: Map<string, CellAddress> | null = null;
    const referenceSimulationIssue = (): MutationIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource: "paged-reference-simulation",
      actual: referenceSimulationActual,
      max: referenceSimulationLimit,
      message: `Paged reference simulation exceeds the ${referenceSimulationLimit} entry limit`,
    });
    const materializeVirtualRefs = (): Map<string, CellAddress> | null => {
      if (!trackVirtualRefs) return null;
      if (virtualRefs) return virtualRefs;
      if (this.refs.entryCount() > referenceSimulationLimit) {
        referenceSimulationActual = this.refs.entryCount();
        referenceSimulationExceeded = true;
        return null;
      }
      this.rangeMutationStats.admissionReferenceMapsMaterialized++;
      virtualRefs = new Map();
      for (const [source, target] of this.refs.entryIterator()) {
        this.rangeMutationStats.admissionReferenceEntriesScanned++;
        virtualRefs.set(cellKey(source), { ...target });
      }
      if (virtualRefs.size > referenceSimulationLimit) {
        referenceSimulationActual = virtualRefs.size;
        referenceSimulationExceeded = true;
        return null;
      }
      return virtualRefs;
    };
    const setVirtualRef = (source: CellAddress, target: CellAddress | null): void => {
      const refs = materializeVirtualRefs();
      if (!refs) return;
      const key = cellKey(source);
      const replaced = refs.delete(key);
      if (target) {
        if (!replaced && refs.size >= referenceSimulationLimit) {
          referenceSimulationActual = refs.size + 1;
          referenceSimulationExceeded = true;
          return;
        }
        refs.set(key, { ...target });
      }
    };
    const rebaseVirtualRefs = (
      sheet: SheetId,
      rowAt: (row: number) => number | null,
      colAt: (col: number) => number | null,
    ): void => {
      const refs = materializeVirtualRefs();
      if (!refs) return;
      this.rangeMutationStats.admissionReferenceMapsMaterialized++;
      const rebased = new Map<string, CellAddress>();
      for (const [sourceKey, target] of refs) {
        const source = parseCellKey(sourceKey);
        const sourceRow = source.sheet === sheet ? rowAt(source.row) : source.row;
        const sourceCol = source.sheet === sheet ? colAt(source.col) : source.col;
        const targetRow = target.sheet === sheet ? rowAt(target.row) : target.row;
        const targetCol = target.sheet === sheet ? colAt(target.col) : target.col;
        if (sourceRow === null || sourceCol === null || targetRow === null || targetCol === null) {
          continue;
        }
        const nextSource = { sheet: source.sheet, row: sourceRow, col: sourceCol };
        rebased.set(cellKey(nextSource), {
          sheet: target.sheet,
          row: targetRow,
          col: targetCol,
        });
      }
      virtualRefs = rebased;
      if (rebased.size > referenceSimulationLimit) {
        referenceSimulationActual = rebased.size;
        referenceSimulationExceeded = true;
      }
    };
    const clearVirtualRefs = (
      sheet: SheetId,
      startRow: number,
      startCol: number,
      rows: number,
      cols: number,
    ): void => {
      const refs = materializeVirtualRefs();
      if (!refs) return;
      for (const sourceKey of refs.keys()) {
        const source = parseCellKey(sourceKey);
        if (
          source.sheet === sheet &&
          source.row >= startRow &&
          source.row < startRow + rows &&
          source.col >= startCol &&
          source.col < startCol + cols
        ) {
          refs.delete(sourceKey);
        }
      }
    };
    const keyOf = (row: number, col: number) => `${row}:${col}`;
    const stateFor = (sheet: SheetId) => {
      const existing = states.get(sheet);
      if (existing) return existing;
      if (!this.handles.has(sheet)) return undefined;
      let state: PagedDirtyPreflightState;
      const meta = this.sheetMeta(sheet);
      state = {
        handle: this.handleOf(sheet),
        rows: meta.rowCount,
        cols: meta.columns.length,
        columnKeys: meta.columns.map((column) => column.key),
        dirty: this.getPagedStats(sheet).dirtyCells,
        additional: 0,
        existing: null,
        seen: new Set<string>(),
      };
      states.set(sheet, state);
      return state;
    };
    const issue = (actual: number): MutationIssue => ({
      kind: "resource-limit",
      severity: "error",
      resource: "paged-dirty-cells",
      actual: Math.min(Number.MAX_SAFE_INTEGER, actual),
      max: limit,
      message: `Paged dirty cells exceed the ${limit} cell limit`,
    });
    const invalid = (operationIndex: number, message: string): MutationIssue => ({
      kind: "invalid-operation",
      severity: "error",
      operationIndex,
      message,
    });
    const consume = (state: PagedDirtyPreflightState): MutationIssue | null => {
      const actual = state.dirty + state.additional + 1;
      if (actual > limit) return issue(actual);
      state.additional += 1;
      return null;
    };
    const materializeExisting = (state: PagedDirtyPreflightState) => {
      if (state.existing) return;
      const existing = new Set<string>();
      if (state.handle !== null) {
        const coordinates = this.wasm.pagedDirtyCoordinates(state.handle);
        for (let index = 0; index + 1 < coordinates.length; index += 2) {
          existing.add(keyOf(coordinates[index]!, coordinates[index + 1]!));
        }
      }
      state.existing = existing;
      state.dirty = existing.size;
    };
    const rebaseSet = (
      source: ReadonlySet<string>,
      rowAt: (row: number) => number | null,
      colAt: (col: number) => number | null,
    ) => {
      const rebased = new Set<string>();
      for (const encoded of source) {
        const separator = encoded.indexOf(":");
        const row = Number(encoded.slice(0, separator));
        const col = Number(encoded.slice(separator + 1));
        const nextRow = rowAt(row);
        const nextCol = colAt(col);
        if (nextRow !== null && nextCol !== null) rebased.add(keyOf(nextRow, nextCol));
      }
      return rebased;
    };
    const rebaseState = (
      state: PagedDirtyPreflightState,
      rowAt: (row: number) => number | null,
      colAt: (col: number) => number | null,
    ) => {
      materializeExisting(state);
      state.existing = rebaseSet(state.existing!, rowAt, colAt);
      state.seen = rebaseSet(state.seen, rowAt, colAt);
      state.dirty = state.existing.size;
      state.additional = state.seen.size;
    };
    const addSparse = (sheet: SheetId, row: number, col: number): MutationIssue | null => {
      const state = stateFor(sheet);
      if (!state || row < 0 || col < 0 || row >= state.rows || col >= state.cols) return null;
      const key = keyOf(row, col);
      if (state.seen.has(key)) return null;
      if (
        state.existing?.has(key) ||
        (state.existing === null &&
          state.handle !== null &&
          this.wasm.cellState(state.handle, row, col) === 3)
      ) {
        return null;
      }
      const rejection = consume(state);
      if (!rejection) state.seen.add(key);
      return rejection;
    };
    const cellApplies = (sheet: SheetId, row: number, col: number): boolean => {
      const state = stateFor(sheet);
      return Boolean(state && row >= 0 && col >= 0 && row < state.rows && col < state.cols);
    };
    const rectangleApplies = (
      sheet: SheetId,
      startRow: number,
      startCol: number,
      rows: number,
      cols: number,
    ): boolean => {
      const state = stateFor(sheet);
      return Boolean(
        state &&
          startRow >= 0 &&
          startCol >= 0 &&
          Number.isSafeInteger(rows) &&
          Number.isSafeInteger(cols) &&
          rows > 0 &&
          cols > 0 &&
          rows <= state.rows - startRow &&
          cols <= state.cols - startCol,
      );
    };
    const addRectangle = (
      sheet: SheetId,
      startRow: number,
      startCol: number,
      rows: number,
      cols: number,
    ): MutationIssue | null => {
      if (rows === 1 && cols === 1) return addSparse(sheet, startRow, startCol);
      const state = stateFor(sheet);
      if (!state) return null;
      if (startRow < 0 || startCol < 0) return null;
      if (
        !Number.isSafeInteger(rows) ||
        !Number.isSafeInteger(cols) ||
        rows < 0 ||
        cols < 0 ||
        rows > Math.floor(Number.MAX_SAFE_INTEGER / Math.max(cols, 1))
      ) {
        return issue(Number.MAX_SAFE_INTEGER);
      }
      if (rows > state.rows - startRow || cols > state.cols - startCol) {
        const actual = state.dirty + state.additional + rows * cols;
        return actual > limit ? issue(actual) : null;
      }
      materializeExisting(state);
      for (let row = startRow; row < startRow + rows; row++) {
        for (let col = startCol; col < startCol + cols; col++) {
          const key = keyOf(row, col);
          if (state.existing!.has(key) || state.seen.has(key)) continue;
          const rejection = consume(state);
          if (rejection) return rejection;
          state.seen.add(key);
        }
      }
      return null;
    };

    for (let operationIndex = 0; operationIndex < patches.length; operationIndex++) {
      const patch = patches[operationIndex]!;
      trackVirtualRefs = removeAfter[operationIndex] ?? false;
      if (patch.op === "addSheet") {
        if (!applySheetLifecycleOperation(sheetLifecycle, patch)) continue;
        const snapshot = patch.sheet;
        const state: PagedDirtyPreflightState = {
          handle: null,
          rows: snapshot.rowCount,
          cols: snapshot.columns.length,
          columnKeys: snapshot.columns.map((column) => column.key),
          dirty: 0,
          additional: 0,
          existing: new Set<string>(),
          seen: new Set<string>(),
        };
        states.set(snapshot.id, state);
        for (const block of snapshot.cells) {
          for (const cell of block.cells) {
            const rejection = addSparse(
              snapshot.id,
              block.startRow + cell.rowOffset,
              block.startCol + cell.colOffset,
            );
            if (rejection) return rejection;
            if (cell.value.kind === "ref") {
              setVirtualRef(
                {
                  sheet: snapshot.id,
                  row: block.startRow + cell.rowOffset,
                  col: block.startCol + cell.colOffset,
                },
                cell.value.target,
              );
              if (referenceSimulationExceeded) return referenceSimulationIssue();
            }
          }
        }
        if (referenceSimulationExceeded) return referenceSimulationIssue();
        continue;
      }
      if (patch.op === "removeSheet") {
        if (!applySheetLifecycleOperation(sheetLifecycle, patch)) continue;
        if (referenceSimulationExceeded) return referenceSimulationIssue();
        if (
          trackVirtualRefs &&
          virtualRefs === null &&
          this.refs.entryCount() > referenceSimulationLimit
        ) {
          return referenceSimulationIssue();
        }
        const materializedRefs = virtualRefs;
        const entries: Iterable<[CellAddress, CellAddress]> = materializedRefs
          ? (function* () {
              for (const [sourceKey, target] of materializedRefs) {
                yield [parseCellKey(sourceKey), target] as [CellAddress, CellAddress];
              }
            })()
          : this.refs.entryIterator();
        if (trackVirtualRefs) {
          this.rangeMutationStats.admissionReferenceMapsMaterialized++;
        }
        const remaining = trackVirtualRefs ? new Map<string, CellAddress>() : null;
        for (const [source, target] of entries) {
          if (!materializedRefs) this.rangeMutationStats.admissionReferenceEntriesScanned++;
          if (source.sheet !== patch.sheet && target.sheet === patch.sheet) {
            const rejection = addSparse(source.sheet, source.row, source.col);
            if (rejection) return rejection;
          }
          if (remaining && source.sheet !== patch.sheet && target.sheet !== patch.sheet) {
            remaining.set(cellKey(source), { ...target });
          }
        }
        virtualRefs = remaining;
        states.delete(patch.sheet);
        continue;
      }
      if (patch.op === "renameSheet" || patch.op === "moveSheet") {
        applySheetLifecycleOperation(sheetLifecycle, patch);
        continue;
      }
      const sheet = patchSheetId(patch);
      if (
        sheet !== null &&
        (patch.op === "addRows" ||
          patch.op === "removeRows" ||
          patch.op === "moveRows" ||
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          patch.op === "moveColumns")
      ) {
        const state = stateFor(sheet);
        if (!state) continue;
        const keep = (index: number) => index;
        if (patch.op === "addRows") {
          if (patch.at > state.rows || patch.count > wasmIndexLimit - state.rows) {
            return invalid(operationIndex, "addRows exceeds the current sheet bounds");
          }
          rebaseState(state, (row) => (row >= patch.at ? row + patch.count : row), keep);
          rebaseVirtualRefs(sheet, (row) => (row >= patch.at ? row + patch.count : row), keep);
          state.rows += patch.count;
        } else if (patch.op === "removeRows") {
          if (patch.at > state.rows || patch.count > state.rows - patch.at) {
            return invalid(operationIndex, "removeRows exceeds the current sheet bounds");
          }
          rebaseState(
            state,
            (row) =>
              row < patch.at ? row : row < patch.at + patch.count ? null : row - patch.count,
            keep,
          );
          rebaseVirtualRefs(
            sheet,
            (row) =>
              row < patch.at ? row : row < patch.at + patch.count ? null : row - patch.count,
            keep,
          );
          state.rows -= patch.count;
        } else if (patch.op === "moveRows") {
          if (
            patch.from > state.rows ||
            patch.count > state.rows - patch.from ||
            patch.to > state.rows - patch.count
          ) {
            return invalid(operationIndex, "moveRows exceeds the current sheet bounds");
          }
          rebaseState(state, (row) => moveIndex(row, patch.from, patch.count, patch.to), keep);
          rebaseVirtualRefs(
            sheet,
            (row) => moveIndex(row, patch.from, patch.count, patch.to),
            keep,
          );
        } else if (patch.op === "addColumns") {
          const insertedKeys = patch.columns.map((column) => column.key);
          if (
            patch.at > state.cols ||
            insertedKeys.length === 0 ||
            insertedKeys.length > wasmIndexLimit - state.cols ||
            new Set([...state.columnKeys, ...insertedKeys]).size !==
              state.columnKeys.length + insertedKeys.length
          ) {
            return invalid(operationIndex, "addColumns exceeds the current sheet bounds");
          }
          rebaseState(state, keep, (col) => (col >= patch.at ? col + patch.columns.length : col));
          rebaseVirtualRefs(sheet, keep, (col) =>
            col >= patch.at ? col + patch.columns.length : col,
          );
          state.cols += patch.columns.length;
          state.columnKeys.splice(patch.at, 0, ...insertedKeys);
        } else if (patch.op === "removeColumns") {
          if (
            patch.at > state.cols ||
            patch.count > state.cols - patch.at ||
            patch.count === state.cols
          ) {
            return invalid(operationIndex, "removeColumns exceeds the current sheet bounds");
          }
          rebaseState(state, keep, (col) =>
            col < patch.at ? col : col < patch.at + patch.count ? null : col - patch.count,
          );
          rebaseVirtualRefs(sheet, keep, (col) =>
            col < patch.at ? col : col < patch.at + patch.count ? null : col - patch.count,
          );
          state.cols -= patch.count;
          state.columnKeys.splice(patch.at, patch.count);
        } else {
          if (
            patch.from > state.cols ||
            patch.count > state.cols - patch.from ||
            patch.to > state.cols - patch.count
          ) {
            return invalid(operationIndex, "moveColumns exceeds the current sheet bounds");
          }
          rebaseState(state, keep, (col) => moveIndex(col, patch.from, patch.count, patch.to));
          rebaseVirtualRefs(sheet, keep, (col) =>
            moveIndex(col, patch.from, patch.count, patch.to),
          );
          const movedKeys = state.columnKeys.splice(patch.from, patch.count);
          state.columnKeys.splice(patch.to, 0, ...movedKeys);
        }
        if (referenceSimulationExceeded) return referenceSimulationIssue();
        continue;
      }
      let rejection: MutationIssue | null = null;
      if (patch.op === "set") {
        if (!cellApplies(patch.addr.sheet, patch.addr.row, patch.addr.col)) continue;
        rejection = addSparse(patch.addr.sheet, patch.addr.row, patch.addr.col);
        if (!rejection) {
          setVirtualRef(patch.addr, patch.value.kind === "ref" ? patch.value.target : null);
        }
      } else if (patch.op === "setRange") {
        const range = normalizedRange(patch.range);
        const rows = range.end.row - range.start.row + 1;
        const cols = range.end.col - range.start.col + 1;
        if (
          !rectangleApplies(range.sheet, range.start.row, range.start.col, rows, cols) ||
          patch.cells.some(
            (cell) =>
              !integerAt(cell.rowOffset) ||
              !integerAt(cell.colOffset) ||
              cell.rowOffset >= rows ||
              cell.colOffset >= cols,
          )
        ) {
          continue;
        }
        for (const cell of patch.cells) {
          rejection = addSparse(
            range.sheet,
            range.start.row + cell.rowOffset,
            range.start.col + cell.colOffset,
          );
          if (rejection) break;
          const source = {
            sheet: range.sheet,
            row: range.start.row + cell.rowOffset,
            col: range.start.col + cell.colOffset,
          };
          setVirtualRef(source, cell.value.kind === "ref" ? cell.value.target : null);
          if (referenceSimulationExceeded) return referenceSimulationIssue();
        }
      } else if (patch.op === "setBlock") {
        const range = normalizedRange(patch.range);
        rejection = addRectangle(
          range.sheet,
          range.start.row,
          range.start.col,
          patch.block.rowCount,
          patch.block.colCount,
        );
        if (
          !rejection &&
          patch.block.rowCount === range.end.row - range.start.row + 1 &&
          patch.block.colCount === range.end.col - range.start.col + 1 &&
          rectangleApplies(
            range.sheet,
            range.start.row,
            range.start.col,
            patch.block.rowCount,
            patch.block.colCount,
          )
        ) {
          for (let rowOffset = 0; rowOffset < patch.block.rowCount; rowOffset++) {
            for (let colOffset = 0; colOffset < patch.block.colCount; colOffset++) {
              const offset = rowOffset * patch.block.colCount + colOffset;
              setVirtualRef(
                {
                  sheet: range.sheet,
                  row: range.start.row + rowOffset,
                  col: range.start.col + colOffset,
                },
                null,
              );
              if (referenceSimulationExceeded) return referenceSimulationIssue();
            }
          }
          for (const [offset, target] of patch.block.refs ?? []) {
            setVirtualRef(
              {
                sheet: range.sheet,
                row: range.start.row + Math.floor(offset / patch.block.colCount),
                col: range.start.col + (offset % patch.block.colCount),
              },
              target,
            );
            if (referenceSimulationExceeded) return referenceSimulationIssue();
          }
        }
      } else if (patch.op === "setRangeStyle" || patch.op === "clearRange") {
        const range = normalizedRange(patch.range);
        rejection = addRectangle(
          range.sheet,
          range.start.row,
          range.start.col,
          range.end.row - range.start.row + 1,
          range.end.col - range.start.col + 1,
        );
        if (
          !rejection &&
          patch.op === "clearRange" &&
          (patch.contents ?? true) &&
          rectangleApplies(
            range.sheet,
            range.start.row,
            range.start.col,
            range.end.row - range.start.row + 1,
            range.end.col - range.start.col + 1,
          )
        ) {
          clearVirtualRefs(
            range.sheet,
            range.start.row,
            range.start.col,
            range.end.row - range.start.row + 1,
            range.end.col - range.start.col + 1,
          );
        }
      }
      if (referenceSimulationExceeded) return referenceSimulationIssue();
      if (rejection) return rejection;
    }
    return null;
  }

  private requireCompleteQuery(sheet: SheetId): void {
    const capability = this.queryCapability(sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet, capability);
  }

  private sheetMeta(sheet: SheetId) {
    const meta = this.workbook.sheets.find((s) => s.id === sheet);
    if (!meta) throw new Error(`unknown sheet: ${sheet}`);
    return meta;
  }

  /** True when a set patch can affect an existing cell in workbook metadata. */
  private isCellInBounds(addr: CellAddress): boolean {
    const meta = this.workbook.sheets.find((s) => s.id === addr.sheet);
    return (
      meta !== undefined &&
      Number.isInteger(addr.row) &&
      Number.isInteger(addr.col) &&
      addr.row >= 0 &&
      addr.row < meta.rowCount &&
      addr.col >= 0 &&
      addr.col < meta.columns.length
    );
  }

  /**
   * Capture one rectangle in WASM for undo. The returned resource is local to
   * this store and must be disposed by history when evicted or destroyed.
   */
  captureRangeHistory(input: Range): CompactRangeHistory | null {
    const range = normalizedRange(input);
    const sheet = this.sheetMeta(range.sheet);
    if (
      range.start.row < 0 ||
      range.start.col < 0 ||
      range.end.row >= sheet.rowCount ||
      range.end.col >= sheet.columns.length
    ) {
      return null;
    }
    const rows = range.end.row - range.start.row + 1;
    const cols = range.end.col - range.start.col + 1;
    this.noteRangeMutationFfi();
    const resource = this.wasm.captureRange(
      this.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      rows,
      cols,
    );
    if (!resource) return null;
    this.rangeMutationStats.historySnapshots += 1;
    this.rangeMutationStats.historySnapshotBytes += resource.byteLength();

    const formulaCoordinates = resource.formulaOffsets();
    const formulaSources = resource.formulaSources();
    const formulas: Array<[number, string]> = new Array(formulaSources.length);
    for (let index = 0; index < formulaSources.length; index++) {
      const coordinate = index * 2;
      formulas[index] = [
        formulaCoordinates[coordinate]! * cols + formulaCoordinates[coordinate + 1]!,
        formulaSources[index]!,
      ];
    }

    const referenceCoordinates = resource.referenceOffsets();
    const referenceTargets = resource.referenceTargets();
    const refs: Array<[number, CellAddress]> = new Array(referenceCoordinates.length / 2);
    for (let index = 0; index < refs.length; index++) {
      const coordinate = index * 2;
      const packedTarget = referenceTargets.subarray(index * 3, index * 3 + 3);
      const target = referenceTargetFromPacked(packedTarget, this.sheetIdsByHandle);
      if (!target) {
        resource.free();
        throw new Error("history snapshot contains an unknown reference target");
      }
      refs[index] = [
        referenceCoordinates[coordinate]! * cols + referenceCoordinates[coordinate + 1]!,
        target,
      ];
    }

    let disposed = false;
    return {
      range,
      byteLength: resource.byteLength(),
      resource,
      refs,
      toDocumentOp: (target) => {
        if (disposed) throw new Error("history range snapshot already disposed");
        this.rangeMutationStats.historyMaterializations += 1;
        const kindsColumnMajor = resource.kinds();
        const numbersColumnMajor = this.wasm.snapshotNumbers(resource);
        const textsColumnMajor = this.wasm.snapshotTexts(resource);
        const stylesColumnMajor = resource.styleIds();
        const values: CellScalar[] = new Array(rows * cols);
        const styleIds: number[] = new Array(rows * cols);
        const styleTable: CellStyle[] = [];
        const styleLookup = new Map<number, number>();
        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const source = col * rows + row;
            const offset = row * cols + col;
            const kind = kindsColumnMajor[source]!;
            const number = numbersColumnMajor[source]!;
            const text = textsColumnMajor[source]!;
            values[offset] =
              kind === KIND_NUMBER
                ? number
                : kind === KIND_BOOL
                  ? number !== 0
                  : kind === KIND_STRING
                    ? text
                    : null;
            const storeStyleId = stylesColumnMajor[source]!;
            let tableId = styleLookup.get(storeStyleId);
            if (tableId === undefined) {
              tableId = styleTable.length;
              styleLookup.set(storeStyleId, tableId);
              styleTable.push({ ...this.styles.get(storeStyleId) });
            }
            styleIds[offset] = tableId;
          }
        }
        const block: PackedCellBlock = {
          rowCount: rows,
          colCount: cols,
          values,
          formulas: formulas.length > 0 ? formulas : undefined,
          refs: refs.length > 0 ? refs.map(([offset, ref]) => [offset, { ...ref }]) : undefined,
          styleTable,
          styleIds,
        };
        return { op: "setBlock", range: target, block };
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        resource.free();
        this.rangeMutationStats.historyDisposals += 1;
      },
    };
  }

  getWorkbook(): Workbook {
    return this.workbook;
  }

  private rawCell(addr: CellAddress): ResolvedCell {
    const cell = this.wasm.getCell(this.handleOf(addr.sheet), addr.row, addr.col);
    let resolved: CellScalar = null;
    if (cell.kind === KIND_NUMBER || cell.kind === KIND_FORMULA) resolved = cell.num;
    else if (cell.kind === KIND_BOOL) resolved = cell.num !== 0;
    else if (cell.kind === KIND_STRING) resolved = cell.string ?? null;
    const style = this.styles.get(cell.style);
    cell.free();
    return { resolved, style };
  }

  getCell(addr: CellAddress): ResolvedCell {
    return this.rawCell(addr);
  }

  /** The formula source at `addr`, or null if the cell isn't a formula. */
  getFormula(addr: CellAddress): string | null {
    return this.wasm.formulaSource(this.handleOf(addr.sheet), addr.row, addr.col) ?? null;
  }
  /** The owning formula anchor for a spill cell, including the anchor itself. */
  getSpillAnchor(addr: CellAddress): CellAddress | null {
    return this.spillAnchor(addr);
  }

  /** Plain-reference target at `addr`, or null when the cell is not a ref. */
  getRefTarget(addr: CellAddress): CellAddress | null {
    return referenceTargetFromPacked(
      this.wasm.referenceTarget(this.handleOf(addr.sheet), addr.row, addr.col),
      this.sheetIdsByHandle,
    );
  }

  recomputeVolatile(now: Date): void {
    const milliseconds = now.getTime();
    if (!Number.isFinite(milliseconds)) throw new RangeError("invalid volatile recalculation date");
    this.wasm.recomputeVolatile(dateToSerial(now));
  }

  /** Map a displayed row position to the backing data row under sort/filter. */
  dataRowAt(sheet: SheetId, viewRow: number): number {
    return this.view.dataRowAt(sheet, viewRow);
  }

  /** Map a backing data row to its displayed position, or null when filtered out. */
  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    return this.view.viewRowOf(sheet, dataRow);
  }

  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    const window = this.windowReader.read(sheet, rows, cols, this.view.order(sheet), true);
    this.recordWindowBoundary(window, "scroll");
    return window;
  }

  getDataWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    const window = this.windowReader.read(sheet, rows, cols, undefined, false);
    this.recordWindowBoundary(window, "scroll");
    return window;
  }

  getClipboardWindow(
    sheet: SheetId,
    viewRows: { start: number; end: number },
    cols: readonly number[],
  ): ClipboardWindowView {
    const order = this.view.order(sheet);
    const clippedEnd = order ? Math.min(viewRows.end, order.length) : viewRows.end;
    const rowCount = Math.max(0, clippedEnd - viewRows.start);
    const dataRows = new Uint32Array(rowCount);
    if (order) {
      dataRows.set(order.subarray(viewRows.start, clippedEnd));
    } else {
      for (let index = 0; index < rowCount; index++) dataRows[index] = viewRows.start + index;
    }
    const window = this.windowReader.read(
      sheet,
      { start: viewRows.start, end: clippedEnd },
      cols,
      order,
      false,
    );
    this.recordWindowBoundary(window, "export");
    const spillDerived = this.windowReader.spillDerivedMaskForRows(sheet, dataRows, cols);
    const formulas: Array<{ offset: number; source: string }> = [];
    const refs: Array<{ offset: number; target: CellAddress }> = [];
    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const row = dataRows[rowIndex]!;
      for (let colIndex = 0; colIndex < cols.length; colIndex++) {
        const offset = rowIndex * cols.length + colIndex;
        const addr = { sheet, row, col: cols[colIndex]! };
        const formula = this.getFormula(addr);
        if (formula !== null) {
          formulas.push({ offset, source: formula });
          continue;
        }
        const target = this.getRefTarget(addr);
        if (target !== null) refs.push({ offset, target });
      }
    }
    return {
      sheet,
      viewRows: { start: viewRows.start, end: clippedEnd },
      dataRows,
      cols,
      values: window.values,
      styleIds: window.styleIds,
      styles: window.styles,
      spillDerived,
      formulas,
      refs,
      ffiCalls: (window.ffiCalls ?? 0) + 1,
      transferredElements:
        window.values.length +
        window.styleIds.length +
        dataRows.length +
        window.styles.length +
        formulas.length * 2 +
        refs.length * 4 +
        spillDerived.length,
    };
  }

  aggregate(sheet: SheetId, col: number, op: AggregateOp): number {
    this.requireCompleteQuery(sheet);
    return this.wasm.aggregate(this.handleOf(sheet), col, AGG_OP[op]);
  }

  /** Live view of a sheet's active column filters, keyed by column index. */
  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.view.columnFilters(sheet);
  }

  /**
   * Distinct resolved values of a column in first-seen order, capped at `limit`
   * distinct values (`0` = uncapped). Blanks collapse to a single `null` entry.
   * Feeds a values-filter picker.
   */
  distinctValues(sheet: SheetId, col: number, limit = 1000): CellScalar[] {
    this.requireCompleteQuery(sheet);
    return this.view.distinctValues(sheet, col, limit);
  }

  /** The sheet's explicitly hidden data rows, ascending. */
  hiddenRows(sheet: SheetId): number[] {
    return [...(this.sheetMeta(sheet).hiddenRows ?? [])].sort((a, b) => a - b);
  }

  /** Live view of a sheet's row groups. */
  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.view.rowGroups(sheet);
  }

  /**
   * Ctrl+Arrow destination. With an active view order `row` is a VIEW position
   * and the scan runs in view space (`dataEdgeOrdered`): a vertical move returns
   * the destination VIEW position, a horizontal move returns a column index.
   * Without a view it scans data space (`dataEdge`) exactly as before.
   */
  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    this.requireCompleteQuery(sheet);
    return this.view.dataEdge(sheet, row, col, dRow, dCol);
  }

  /** Cells whose text matches `query`, scanned in WASM and returned row-major. */
  searchCells(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): CellAddress[] {
    const flat = this.searchCellsFlat(sheet, query, opts);

    const out: CellAddress[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push({ sheet, row: flat[i]!, col: flat[i + 1]! });
    }
    return out;
  }

  /** Flat row-major `[row, col, ...]` pairs for internal consumers that must not allocate cells. */
  searchCellsFlat(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): Uint32Array {
    this.requireCompleteQuery(sheet);
    const handle = this.handleOf(sheet);
    const columns = opts.columns ?? this.sheetMeta(sheet).columns.map((_, i) => i);
    return this.wasm.search(
      handle,
      Uint32Array.from(columns),
      query,
      !opts.matchCase,
      opts.wholeCell ?? false,
    );
  }

  viewRowCount(sheet: SheetId): number {
    return this.view.viewRowCount(sheet);
  }

  hasView(sheet: SheetId): boolean {
    return this.view.hasView(sheet);
  }

  ensureColumns(sheet: SheetId, columns: readonly Column[]): void {
    const meta = this.sheetMeta(sheet);
    if (columns.length <= meta.columns.length) return;

    const additions = columns.slice(meta.columns.length);
    this.wasm.insertCols(this.handleOf(sheet), meta.columns.length, additions.length);
    meta.columns.push(...additions);
  }

  private writePackedBlock(bounds: Range, block: PackedCellBlock): boolean {
    const rows = bounds.end.row - bounds.start.row + 1;
    const cols = bounds.end.col - bounds.start.col + 1;
    const cellCount = rows * cols;
    const kinds = new Uint8Array(cellCount);
    const numbers = new Float64Array(cellCount);
    const texts: string[] = new Array(cellCount);
    const wasmStyles = new Uint32Array(cellCount);
    const styleTable = block.styleTable ?? [];
    for (let offset = 0; offset < cellCount; offset++) {
      const value = block.values[offset]!;
      if (value === null || value === undefined) {
        texts[offset] = "";
      } else if (typeof value === "number") {
        kinds[offset] = KIND_NUMBER;
        numbers[offset] = value;
        texts[offset] = "";
      } else if (typeof value === "boolean") {
        kinds[offset] = KIND_BOOL;
        numbers[offset] = value ? 1 : 0;
        texts[offset] = "";
      } else {
        kinds[offset] = KIND_STRING;
        texts[offset] = value;
      }
      wasmStyles[offset] = this.styles.intern(
        block.styleIds === undefined ? undefined : styleTable[block.styleIds[offset]!],
      );
    }

    const formulas = block.formulas ?? [];
    const refs = block.refs ?? [];
    const referenceTargets = new Uint32Array(refs.length * 3);
    for (let index = 0; index < refs.length; index++) {
      const target = refs[index]![1];
      const targetHandle = this.handles.get(target.sheet);
      if (targetHandle === undefined || !this.isCellInBounds(target)) return false;
      const packed = index * 3;
      referenceTargets[packed] = targetHandle;
      referenceTargets[packed + 1] = target.row;
      referenceTargets[packed + 2] = target.col;
    }

    this.noteRangeMutationFfi(cellCount);
    return (
      this.wasm.setBlock(
        this.handleOf(bounds.sheet),
        bounds.start.row,
        bounds.start.col,
        rows,
        cols,
        kinds,
        numbers,
        texts,
        wasmStyles,
        Uint32Array.from(formulas, ([offset]) => offset),
        formulas.map(([, source]) => source),
        Uint32Array.from(refs, ([offset]) => offset),
        referenceTargets,
      ) === 0
    );
  }

  private writeSparseBlock(
    bounds: Range,
    cells: readonly { offset: number; value: CellValue; style?: CellStyle }[],
  ): boolean {
    const offsets = new Uint32Array(cells.length);
    const kinds = new Uint8Array(cells.length);
    const numbers = new Float64Array(cells.length);
    const texts: string[] = new Array(cells.length);
    const styles = new Uint32Array(cells.length);
    const formulaOffsets: number[] = [];
    const formulaSources: string[] = [];
    const referenceOffsets: number[] = [];
    const referenceTargets: number[] = [];
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index]!;
      offsets[index] = cell.offset;
      styles[index] = this.styles.intern(cell.style);
      if (cell.value.kind === "formula") {
        formulaOffsets.push(cell.offset);
        formulaSources.push(cell.value.src);
        texts[index] = "";
      } else if (cell.value.kind === "ref") {
        const targetHandle = this.handles.get(cell.value.target.sheet);
        if (targetHandle === undefined || !this.isCellInBounds(cell.value.target)) return false;
        referenceOffsets.push(cell.offset);
        referenceTargets.push(targetHandle, cell.value.target.row, cell.value.target.col);
        texts[index] = "";
      } else {
        const value = cell.value.value;
        if (value === null) {
          texts[index] = "";
        } else if (typeof value === "number") {
          kinds[index] = KIND_NUMBER;
          numbers[index] = value;
          texts[index] = "";
        } else if (typeof value === "boolean") {
          kinds[index] = KIND_BOOL;
          numbers[index] = value ? 1 : 0;
          texts[index] = "";
        } else {
          kinds[index] = KIND_STRING;
          texts[index] = value;
        }
      }
    }

    this.noteRangeMutationFfi(cells.length);
    return (
      this.wasm.setSparseBlock(
        this.handleOf(bounds.sheet),
        bounds.start.row,
        bounds.start.col,
        bounds.end.row - bounds.start.row + 1,
        bounds.end.col - bounds.start.col + 1,
        offsets,
        kinds,
        numbers,
        texts,
        styles,
        Uint32Array.from(formulaOffsets),
        formulaSources,
        Uint32Array.from(referenceOffsets),
        Uint32Array.from(referenceTargets),
      ) === 0
    );
  }

  /** Apply raw patches once; remote loads suppress paged dirty tracking. */
  applyPatches(
    patches: readonly DocumentOp[],
    remoteLoad: boolean,
    captureChanges: boolean,
  ): StoreDataEngineEffects {
    const changes: ChangeEvent["changes"] | null = captureChanges ? [] : null;
    const appliedPatches: DocumentOp[] = [];
    const touchedSheets = new Set<SheetId>();
    let hasStructuralPatch = false;
    const tracksPagedRevision = !remoteLoad && this.storageOptions.storage === "paged";
    const storageRevision = tracksPagedRevision ? this.wasm.beginMutation() : 0n;

    if (remoteLoad) this.wasm.beginPageLoad();
    try {
      for (const patch of patches) {
        if (!this.applyPatch(patch, changes)) continue;
        appliedPatches.push(patch);

        if (patch.op === "set" || patch.op === "setNote") touchedSheets.add(patch.addr.sheet);
        else if (
          patch.op === "setRange" ||
          patch.op === "setBlock" ||
          patch.op === "setRangeStyle" ||
          patch.op === "clearRange"
        ) {
          touchedSheets.add(patch.range.sheet);
        } else if (
          patch.op !== "setNamedRange" &&
          patch.op !== "removeNamedRange" &&
          patch.op !== "removeSheet"
        ) {
          touchedSheets.add(patch.op === "addSheet" ? patch.sheet.id : patch.sheet);
        }
        if (
          patch.op === "addRows" ||
          patch.op === "removeRows" ||
          patch.op === "moveRows" ||
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          patch.op === "moveColumns" ||
          patch.op === "addSheet" ||
          patch.op === "removeSheet"
        ) {
          hasStructuralPatch = true;
        }
      }
    } finally {
      if (remoteLoad) this.wasm.endPageLoad();
      else if (tracksPagedRevision) this.wasm.endMutation();
    }

    if (hasStructuralPatch) {
      for (const touched of touchedSheets) this.spillBlockersDirty.add(touched);
    }
    this.flushSpillBlockers();
    if (appliedPatches.length === 0) return { appliedPatches, changes, storageRevision };
    this.rangeMutationStats.documentOperations += appliedPatches.length;
    this.rangeMutationStats.jsPatchObjects += appliedPatches.length;

    this.noteRangeMutationFfi();
    this.wasm.recomputeChanged();
    return { appliedPatches, changes, storageRevision };
  }

  private applyPatch(patch: DocumentOp, changes: ChangeEvent["changes"] | null): boolean {
    switch (patch.op) {
      case "set": {
        if (!this.isCellInBounds(patch.addr)) return false;
        const owner = this.spillAnchor(patch.addr);
        if (owner && (owner.row !== patch.addr.row || owner.col !== patch.addr.col)) return false;
        const before = changes ? this.getCell(patch.addr) : null;
        const bounds: Range = {
          sheet: patch.addr.sheet,
          start: { row: patch.addr.row, col: patch.addr.col },
          end: { row: patch.addr.row, col: patch.addr.col },
        };
        if (
          !this.writeSparseBlock(bounds, [{ offset: 0, value: patch.value, style: patch.style }])
        ) {
          return false;
        }
        if (changes && before) {
          changes.push({
            addr: patch.addr,
            oldValue: literalOf(before.resolved),
            newValue: patch.value,
            oldStyle: before.style,
            newStyle: patch.style,
          });
        }
        return true;
      }
      case "setRange": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheetMeta(bounds.sheet);
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length
        ) {
          return false;
        }
        if (
          patch.cells.some(
            (cell) =>
              !integerAt(cell.rowOffset) ||
              !integerAt(cell.colOffset) ||
              bounds.start.row + cell.rowOffset > bounds.end.row ||
              bounds.start.col + cell.colOffset > bounds.end.col,
          )
        ) {
          return false;
        }
        if (
          patch.cells.some((cell) => {
            const addr = {
              sheet: bounds.sheet,
              row: bounds.start.row + cell.rowOffset,
              col: bounds.start.col + cell.colOffset,
            };
            const owner = this.spillAnchor(addr);
            return owner !== null && (owner.row !== addr.row || owner.col !== addr.col);
          })
        ) {
          return false;
        }
        const cols = bounds.end.col - bounds.start.col + 1;
        const sparseCells = patch.cells.map((cell) => ({
          offset: cell.rowOffset * cols + cell.colOffset,
          value: cell.value,
          style: cell.style,
          addr: {
            sheet: bounds.sheet,
            row: bounds.start.row + cell.rowOffset,
            col: bounds.start.col + cell.colOffset,
          },
          before: changes
            ? this.getCell({
                sheet: bounds.sheet,
                row: bounds.start.row + cell.rowOffset,
                col: bounds.start.col + cell.colOffset,
              })
            : null,
        }));
        this.rangeMutationStats.jsPatchObjects += patch.cells.length;
        if (!this.writeSparseBlock(bounds, sparseCells)) return false;
        if (changes) {
          for (const cell of sparseCells) {
            if (!cell.before) continue;
            changes.push({
              addr: cell.addr,
              oldValue: literalOf(cell.before.resolved),
              newValue: cell.value,
              oldStyle: cell.before.style,
              newStyle: cell.style,
            });
          }
        }
        return true;
      }
      case "setBlock": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheetMeta(bounds.sheet);
        const rows = bounds.end.row - bounds.start.row + 1;
        const cols = bounds.end.col - bounds.start.col + 1;
        const cellCount = rows * cols;
        const { block } = patch;
        const styleTable = block.styleTable ?? [];
        const styleIds = block.styleIds;
        const exceptions = [...(block.formulas ?? []), ...(block.refs ?? [])];
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length ||
          block.rowCount !== rows ||
          block.colCount !== cols ||
          block.values.length !== cellCount ||
          (styleIds !== undefined && styleIds.length !== cellCount) ||
          exceptions.some(
            ([offset]) => !Number.isInteger(offset) || offset < 0 || offset >= cellCount,
          ) ||
          (styleIds?.some(
            (styleId) => !Number.isInteger(styleId) || styleId < 0 || styleId >= styleTable.length,
          ) ??
            false)
        ) {
          return false;
        }
        if (this.rangeCutsSpill(bounds)) return false;

        this.rangeMutationStats.jsPatchObjects += exceptions.length;
        return this.writePackedBlock(bounds, block);
      }
      case "setRangeStyle": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheetMeta(bounds.sheet);
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length
        ) {
          return false;
        }
        this.noteRangeMutationFfi();
        const oldIds = this.wasm.rangeStyleIds(
          this.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
        );
        this.rangeMutationStats.distinctStyleIds = Math.max(
          this.rangeMutationStats.distinctStyleIds,
          oldIds.length,
        );
        this.rangeMutationStats.maxTransferredArrayLength = Math.max(
          this.rangeMutationStats.maxTransferredArrayLength,
          oldIds.length,
        );
        const newIds = new Uint32Array(oldIds.length);
        for (let i = 0; i < oldIds.length; i++) {
          newIds[i] =
            patch.style === null
              ? 0
              : this.styles.intern({ ...this.styles.get(oldIds[i]!), ...patch.style });
        }
        this.noteRangeMutationFfi(Math.max(oldIds.length, newIds.length));
        return this.wasm.remapRangeStyles(
          this.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
          oldIds,
          newIds,
        );
      }
      case "clearRange": {
        const bounds = normalizedRange(patch.range);
        const sheet = this.sheetMeta(bounds.sheet);
        if (
          bounds.start.row < 0 ||
          bounds.start.col < 0 ||
          bounds.end.row >= sheet.rowCount ||
          bounds.end.col >= sheet.columns.length
        ) {
          return false;
        }
        if ((patch.contents ?? true) && this.rangeCutsSpill(bounds)) return false;
        const clearContents = patch.contents ?? true;
        const clearStyle = patch.style ?? true;
        this.noteRangeMutationFfi();
        return this.wasm.clearRange(
          this.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
          clearContents,
          clearStyle,
        );
      }
      case "addRows": {
        const meta = this.sheetMeta(patch.sheet);
        if (!integerAt(patch.at) || !positiveCount(patch.count) || patch.at > meta.rowCount) {
          return false;
        }
        this.wasm.addRows(this.handleOf(patch.sheet), patch.at, patch.count);
        meta.rowCount += patch.count;
        this.rebaseSheetRows(patch.sheet, (row) => (row >= patch.at ? row + patch.count : row));
        return true;
      }
      case "removeRows": {
        const meta = this.sheetMeta(patch.sheet);
        if (
          !integerAt(patch.at) ||
          !positiveCount(patch.count) ||
          patch.at + patch.count > meta.rowCount
        ) {
          return false;
        }
        this.wasm.removeRows(this.handleOf(patch.sheet), patch.at, patch.count);
        meta.rowCount -= patch.count;
        this.rebaseSheetRows(patch.sheet, (row) =>
          row < patch.at ? row : row < patch.at + patch.count ? null : row - patch.count,
        );
        return true;
      }
      case "moveRows":
        return this.moveRows(patch, changes);
      case "addColumns": {
        const meta = this.sheetMeta(patch.sheet);
        if (
          !integerAt(patch.at) ||
          patch.at > meta.columns.length ||
          patch.columns.length === 0 ||
          !uniqueColumnKeys([...meta.columns, ...patch.columns])
        ) {
          return false;
        }
        this.wasm.insertCols(this.handleOf(patch.sheet), patch.at, patch.columns.length);
        meta.columns.splice(patch.at, 0, ...patch.columns);
        this.rebaseSheetCols(patch.sheet, (col) =>
          col >= patch.at ? col + patch.columns.length : col,
        );
        return true;
      }
      case "removeColumns": {
        const meta = this.sheetMeta(patch.sheet);
        if (
          !integerAt(patch.at) ||
          !positiveCount(patch.count) ||
          patch.at + patch.count > meta.columns.length ||
          patch.count === meta.columns.length
        ) {
          return false;
        }
        this.wasm.removeCols(this.handleOf(patch.sheet), patch.at, patch.count);
        meta.columns.splice(patch.at, patch.count);
        this.rebaseSheetCols(patch.sheet, (col) =>
          col < patch.at ? col : col < patch.at + patch.count ? null : col - patch.count,
        );
        return true;
      }
      case "moveColumns":
        return this.moveColumns(patch, changes);
      case "setColumn": {
        const meta = this.sheetMeta(patch.sheet);
        const column = meta.columns[patch.col];
        if (!column) return false;
        const next = { ...column, ...patch.patch };
        if (
          !Number.isFinite(next.width) ||
          next.width < 0 ||
          (next.key !== column.key && meta.columns.some((item) => item.key === next.key))
        ) {
          return false;
        }
        meta.columns[patch.col] = next;
        return true;
      }
      case "setRowMeta": {
        const sheet = this.sheetMeta(patch.sheet);
        if (!integerAt(patch.row) || patch.row >= sheet.rowCount) return false;
        if (
          patch.meta?.height !== undefined &&
          (!Number.isFinite(patch.meta.height) || patch.meta.height <= 0)
        ) {
          return false;
        }
        if (!sheet.rowHeights) sheet.rowHeights = new Map();
        if (!sheet.hiddenRows) sheet.hiddenRows = new Set();
        if (patch.meta?.height !== undefined) {
          sheet.rowHeights.set(patch.row, patch.meta.height);
        } else {
          sheet.rowHeights.delete(patch.row);
        }
        if (patch.meta?.hidden) sheet.hiddenRows.add(patch.row);
        else sheet.hiddenRows.delete(patch.row);
        this.view.metadataChanged(patch.sheet);
        return true;
      }
      case "setValidationRule": {
        const sheet = this.sheetMeta(patch.sheet);
        const rule = {
          ...patch.rule,
          range: normalizedRange(patch.rule.range),
          condition: cloneJsonValue(patch.rule.condition),
        };
        if (!validValidationRules(sheet, [rule]) || rule.range.sheet !== patch.sheet) return false;
        const rules = sheet.validationRules ?? [];
        const index = rules.findIndex((existing) => existing.id === rule.id);
        if (index < 0) sheet.validationRules = [...rules, rule];
        else {
          const next = [...rules];
          next[index] = rule;
          sheet.validationRules = next;
        }
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }
      case "removeValidationRule": {
        const sheet = this.sheetMeta(patch.sheet);
        const rules = sheet.validationRules ?? [];
        if (!rules.some((rule) => rule.id === patch.id)) return false;
        sheet.validationRules = rules.filter((rule) => rule.id !== patch.id);
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }
      case "setProtectedRange": {
        const sheet = this.sheetMeta(patch.sheet);
        const protectedRange = {
          ...patch.protectedRange,
          range: normalizedRange(patch.protectedRange.range),
        };
        if (
          protectedRange.range.sheet !== patch.sheet ||
          !validProtectedRanges(sheet, [protectedRange])
        ) {
          return false;
        }
        const ranges = sheet.protectedRanges ?? [];
        const index = ranges.findIndex((existing) => existing.id === protectedRange.id);
        if (index < 0) sheet.protectedRanges = [...ranges, protectedRange];
        else {
          const next = [...ranges];
          next[index] = protectedRange;
          sheet.protectedRanges = next;
        }
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }
      case "removeProtectedRange": {
        const sheet = this.sheetMeta(patch.sheet);
        const ranges = sheet.protectedRanges ?? [];
        if (!ranges.some((range) => range.id === patch.id)) return false;
        sheet.protectedRanges = ranges.filter((range) => range.id !== patch.id);
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }
      case "setNote": {
        if (!this.isCellInBounds(patch.addr)) return false;
        const sheet = this.sheetMeta(patch.addr.sheet);
        const notes = sheet.notes ?? [];
        const index = notes.findIndex(
          (note) => note.addr.row === patch.addr.row && note.addr.col === patch.addr.col,
        );
        if (patch.text === null || patch.text.length === 0) {
          if (index < 0) return false;
          sheet.notes = [...notes.slice(0, index), ...notes.slice(index + 1)];
        } else if (index < 0) {
          sheet.notes = [...notes, { addr: { ...patch.addr }, text: patch.text }];
        } else {
          const next = [...notes];
          next[index] = { addr: { ...patch.addr }, text: patch.text };
          sheet.notes = next;
        }
        return true;
      }
      case "addMerge": {
        const sheet = this.sheetMeta(patch.sheet);
        const merge = normalizeMerge(patch.merge);
        if (!validMerge(sheet, merge) || mergeCrossesFreeze(sheet, merge)) return false;
        const merges = sheet.merges ?? [];
        if (merges.some((existing) => mergesOverlap(existing, merge))) return false;
        sheet.merges = [...merges, merge];
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }
      case "removeMerge": {
        const sheet = this.sheetMeta(patch.sheet);
        const merge = normalizeMerge(patch.merge);
        const merges = sheet.merges ?? [];
        const index = merges.findIndex((existing) => sameMerge(existing, merge));
        if (index < 0) return false;
        sheet.merges = [...merges.slice(0, index), ...merges.slice(index + 1)];
        this.spillBlockersDirty.add(patch.sheet);
        return true;
      }
      case "addSheet":
        return this.addSheetSnapshot(patch.sheet, changes);
      case "removeSheet":
        return this.removeSheetSnapshot(patch.sheet, changes);
      case "renameSheet": {
        const sheet = this.workbook.sheets.find((candidate) => candidate.id === patch.sheet);
        if (!sheet || !patch.name.trim()) return false;
        if (!this.renameSheetFormulaIdentity(patch.sheet, patch.name)) return false;
        sheet.name = patch.name;
        return true;
      }
      case "moveSheet": {
        const from = this.workbook.sheets.findIndex((sheet) => sheet.id === patch.sheet);
        if (from < 0 || !integerAt(patch.to) || patch.to >= this.workbook.sheets.length)
          return false;
        const [sheet] = this.workbook.sheets.splice(from, 1);
        this.workbook.sheets.splice(patch.to, 0, sheet!);
        return true;
      }
      case "setSheetMeta": {
        const sheet = this.sheetMeta(patch.sheet);
        if (
          patch.patch.frozenRows !== undefined &&
          (!integerAt(patch.patch.frozenRows) || patch.patch.frozenRows > sheet.rowCount)
        ) {
          return false;
        }
        if (
          patch.patch.frozenCols !== undefined &&
          (!integerAt(patch.patch.frozenCols) || patch.patch.frozenCols > sheet.columns.length)
        ) {
          return false;
        }
        if (
          patch.patch.rowGroups?.some(
            (group) =>
              !integerAt(group.start) ||
              !integerAt(group.end) ||
              group.start > group.end ||
              group.end >= sheet.rowCount,
          ) ||
          (patch.patch.conditionalFormats !== undefined &&
            !validConditionalRules(sheet, patch.patch.conditionalFormats)) ||
          (patch.patch.sortKeys !== undefined &&
            !validSortAndFilters(sheet, patch.patch.sortKeys, patch.patch.filters ?? [])) ||
          (patch.patch.filters !== undefined &&
            !validSortAndFilters(sheet, patch.patch.sortKeys ?? [], patch.patch.filters))
        ) {
          return false;
        }
        if (patch.patch.frozenRows !== undefined) sheet.frozenRows = patch.patch.frozenRows;
        if (patch.patch.frozenCols !== undefined) sheet.frozenCols = patch.patch.frozenCols;
        if (patch.patch.conditionalFormats !== undefined) {
          sheet.conditionalFormats = patch.patch.conditionalFormats;
          this.windowReader.conditionalRulesChanged(patch.sheet);
        }
        if (patch.patch.rowGroups !== undefined) {
          sheet.rowGroups = patch.patch.rowGroups.map((group) => ({ ...group }));
          this.view.metadataChanged(patch.sheet);
        }
        if (patch.patch.sortKeys !== undefined || patch.patch.filters !== undefined) {
          if (patch.patch.sortKeys !== undefined) {
            sheet.sortKeys = patch.patch.sortKeys.map((key) => ({ ...key }));
          }
          if (patch.patch.filters !== undefined) {
            sheet.filters = patch.patch.filters.map(([col, filter]) => [
              col,
              cloneJsonValue(filter),
            ]);
          }
          this.view.metadataChanged(patch.sheet);
        }
        return true;
      }
      case "setNamedRange": {
        if (
          !this.workbook.sheets.some((sheet) => sheet.id === patch.namedRange.range.sheet) ||
          (patch.namedRange.scope !== undefined &&
            !this.workbook.sheets.some((sheet) => sheet.id === patch.namedRange.scope))
        ) {
          return false;
        }
        const namedRange = {
          ...patch.namedRange,
          range: normalizedRange(patch.namedRange.range),
        };
        if (!this.syncNamedRange(namedRange)) return false;
        const ranges = this.workbook.namedRanges ?? [];
        const index = ranges.findIndex((range) =>
          this.sameNamedRange(range, namedRange.name, namedRange.scope),
        );
        if (index < 0) this.workbook.namedRanges = [...ranges, namedRange];
        else {
          const next = [...ranges];
          next[index] = namedRange;
          this.workbook.namedRanges = next;
        }
        return true;
      }
      case "removeNamedRange": {
        const ranges = this.workbook.namedRanges ?? [];
        if (!ranges.some((range) => this.sameNamedRange(range, patch.name, patch.scope))) {
          return false;
        }
        if (!this.wasm.removeNamedRange(patch.name, this.namedRangeScope(patch.scope)))
          return false;
        this.workbook.namedRanges = ranges.filter(
          (range) => !this.sameNamedRange(range, patch.name, patch.scope),
        );
        return true;
      }
    }
  }

  private snapshotCells(
    sheet: SheetId,
    rowStart: number,
    rowEnd: number,
    colStart: number,
    colEnd: number,
  ): Array<Extract<DocumentOp, { op: "set" }>> {
    const rows = rowEnd - rowStart;
    const cols = colEnd - colStart;
    const sources = this.captureSourceProjection(sheet, rowStart, colStart, rows, cols);
    const columns = Array.from({ length: cols }, (_, offset) => colStart + offset);
    const window = this.windowReader.read(
      sheet,
      { start: rowStart, end: rowEnd },
      columns,
      undefined,
      false,
    );
    const patches: Array<Extract<DocumentOp, { op: "set" }>> = [];
    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const addr = { sheet, row, col };
        const offset = (row - rowStart) * cols + col - colStart;
        const style = window.styles[window.styleIds[offset] ?? 0] ?? {};
        const formula = sources?.formulaAt(offset);
        const target = sources?.referenceAt(offset);
        const value: CellValue = formula
          ? { kind: "formula", src: formula }
          : target
            ? { kind: "ref", target }
            : { kind: "literal", value: window.values[offset] ?? null };
        if (value.kind === "literal" && value.value === null && Object.keys(style).length === 0) {
          continue;
        }
        patches.push({ op: "set", addr, value, style });
      }
    }
    return patches;
  }

  private moveRows(
    patch: Extract<DocumentOp, { op: "moveRows" }>,
    changes: ChangeEvent["changes"] | null,
  ): boolean {
    const sheet = this.sheetMeta(patch.sheet);
    if (
      !integerAt(patch.from) ||
      !integerAt(patch.to) ||
      !positiveCount(patch.count) ||
      patch.from + patch.count > sheet.rowCount ||
      patch.to > sheet.rowCount - patch.count
    ) {
      return false;
    }
    if (patch.from === patch.to) return true;
    const movedNamedRanges = (this.workbook.namedRanges ?? [])
      .filter((namedRange) => namedRange.range.sheet === patch.sheet)
      .map((namedRange) => structuredClone(namedRange));
    const movedValidationRules = cloneJsonValue(sheet.validationRules) ?? [];
    const movedProtectedRanges = cloneJsonValue(sheet.protectedRanges) ?? [];
    const movedNotes = cloneJsonValue(sheet.notes) ?? [];
    const cells = this.snapshotCells(
      patch.sheet,
      patch.from,
      patch.from + patch.count,
      0,
      sheet.columns.length,
    );
    const rowMeta = Array.from({ length: patch.count }, (_, offset) => {
      const row = patch.from + offset;
      const height = sheet.rowHeights?.get(row);
      const hidden = sheet.hiddenRows?.has(row) ?? false;
      return height === undefined && !hidden ? null : { height, hidden };
    });
    if (
      !this.applyPatch(
        { op: "removeRows", sheet: patch.sheet, at: patch.from, count: patch.count },
        changes,
      ) ||
      !this.applyPatch(
        { op: "addRows", sheet: patch.sheet, at: patch.to, count: patch.count },
        changes,
      )
    ) {
      return false;
    }
    if (
      cells.length > 0 &&
      !this.applyPatch(
        {
          op: "setRange",
          range: {
            sheet: patch.sheet,
            start: { row: patch.to, col: 0 },
            end: { row: patch.to + patch.count - 1, col: sheet.columns.length - 1 },
          },
          cells: cells.map((cell) => ({
            rowOffset: cell.addr.row - patch.from,
            colOffset: cell.addr.col,
            value: cell.value,
            style: cell.style,
          })),
        },
        changes,
      )
    ) {
      return false;
    }
    for (let offset = 0; offset < rowMeta.length; offset++) {
      const meta = rowMeta[offset];
      if (meta) {
        this.applyPatch(
          { op: "setRowMeta", sheet: patch.sheet, row: patch.to + offset, meta },
          changes,
        );
      }
    }
    const moveRow = (row: number) => moveIndex(row, patch.from, patch.count, patch.to);
    sheet.validationRules = movedValidationRules
      .map((rule) => rebaseRangeRows(rule, patch.sheet, moveRow))
      .filter((rule): rule is DataValidationRule => rule !== null);
    sheet.protectedRanges = movedProtectedRanges
      .map((protectedRange) => rebaseRangeRows(protectedRange, patch.sheet, moveRow))
      .filter((protectedRange): protectedRange is ProtectedRange => protectedRange !== null);
    sheet.notes = movedNotes.map((note) => ({
      ...note,
      addr: { ...note.addr, row: moveRow(note.addr.row) },
    }));
    for (const original of movedNamedRanges) {
      const span = remapSpan(original.range.start.row, original.range.end.row, (row) =>
        moveIndex(row, patch.from, patch.count, patch.to),
      );
      if (!span) continue;
      const namedRange: NamedRangeSnapshot = {
        ...original,
        range: {
          ...original.range,
          start: { ...original.range.start, row: span[0] },
          end: { ...original.range.end, row: span[1] },
        },
      };
      const ranges = this.workbook.namedRanges ?? [];
      const index = ranges.findIndex((range) =>
        this.sameNamedRange(range, namedRange.name, namedRange.scope),
      );
      if (index < 0) this.workbook.namedRanges = [...ranges, namedRange];
      else ranges[index] = namedRange;
      if (!this.syncNamedRange(namedRange)) return false;
    }
    return true;
  }

  private moveColumns(
    patch: Extract<DocumentOp, { op: "moveColumns" }>,
    changes: ChangeEvent["changes"] | null,
  ): boolean {
    const sheet = this.sheetMeta(patch.sheet);
    if (
      !integerAt(patch.from) ||
      !integerAt(patch.to) ||
      !positiveCount(patch.count) ||
      patch.from + patch.count > sheet.columns.length ||
      patch.to > sheet.columns.length - patch.count
    ) {
      return false;
    }
    if (patch.from === patch.to) return true;
    const movedNamedRanges = (this.workbook.namedRanges ?? [])
      .filter((namedRange) => namedRange.range.sheet === patch.sheet)
      .map((namedRange) => structuredClone(namedRange));
    const movedValidationRules = cloneJsonValue(sheet.validationRules) ?? [];
    const movedProtectedRanges = cloneJsonValue(sheet.protectedRanges) ?? [];
    const movedNotes = cloneJsonValue(sheet.notes) ?? [];
    const columns = sheet.columns.slice(patch.from, patch.from + patch.count);
    const cells = this.snapshotCells(
      patch.sheet,
      0,
      sheet.rowCount,
      patch.from,
      patch.from + patch.count,
    );
    if (
      !this.applyPatch(
        { op: "removeColumns", sheet: patch.sheet, at: patch.from, count: patch.count },
        changes,
      ) ||
      !this.applyPatch({ op: "addColumns", sheet: patch.sheet, at: patch.to, columns }, changes)
    ) {
      return false;
    }
    if (
      cells.length > 0 &&
      !this.applyPatch(
        {
          op: "setRange",
          range: {
            sheet: patch.sheet,
            start: { row: 0, col: patch.to },
            end: { row: sheet.rowCount - 1, col: patch.to + patch.count - 1 },
          },
          cells: cells.map((cell) => ({
            rowOffset: cell.addr.row,
            colOffset: cell.addr.col - patch.from,
            value: cell.value,
            style: cell.style,
          })),
        },
        changes,
      )
    ) {
      return false;
    }
    const moveCol = (col: number) => moveIndex(col, patch.from, patch.count, patch.to);
    sheet.validationRules = movedValidationRules
      .map((rule) => rebaseRangeCols(rule, patch.sheet, moveCol))
      .filter((rule): rule is DataValidationRule => rule !== null);
    sheet.protectedRanges = movedProtectedRanges
      .map((protectedRange) => rebaseRangeCols(protectedRange, patch.sheet, moveCol))
      .filter((protectedRange): protectedRange is ProtectedRange => protectedRange !== null);
    sheet.notes = movedNotes.map((note) => ({
      ...note,
      addr: { ...note.addr, col: moveCol(note.addr.col) },
    }));
    for (const original of movedNamedRanges) {
      const span = remapSpan(original.range.start.col, original.range.end.col, (col) =>
        moveIndex(col, patch.from, patch.count, patch.to),
      );
      if (!span) continue;
      const namedRange: NamedRangeSnapshot = {
        ...original,
        range: {
          ...original.range,
          start: { ...original.range.start, col: span[0] },
          end: { ...original.range.end, col: span[1] },
        },
      };
      const ranges = this.workbook.namedRanges ?? [];
      const index = ranges.findIndex((range) =>
        this.sameNamedRange(range, namedRange.name, namedRange.scope),
      );
      if (index < 0) this.workbook.namedRanges = [...ranges, namedRange];
      else ranges[index] = namedRange;
      if (!this.syncNamedRange(namedRange)) return false;
    }
    return true;
  }

  private addSheetSnapshot(
    snapshot: SheetSnapshot,
    changes: ChangeEvent["changes"] | null,
  ): boolean {
    if (!canAddSheetSnapshot(snapshot, this.workbook.sheets)) return false;
    const merges = snapshot.merges?.map(normalizeMerge) ?? [];
    const handle = this.allocateSheet(snapshot.columns.length, snapshot.rowCount);
    this.wasm.setSheetName(handle, snapshot.id, snapshot.name);
    this.handles.set(snapshot.id, handle);
    this.sheetIdsByHandle[handle] = snapshot.id;
    const sheet: Sheet = {
      id: snapshot.id,
      name: snapshot.name,
      visibility: snapshot.visibility,
      rowCount: snapshot.rowCount,
      columns: snapshot.columns.map((column) => ({ ...column })),
      frozenRows: snapshot.frozenRows,
      frozenCols: snapshot.frozenCols,
      merges,
      conditionalFormats: snapshot.conditionalFormats?.map((rule) => ({ ...rule })),
      validationRules: cloneJsonValue(snapshot.validationRules),
      protectedRanges: cloneJsonValue(snapshot.protectedRanges),
      notes: cloneJsonValue(snapshot.notes),
      sortKeys: cloneJsonValue(snapshot.sortKeys),
      filters: cloneJsonValue(snapshot.filters),
      rowGroups: snapshot.rowGroups?.map((group) => ({ ...group })),
      rowHeights: new Map(),
      hiddenRows: new Set(),
    };
    for (const [row, meta] of snapshot.rowMeta ?? []) {
      if (meta.height !== undefined) sheet.rowHeights!.set(row, meta.height);
      if (meta.hidden) sheet.hiddenRows!.add(row);
    }
    this.workbook.sheets.splice(snapshot.order, 0, sheet);
    for (const block of snapshot.cells) {
      if (
        !this.applyPatch(
          {
            op: "setRange",
            range: {
              sheet: snapshot.id,
              start: { row: block.startRow, col: block.startCol },
              end: {
                row: block.startRow + block.rowCount - 1,
                col: block.startCol + block.colCount - 1,
              },
            },
            cells: block.cells,
          },
          changes,
        )
      ) {
        return false;
      }
    }
    this.windowReader.conditionalRulesChanged(snapshot.id);
    return true;
  }

  private removeSheetSnapshot(sheetId: SheetId, changes: ChangeEvent["changes"] | null): boolean {
    const index = this.workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
    if (index < 0 || this.workbook.sheets.length <= 1) return false;
    if (!this.removeSheetFormulaIdentity(sheetId)) return false;
    this.handles.delete(sheetId);
    this.view.removeSheet(sheetId);
    this.windowReader.removeSheet(sheetId);
    this.workbook.sheets.splice(index, 1);
    if (this.workbook.activeSheet === sheetId) {
      this.workbook.activeSheet =
        this.workbook.sheets[Math.min(index, this.workbook.sheets.length - 1)]!.id;
    }
    this.workbook.namedRanges = this.workbook.namedRanges?.filter(
      (range) => range.range.sheet !== sheetId && range.scope !== sheetId,
    );
    return true;
  }

  private rebaseSheetRows(sheet: SheetId, remap: (row: number) => number | null): void {
    const meta = this.sheetMeta(sheet);
    if (meta.rowHeights) {
      const next = new Map<number, number>();
      for (const [row, height] of meta.rowHeights) {
        const mapped = remap(row);
        if (mapped !== null) next.set(mapped, height);
      }
      meta.rowHeights = next;
    }
    if (meta.hiddenRows) {
      const next = new Set<number>();
      for (const row of meta.hiddenRows) {
        const mapped = remap(row);
        if (mapped !== null) next.add(mapped);
      }
      meta.hiddenRows = next;
    }
    meta.rowGroups = meta.rowGroups
      ?.map((group) => {
        const span = remapSpan(group.start, group.end, remap);
        return span ? { ...group, start: span[0], end: span[1] } : null;
      })
      .filter((group): group is RowGroup => group !== null);
    meta.merges = meta.merges
      ?.map((merge) => {
        const span = remapSpan(merge.r0, merge.r1, remap);
        return span ? { ...merge, r0: span[0], r1: span[1] } : null;
      })
      .filter((merge): merge is MergeRange => merge !== null);
    meta.conditionalFormats = meta.conditionalFormats
      ?.map((rule) => {
        if (rule.range.sheet !== sheet) return rule;
        const span = remapSpan(rule.range.start.row, rule.range.end.row, remap);
        return span
          ? {
              ...rule,
              range: {
                ...rule.range,
                start: { ...rule.range.start, row: span[0] },
                end: { ...rule.range.end, row: span[1] },
              },
            }
          : null;
      })
      .filter((rule): rule is ConditionalFormatRule => rule !== null);
    meta.validationRules = meta.validationRules
      ?.map((rule) => rebaseRangeRows(rule, sheet, remap))
      .filter((rule): rule is DataValidationRule => rule !== null);
    meta.protectedRanges = meta.protectedRanges
      ?.map((protectedRange) => rebaseRangeRows(protectedRange, sheet, remap))
      .filter((protectedRange): protectedRange is ProtectedRange => protectedRange !== null);
    meta.notes = meta.notes
      ?.map((note) => {
        if (note.addr.sheet !== sheet) return note;
        const row = remap(note.addr.row);
        return row === null ? null : { ...note, addr: { ...note.addr, row } };
      })
      .filter((note): note is NonNullable<Sheet["notes"]>[number] => note !== null);
    if (meta.frozenRows) {
      const boundary = remapSpan(0, meta.frozenRows - 1, remap);
      meta.frozenRows = boundary ? boundary[1] + 1 : 0;
    }
    this.workbook.namedRanges = this.workbook.namedRanges
      ?.map((namedRange) => {
        if (namedRange.range.sheet !== sheet) return namedRange;
        const span = remapSpan(namedRange.range.start.row, namedRange.range.end.row, remap);
        return span
          ? {
              ...namedRange,
              range: {
                ...namedRange.range,
                start: { ...namedRange.range.start, row: span[0] },
                end: { ...namedRange.range.end, row: span[1] },
              },
            }
          : null;
      })
      .filter((range): range is NonNullable<Workbook["namedRanges"]>[number] => range !== null);
    this.view.rowsChanged(sheet);
  }

  private rebaseSheetCols(sheet: SheetId, remap: (col: number) => number | null): void {
    const meta = this.sheetMeta(sheet);
    meta.merges = meta.merges
      ?.map((merge) => {
        const span = remapSpan(merge.c0, merge.c1, remap);
        return span ? { ...merge, c0: span[0], c1: span[1] } : null;
      })
      .filter((merge): merge is MergeRange => merge !== null);
    meta.conditionalFormats = meta.conditionalFormats
      ?.map((rule) => {
        if (rule.range.sheet !== sheet) return rule;
        const span = remapSpan(rule.range.start.col, rule.range.end.col, remap);
        return span
          ? {
              ...rule,
              range: {
                ...rule.range,
                start: { ...rule.range.start, col: span[0] },
                end: { ...rule.range.end, col: span[1] },
              },
            }
          : null;
      })
      .filter((rule): rule is ConditionalFormatRule => rule !== null);
    meta.validationRules = meta.validationRules
      ?.map((rule) => rebaseRangeCols(rule, sheet, remap))
      .filter((rule): rule is DataValidationRule => rule !== null);
    meta.protectedRanges = meta.protectedRanges
      ?.map((protectedRange) => rebaseRangeCols(protectedRange, sheet, remap))
      .filter((protectedRange): protectedRange is ProtectedRange => protectedRange !== null);
    meta.notes = meta.notes
      ?.map((note) => {
        if (note.addr.sheet !== sheet) return note;
        const col = remap(note.addr.col);
        return col === null ? null : { ...note, addr: { ...note.addr, col } };
      })
      .filter((note): note is NonNullable<Sheet["notes"]>[number] => note !== null);
    if (meta.frozenCols) {
      const boundary = remapSpan(0, meta.frozenCols - 1, remap);
      meta.frozenCols = boundary ? boundary[1] + 1 : 0;
    }
    this.workbook.namedRanges = this.workbook.namedRanges
      ?.map((namedRange) => {
        if (namedRange.range.sheet !== sheet) return namedRange;
        const span = remapSpan(namedRange.range.start.col, namedRange.range.end.col, remap);
        return span
          ? {
              ...namedRange,
              range: {
                ...namedRange.range,
                start: { ...namedRange.range.start, col: span[0] },
                end: { ...namedRange.range.end, col: span[1] },
              },
            }
          : null;
      })
      .filter((range): range is NonNullable<Workbook["namedRanges"]>[number] => range !== null);
    this.view.columnsChanged(sheet);
  }

  private acknowledgedSetStillMatches(
    addr: CellAddress,
    value: CellValue,
    style: CellStyle | undefined,
    sources?: RangeSourceProjection | null,
    sourceOffset = 0,
  ): boolean {
    const current = this.getCell(addr);
    if (this.styles.intern(current.style) !== this.styles.intern(style)) return false;
    const formula =
      sources === undefined ? this.getFormula(addr) : sources?.formulaAt(sourceOffset);
    const target =
      sources === undefined ? this.getRefTarget(addr) : sources?.referenceAt(sourceOffset);
    if (value.kind === "formula") return formula === value.src;
    if (value.kind === "ref") {
      return (
        target?.sheet === value.target.sheet &&
        target.row === value.target.row &&
        target.col === value.target.col
      );
    }
    return formula == null && target == null && Object.is(current.resolved, value.value);
  }

  acknowledgeOperations(operations: readonly DocumentOp[], storageRevision?: bigint): void {
    if (storageRevision !== undefined && storageRevision !== 0n) {
      this.wasm.acknowledgeRevision(storageRevision);
      return;
    }
    for (const operation of operations) {
      if (operation.op === "set") {
        if (!this.acknowledgedSetStillMatches(operation.addr, operation.value, operation.style)) {
          continue;
        }
        this.wasm.markRangeClean(
          this.handleOf(operation.addr.sheet),
          operation.addr.row,
          operation.addr.row + 1,
          operation.addr.col,
          operation.addr.col + 1,
        );
      } else if (operation.op === "setRange") {
        const range = normalizedRange(operation.range);
        const rows = range.end.row - range.start.row + 1;
        const cols = range.end.col - range.start.col + 1;
        const sources = this.captureSourceProjection(
          range.sheet,
          range.start.row,
          range.start.col,
          rows,
          cols,
        );
        for (const cell of operation.cells) {
          const row = range.start.row + cell.rowOffset;
          const col = range.start.col + cell.colOffset;
          if (
            !this.acknowledgedSetStillMatches(
              { sheet: range.sheet, row, col },
              cell.value,
              cell.style,
              sources,
              cell.rowOffset * cols + cell.colOffset,
            )
          ) {
            continue;
          }
          this.wasm.markRangeClean(this.handleOf(range.sheet), row, row + 1, col, col + 1);
        }
      } else if (
        operation.op === "setBlock" ||
        operation.op === "setRangeStyle" ||
        operation.op === "clearRange"
      ) {
        const range = normalizedRange(operation.range);
        this.wasm.markRangeClean(
          this.handleOf(range.sheet),
          range.start.row,
          range.end.row + 1,
          range.start.col,
          range.end.col + 1,
        );
      }
    }
  }

  exportSnapshot(
    documentId: string | undefined,
    documentVersion: number | undefined,
  ): WorkbookSnapshot {
    for (const sheet of this.workbook.sheets) {
      this.requireCompleteQuery(sheet.id);
    }
    return this.snapshotCodec.encode(documentId, documentVersion);
  }

  /** Rewrite resolved formula sheet identity without changing the stable WASM handle. */
  renameSheetFormulaIdentity(sheet: SheetId, name: string): boolean {
    const handle = this.handleOf(sheet);
    if (!this.wasm.renameSheet(handle, sheet, name)) return false;
    return true;
  }

  /** Tombstone a stable WASM handle and rewrite surviving formulas to `#REF!`. */
  removeSheetFormulaIdentity(sheet: SheetId): boolean {
    const handle = this.handleOf(sheet);
    if (!this.wasm.removeSheet(handle)) return false;
    return true;
  }

  /** Bulk-load one mixed datasource page in one Rust-owned source transaction. */
  loadRows(
    sheet: SheetId,
    start: number,
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    if (rows.length === 0) return;
    const meta = this.sheetMeta(sheet);
    const rowCount = Math.min(rows.length, Math.max(0, meta.rowCount - start));
    if (rowCount === 0) return;
    const colCount = meta.columns.length;
    const cells: Array<{ offset: number; value: CellValue; style?: CellStyle }> = [];
    const address: CellAddress = { sheet, row: start, col: 0 };
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
      address.row = start + rowOffset;
      const row = rows[rowOffset]!;
      for (let col = 0; col < colCount; col++) {
        address.col = col;
        if (protect?.(address)) continue;
        const column = meta.columns[col]!;
        const dataCell = row[column.key];
        const wrapped =
          dataCell && typeof dataCell === "object" && !("kind" in dataCell) && "value" in dataCell
            ? dataCell
            : undefined;
        const source = dataCellValue(dataCell);
        const value: CellValue =
          source && typeof source === "object"
            ? source
            : {
                kind: "literal",
                value:
                  column.type === "number" || column.type === "currency"
                    ? toNumber(dataCell)
                    : toText(dataCell),
              };
        cells.push({ offset: rowOffset * colCount + col, value, style: wrapped?.style });
      }
    }

    const bounds: Range = {
      sheet,
      start: { row: start, col: 0 },
      end: { row: start + rowCount - 1, col: colCount - 1 },
    };
    let accepted = false;
    this.wasm.beginPageLoad();
    try {
      accepted = this.writeSparseBlock(bounds, cells);
    } finally {
      this.boundaryAccounting.record(this.resourceOperation ?? "ingest", "js-to-wasm", 0, "scalar");
      this.wasm.endPageLoad();
      this.resourceOperation = previousOperation;
    }
    if (!accepted) throw new Error("datasource page contains invalid persisted sources");
    this.noteRangeMutationFfi();
    this.wasm.recomputeChanged();
  }

  hydrateSnapshot(snapshot: WorkbookSnapshot): void {
    let accepted = true;
    this.wasm.beginPageLoad();
    try {
      for (const sourceSheet of snapshot.sheets) {
        for (const block of sourceSheet.cells) {
          const bounds: Range = {
            sheet: sourceSheet.id,
            start: { row: block.startRow, col: block.startCol },
            end: {
              row: block.startRow + block.rowCount - 1,
              col: block.startCol + block.colCount - 1,
            },
          };
          const cells = block.cells.map((cell) => ({
            offset: cell.rowOffset * block.colCount + cell.colOffset,
            value: cell.value,
            style: cell.style,
          }));
          if (!this.writeSparseBlock(bounds, cells)) {
            accepted = false;
            break;
          }
        }
        if (!accepted) break;
        this.windowReader.conditionalRulesChanged(sourceSheet.id);
      }
    } finally {
      this.wasm.endPageLoad();
    }
    if (!accepted) throw new Error("snapshot hydration contains invalid persisted sources");
    this.noteRangeMutationFfi();
    this.wasm.recomputeChanged();
  }

  /** Release the WASM-side cell store immediately; the store is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    const committed = this.wasm.wasmCommittedBytes();
    this.committedBytesAfterDispose = committed > 0 ? committed : null;
    this.boundaryAccounting.record("teardown", "js-to-wasm", 0, "scalar");
    this.view.dispose();
    this.windowReader.clear();
    this.styles.clear();
    this.refs.clear();
    this.formulaSrc.clear();
    this.handles.clear();
    this.wasm.free();
    this.disposed = true;
  }

  private loadColumnar(sheet: SheetId, data: ColumnarData): void {
    const columns = this.sheetMeta(sheet).columns;
    const rowCount = Math.min(data.rowCount, this.sheetMeta(sheet).rowCount);
    if (rowCount === 0 || columns.length === 0) return;
    const colCount = columns.length;
    const values: CellScalar[] = new Array(rowCount * colCount);
    const formulas: Array<[number, string]> = [];
    const refs: Array<[number, CellAddress]> = [];
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < colCount; col++) {
        const offset = row * colCount + col;
        const column = columns[col]!;
        const source = data.columns[column.key];
        const parsed = columnarScalar(source?.[row], column.type);
        if (parsed && typeof parsed === "object") {
          values[offset] = parsed.kind === "literal" ? parsed.value : null;
          if (parsed.kind === "formula") formulas.push([offset, parsed.src]);
          else if (parsed.kind === "ref") refs.push([offset, parsed.target]);
        } else {
          values[offset] = parsed ?? null;
        }
      }
    }
    const bounds: Range = {
      sheet,
      start: { row: 0, col: 0 },
      end: { row: rowCount - 1, col: colCount - 1 },
    };
    if (
      !this.writePackedBlock(bounds, {
        rowCount,
        colCount,
        values,
        formulas: formulas.length === 0 ? undefined : formulas,
        refs: refs.length === 0 ? undefined : refs,
      })
    ) {
      throw new Error("columnar import contains invalid persisted sources");
    }
    this.noteRangeMutationFfi();
    this.wasm.recomputeChanged();
  }
}

function dataCellValue(value: DataCell | undefined): CellScalar | CellValue | undefined {
  if (value && typeof value === "object" && !("kind" in value) && "value" in value) {
    return value.value;
  }
  return value;
}

function columnarScalar(
  value: CellScalar | CellValue | undefined,
  type: CellFormat,
): CellScalar | CellValue | undefined {
  const unwrapped = dataCellValue(value);
  if (unwrapped && typeof unwrapped === "object" && unwrapped.kind === "literal") {
    return columnarScalar(unwrapped.value, type);
  }
  return typeof unwrapped === "string" ? parseCellLiteralInput(unwrapped, type) : unwrapped;
}

/** Allocation-free byte count matching wasm-bindgen's UTF-8 string copy. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function toNumber(value: DataCell | undefined): number {
  const unwrapped = dataCellValue(value);
  if (typeof unwrapped === "number") return unwrapped;
  if (typeof unwrapped === "string") {
    const n = Number(unwrapped);
    return Number.isFinite(n) ? n : Number.NaN;
  }
  if (unwrapped && typeof unwrapped === "object" && unwrapped.kind === "literal") {
    return toNumber(unwrapped.value);
  }
  return Number.NaN;
}

function toText(value: DataCell | undefined): string {
  const unwrapped = dataCellValue(value);
  if (typeof unwrapped === "string") return unwrapped;
  if (typeof unwrapped === "number") return String(unwrapped);
  if (unwrapped && typeof unwrapped === "object" && unwrapped.kind === "literal") {
    return toText(unwrapped.value);
  }
  return "";
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
