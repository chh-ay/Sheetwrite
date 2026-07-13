import { CellStore, isLoaded, type RangeSnapshot, type WindowView } from "@sheetwrite/wasm";
import { dateToSerial } from "./date-serial.js";
import {
  SnapshotValidationError,
  validateWorkbookSnapshot,
  WORKBOOK_SCHEMA_VERSION,
} from "./document-protocol.js";
import { cellKey, type LiteralLookup, parseCellKey, ReferenceGraph } from "./reference.js";
import { StyleDictionary } from "./style-dictionary.js";
import type {
  AggregateOp,
  ApplyTransactionResult,
  CellAddress,
  CellLoadState,
  CellScalar,
  CellStyle,
  CellValue,
  ChangeEvent,
  Column,
  ColumnarData,
  ColumnFilter,
  CommitReason,
  ConditionalFormatRule,
  DataCell,
  DataValidationRule,
  DocumentOp,
  MergeRange,
  MutationIssue,
  MutationPolicyMode,
  NamedRangeSnapshot,
  PackedCellBlock,
  PagedStoreStats,
  ProtectedRange,
  ProtectionResolver,
  QueryCapability,
  Range,
  ResolvedCell,
  RowData,
  RowGroup,
  Sheet,
  SheetId,
  SheetSnapshot,
  SnapshotCell,
  SortKey,
  Store,
  Transaction,
  TransactionApplicationOptions,
  VisibleWindowView,
  Workbook,
  WorkbookSnapshot,
} from "./types.js";

// Mirror of the WASM cell tags.
const KIND_NUMBER = 1;
const KIND_STRING = 2;
const KIND_BOOL = 3;
const KIND_FORMULA = 4;

const AGG_OP: Record<AggregateOp, number> = { sum: 0, avg: 1, min: 2, max: 3, count: 4 };

/** Shared empty bitmask for rule-free windows; skips one boundary call. */
const EMPTY_COND_MATCHES = new Uint32Array(0);

/**
 * Hard cap on the pool-id→string cache. A full-sheet sweep would otherwise grow
 * it to O(distinct strings) — at ~1M unique strings that duplicates the entire
 * WASM string pool on the JS heap. At the cap we drop the cache wholesale; the
 * current window re-warms from `poolStrings` below, so the reset is cheap and
 * self-healing.
 */
const STRING_CACHE_CAP = 65_536;

/**
 * Above this cell count a render window is a one-off bulk read (export, search,
 * xlsx) rather than a repainted viewport. Reusing the scratch across such reads
 * would pin an O(cells) buffer forever, so past the threshold we drop our
 * reference and let the buffer die with the caller's view (see `windowValuesFor`).
 */
const WINDOW_SCRATCH_MAX_REUSE = 65_536;
const DEFAULT_PAGED_CACHE_BYTES = 32 * 1024 * 1024;

type ChangeListener = (event: ChangeEvent) => void;

type RecomputingCellStore = CellStore & {
  recompute(sheet: number): void;
  setSheetName(sheet: number, id: string, name: string): void;
  renameSheet(sheet: number, id: string, name: string): boolean;
  removeSheet(sheet: number): boolean;
  isSheetAlive(sheet: number): boolean;
  insertCols(sheet: number, at: number, count: number): void;
  formulaSource(sheet: number, row: number, col: number): string | undefined;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  recomputeVolatile(serial: number): void;
  setNamedRange(
    name: string,
    scope: number,
    sheet: number,
    rowStart: number,
    colStart: number,
    rowEnd: number,
    colEnd: number,
  ): boolean;
  removeNamedRange(name: string, scope: number): boolean;
  setColumnStringsPacked(
    sheet: number,
    col: number,
    startRow: number,
    buf: string,
    utf16Lens: Uint32Array,
    style: number,
  ): void;
  removeCols(sheet: number, at: number, count: number): void;
  poolStrings(ids: Uint32Array): string[];
  styleIdAt(sheet: number, row: number, col: number): number;
  setConditionalRules(
    sheet: number,
    kinds: Uint8Array,
    bounds: Uint32Array,
    nums: Float64Array,
    strs: string[],
    flags: Uint8Array,
  ): void;
  setBlock(
    sheet: number,
    startRow: number,
    startCol: number,
    rows: number,
    cols: number,
    kinds: Uint8Array,
    numbers: Float64Array,
    texts: string[],
    styles: Uint32Array,
  ): boolean;
  clearRange(
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    contents: boolean,
    style: boolean,
  ): boolean;
  rangeStyleIds(sheet: number, r0: number, c0: number, r1: number, c1: number): Uint32Array;
  remapRangeStyles(
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    oldIds: Uint32Array,
    newIds: Uint32Array,
  ): boolean;
  captureRange(
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ): RangeSnapshot | undefined;
  snapshotNumbers(snapshot: RangeSnapshot): Float64Array;
  snapshotTexts(snapshot: RangeSnapshot): string[];
  restoreRange(sheet: number, r0: number, c0: number, snapshot: RangeSnapshot): boolean;
  addPagedSheet(columns: number, rows: number, chunkRows: number, byteBudget: number): number;
  isPaged(sheet: number): boolean;
  pagedStats(sheet: number): Float64Array;
  cellState(sheet: number, row: number, col: number): number;
  isFullyLoaded(sheet: number): boolean;
  rangeFullyLoaded(sheet: number, r0: number, c0: number, r1: number, c1: number): boolean;
  pinRange(sheet: number, startRow: number, endRow: number, cols: Uint32Array): void;
  beginPageLoad(): void;
  endPageLoad(): void;
  markRangeClean(
    sheet: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): void;
};

type ConsumingWindowView = WindowView & {
  takeKinds(): Uint8Array;
  takeNumbers(): Float64Array;
  takeStringIndex(): Int32Array;
  takeStringIds(): Uint32Array;
  takeStyleIndex(): Uint32Array;
  takeStyleDict(): Uint32Array;
  takeStrings(): string[];
  takeCondMatches(): Uint32Array;
};

/** Store-local compact history resource. Never serialize `resource`. */
export interface CompactRangeHistory {
  readonly range: Range;
  readonly resource: RangeSnapshot;
  readonly byteLength: number;
  readonly refs: ReadonlyArray<[offset: number, target: CellAddress]>;
  toDocumentOp(range: Range): Extract<DocumentOp, { op: "setBlock" }>;
  dispose(): void;
}

export interface SheetwriteStoreOptions {
  storage?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
  protectionResolver?: ProtectionResolver;
  mutationPolicy?: MutationPolicyMode;
}

export class IncompleteDataError extends Error {
  readonly capability: Extract<QueryCapability, { status: "incomplete" }>;

  constructor(sheet: SheetId, capability: Extract<QueryCapability, { status: "incomplete" }>) {
    super(`Sheetwrite: ${sheet} has unloaded datasource cells`);
    this.name = "IncompleteDataError";
    this.capability = capability;
  }
}

function literalOf(value: CellScalar): CellValue {
  return { kind: "literal", value };
}

/** Reusable empty candidate list: sorting the whole sheet passes no candidates. */
const EMPTY_U32 = new Uint32Array(0);

/** Shared empties returned when a sheet has no view state yet. */
const EMPTY_FILTERS: ReadonlyMap<number, ColumnFilter> = new Map();
const EMPTY_GROUPS: readonly RowGroup[] = [];

/** ColumnFilter compare op → the packed op code `filterRowsMulti` decodes. */
const COMPARE_OP: Record<"gt" | "gte" | "lt" | "lte" | "eq" | "neq", number> = {
  gt: 0,
  gte: 1,
  lt: 2,
  lte: 3,
  eq: 4,
  neq: 5,
};

/**
 * Per-sheet view configuration: the multi-key sort, per-column filters, hidden
 * rows, and row groups. `recomputeView` folds these into the single row-order
 * permutation the render path (`getVisibleWindow`) consumes.
 */
interface ViewState {
  sortKeys: SortKey[];
  filters: Map<number, ColumnFilter>;
  hiddenRows: Set<number>;
  groups: RowGroup[];
}

/** Split sort keys into the parallel column / ascending arrays WASM expects. */
function packSortKeys(keys: readonly SortKey[]): { cols: Uint32Array; ascending: Uint8Array } {
  const cols = new Uint32Array(keys.length);
  const ascending = new Uint8Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    cols[i] = keys[i]!.col;
    ascending[i] = keys[i]!.ascending ? 1 : 0;
  }
  return { cols, ascending };
}

/**
 * JS facade over the Rust/WASM columnar store. Heavy data lives in WASM linear
 * memory; this object holds workbook metadata, the style dictionary, paged-cell
 * state, and the transaction barrier. The render hot path goes through
 * `getVisibleWindow` (one bulk read), never `getCell`.
 */
export class SheetwriteStore implements Store {
  private readonly wasm: RecomputingCellStore;
  private readonly workbook: Workbook;
  private readonly storageOptions: SheetwriteStoreOptions;
  private readonly handles = new Map<SheetId, number>();
  private readonly styles = new StyleDictionary();
  private readonly listeners = new Set<ChangeListener>();
  private epoch = 0;
  private readonly refs = new ReferenceGraph((addr, value) => this.writeRefShadow(addr, value));
  private readonly viewOrder = new Map<SheetId, Uint32Array>();
  private readonly viewRowIndex = new Map<SheetId, Map<number, number>>();
  private readonly viewState = new Map<SheetId, ViewState>();
  private readonly colsU32Cache = new WeakMap<ReadonlyArray<number>, Uint32Array>();
  private windowValuesScratch: CellScalar[] = [];
  private readonly formulaSrc = new Map<string, string>();
  private readonly stringCache = new Map<number, string>();
  private readonly condRulesSynced = new Map<SheetId, string>();
  private protectionResolver: ProtectionResolver | undefined;
  private mutationPolicy: MutationPolicyMode;

  private documentId?: string;
  private documentVersion?: number;
  constructor(workbook: Workbook, data?: ColumnarData, options: SheetwriteStoreOptions = {}) {
    if (!isLoaded()) {
      throw new Error("Sheetwrite: await initSheetwrite() before constructing SheetwriteStore");
    }
    if (data && options.storage === "paged") {
      throw new Error("Sheetwrite: ColumnarData requires dense storage");
    }
    this.workbook = workbook;
    this.storageOptions = options;
    this.protectionResolver = options.protectionResolver;
    this.mutationPolicy = options.mutationPolicy ?? "atomic";
    this.wasm = new CellStore() as RecomputingCellStore;
    for (const sheet of workbook.sheets) {
      const handle = this.allocateSheet(sheet.columns.length, sheet.rowCount);
      this.wasm.setSheetName(handle, sheet.id, sheet.name);
      this.handles.set(sheet.id, handle);
    }
    for (const namedRange of workbook.namedRanges ?? []) {
      if (!this.syncNamedRange(namedRange)) {
        this.wasm.free();
        throw new Error(`invalid named range: ${namedRange.name}`);
      }
    }
    if (data) this.loadColumnar(workbook.activeSheet, data);
  }

  setProtectionResolver(
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode = this.mutationPolicy,
  ): void {
    this.protectionResolver = resolver;
    this.mutationPolicy = mode;
  }

  private handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw new Error(`unknown sheet: ${sheet}`);
    return handle;
  }

  private namedRangeScope(scope: SheetId | undefined): number {
    return scope === undefined ? -1 : this.handleOf(scope);
  }

  private syncNamedRange(namedRange: NamedRangeSnapshot): boolean {
    const range = normalizedRange(namedRange.range);
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
    return this.storageOptions.storage === "paged"
      ? this.wasm.addPagedSheet(
          columns,
          rows,
          this.storageOptions.chunkRows ?? 4096,
          this.storageOptions.cacheBytes ?? DEFAULT_PAGED_CACHE_BYTES,
        )
      : this.wasm.addSheet(columns, rows);
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

  private requireCompleteQuery(sheet: SheetId): void {
    const capability = this.queryCapability(sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet, capability);
  }

  static fromSnapshot(input: unknown): SheetwriteStore {
    const checked = validateWorkbookSnapshot(input);
    if (!checked.ok) throw new SnapshotValidationError(checked.errors);
    const snapshot = checked.value;
    const workbook: Workbook = {
      activeSheet: snapshot.workbook.activeSheet,
      namedRanges: cloneJsonValue(snapshot.workbook.namedRanges),
      sheets: snapshot.sheets.map((source) => {
        const rowHeights = new Map<number, number>();
        const hiddenRows = new Set<number>();
        for (const [row, meta] of source.rowMeta ?? []) {
          if (meta.height !== undefined) rowHeights.set(row, meta.height);
          if (meta.hidden) hiddenRows.add(row);
        }
        return {
          id: source.id,
          name: source.name,
          rowCount: source.rowCount,
          columns: cloneJsonValue(source.columns) ?? [],
          frozenRows: source.frozenRows,
          frozenCols: source.frozenCols,
          rowHeights: rowHeights.size > 0 ? rowHeights : undefined,
          hiddenRows: hiddenRows.size > 0 ? hiddenRows : undefined,
          merges: cloneJsonValue(source.merges),
          conditionalFormats: cloneJsonValue(source.conditionalFormats),
          validationRules: cloneJsonValue(source.validationRules),
          protectedRanges: cloneJsonValue(source.protectedRanges),
          notes: cloneJsonValue(source.notes),
          sortKeys: cloneJsonValue(source.sortKeys),
          filters: cloneJsonValue(source.filters),
          rowGroups: cloneJsonValue(source.rowGroups),
        };
      }),
    };

    let store: SheetwriteStore | undefined;
    try {
      store = new SheetwriteStore(workbook);
      store.documentId = snapshot.documentId;
      store.documentVersion = snapshot.version;
      store.hydrateSnapshotCells(snapshot);
      return store;
    } catch (error) {
      store?.dispose();
      throw error;
    }
  }

  /**
   * Write a plain reference's resolved value into its WASM cell as a derived
   * "shadow" literal, preserving the cell's style. Shadows keep the render
   * window, sort/filter/search, and formula evaluation consistent with the
   * displayed value without a JS overlay pass — the window stays transferable.
   */
  private writeRefShadow(addr: CellAddress, value: CellScalar): void {
    const handle = this.handles.get(addr.sheet);
    if (handle === undefined) return;

    this.wasm.beginPageLoad();
    try {
      const style = this.wasm.styleIdAt(handle, addr.row, addr.col);
      if (typeof value === "number") {
        this.wasm.setNumber(handle, addr.row, addr.col, value, style);
      } else if (typeof value === "boolean") {
        this.wasm.setBool(handle, addr.row, addr.col, value, style);
      } else if (typeof value === "string") {
        this.wasm.setString(handle, addr.row, addr.col, value, style);
      } else {
        this.wasm.clearCell(handle, addr.row, addr.col, style);
      }
    } finally {
      this.wasm.endPageLoad();
    }
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
    const resource = this.wasm.captureRange(
      this.handleOf(range.sheet),
      range.start.row,
      range.start.col,
      rows,
      cols,
    );
    if (!resource) return null;

    const formulas: Array<[number, string]> = [];
    for (const [key, source] of this.formulaSrc) {
      const addr = parseCellKey(key);
      if (
        addr.sheet === range.sheet &&
        addr.row >= range.start.row &&
        addr.row <= range.end.row &&
        addr.col >= range.start.col &&
        addr.col <= range.end.col
      ) {
        formulas.push([(addr.row - range.start.row) * cols + addr.col - range.start.col, source]);
      }
    }

    const refs: Array<[number, CellAddress]> = [];
    for (const [source, target] of this.refs.entries()) {
      if (
        source.sheet === range.sheet &&
        source.row >= range.start.row &&
        source.row <= range.end.row &&
        source.col >= range.start.col &&
        source.col <= range.end.col
      ) {
        refs.push([
          (source.row - range.start.row) * cols + source.col - range.start.col,
          { ...target },
        ]);
      }
    }

    let disposed = false;
    return {
      range,
      byteLength: resource.byteLength(),
      resource,
      refs,
      toDocumentOp: (target) => {
        if (disposed) throw new Error("history range snapshot already disposed");
        const kindsColumnMajor = resource.kinds();
        const numbersColumnMajor = this.wasm.snapshotNumbers(resource);
        const textsColumnMajor = this.wasm.snapshotTexts(resource);
        const stylesColumnMajor = resource.styleIds();
        const values: CellScalar[] = new Array(rows * cols);
        const numbers = new Float64Array(rows * cols);
        const texts: string[] = new Array(rows * cols);
        const styleIds: number[] = new Array(rows * cols);
        const styleTable: CellStyle[] = [];
        const styleLookup = new Map<number, number>();
        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const source = col * rows + row;
            const offset = row * cols + col;
            const kind = kindsColumnMajor[source]!;
            numbers[offset] = numbersColumnMajor[source]!;
            texts[offset] = textsColumnMajor[source]!;
            values[offset] =
              kind === KIND_NUMBER
                ? numbers[offset]!
                : kind === KIND_STRING
                  ? texts[offset]!
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
      },
    };
  }

  /** Replace a sheet's view order and drop its stale inverse lookup. */
  private setViewOrder(sheet: SheetId, order: Uint32Array): void {
    this.viewOrder.set(sheet, order);
    this.viewRowIndex.delete(sheet);
  }

  /** Drop a sheet's view order entirely, so reads take the identity fast path. */
  private dropViewOrder(sheet: SheetId): void {
    this.viewOrder.delete(sheet);
    this.viewRowIndex.delete(sheet);
  }

  /** Convert column indices once per stable column-array reference. */
  private colsU32For(cols: readonly number[]): Uint32Array {
    const cached = this.colsU32Cache.get(cols);
    if (cached && cached.length === cols.length) {
      let sameColumns = true;
      for (let i = 0; i < cols.length; i++) {
        if (cached[i] !== cols[i]) {
          sameColumns = false;
          break;
        }
      }
      if (sameColumns) return cached;
    }

    const fresh = Uint32Array.from(cols);
    this.colsU32Cache.set(cols, fresh);
    return fresh;
  }

  /** Reuse the render-window value buffer whenever the cell count is unchanged. */
  private windowValuesFor(cellCount: number): CellScalar[] {
    if (this.windowValuesScratch.length !== cellCount) {
      this.windowValuesScratch = new Array<CellScalar>(cellCount);
    }
    const values = this.windowValuesScratch;
    // Outsized (bulk) reads: hand the buffer to the caller but drop our own
    // reference so its O(cells) lifetime ends with the returned view, which
    // aliases `values`. Keeping it as scratch would pin the peak allocation
    // forever; small viewport reads still reuse the field across frames.
    if (cellCount > WINDOW_SCRATCH_MAX_REUSE) {
      this.windowValuesScratch = [];
    }
    return values;
  }

  /** Resolve a window's unique global style ids to their `CellStyle` objects. */
  private windowStylesFrom(styleDict: Uint32Array): CellStyle[] {
    const styles: CellStyle[] = new Array(styleDict.length);
    for (let k = 0; k < styleDict.length; k++) {
      styles[k] = this.styles.get(styleDict[k]!);
    }
    return styles;
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
    const raw = this.rawCell(addr);
    const key = cellKey(addr);
    if (this.refs.isRef(key)) return { resolved: this.refs.resolved(key), style: raw.style };
    return raw;
  }

  /** The formula source at `addr`, or null if the cell isn't a formula. */
  getFormula(addr: CellAddress): string | null {
    return this.formulaSrc.get(cellKey(addr)) ?? null;
  }

  /** Plain-reference target at `addr`, or null when the cell is not a ref. */
  getRefTarget(addr: CellAddress): CellAddress | null {
    return this.refs.targetOf(cellKey(addr));
  }

  recalculateVolatile(now = new Date()): void {
    const milliseconds = now.getTime();
    if (!Number.isFinite(milliseconds)) throw new RangeError("invalid volatile recalculation date");
    this.wasm.recomputeVolatile(dateToSerial(now));
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

  /** Map a displayed row position to the backing data row under sort/filter. */
  dataRowAt(sheet: SheetId, viewRow: number): number {
    const order = this.viewOrder.get(sheet);
    return order ? (order[viewRow] ?? viewRow) : viewRow;
  }

  /** Map a backing data row to its displayed position, or null when filtered out. */
  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    const order = this.viewOrder.get(sheet);
    if (!order) {
      const meta = this.workbook.sheets.find((s) => s.id === sheet);
      const inBounds =
        meta !== undefined && Number.isInteger(dataRow) && dataRow >= 0 && dataRow < meta.rowCount;
      return inBounds ? dataRow : null;
    }

    let index = this.viewRowIndex.get(sheet);
    if (!index) {
      index = new Map();
      for (let viewRow = 0; viewRow < order.length; viewRow++) {
        index.set(order[viewRow]!, viewRow);
      }
      this.viewRowIndex.set(sheet, index);
    }

    return index.get(dataRow) ?? null;
  }

  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    return this.readWindow(sheet, rows, cols, true);
  }

  private readWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
    applyView: boolean,
  ): VisibleWindowView {
    const handle = this.handleOf(sheet);
    const colsU32 = this.colsU32For(cols);
    if (this.wasm.isPaged(handle)) {
      this.wasm.pinRange(handle, rows.start, rows.end, colsU32);
    }
    const order = applyView ? this.viewOrder.get(sheet) : undefined;
    const hasCondRules = applyView && this.syncConditionalRules(sheet, handle);

    let view: ConsumingWindowView;
    let dataRows: Uint32Array | null = null;
    if (order) {
      dataRows = order.subarray(rows.start, Math.min(rows.end, order.length));
      view = this.wasm.getWindowRows(handle, dataRows, colsU32) as ConsumingWindowView;
    } else {
      view = this.wasm.getWindow(handle, rows.start, rows.end, colsU32) as ConsumingWindowView;
    }

    const kinds = view.takeKinds();
    const numbers = view.takeNumbers();
    const stringIds = view.takeStringIds();
    const stringIndex = view.takeStringIndex();
    const styleIds = view.takeStyleIndex();
    const styleDict = view.takeStyleDict();
    const strings = view.takeStrings();
    const condMatches = hasCondRules ? view.takeCondMatches() : EMPTY_COND_MATCHES;
    view.free();

    let stringPoolUpdateIds: Uint32Array | undefined;
    let stringPoolUpdateValues: string[] | undefined;
    let missingIdSet: Set<number> | null = null;
    // Cap the pool-id→string cache before this window's ids are folded in.
    // Clearing here (not after detection) forces the whole window to re-warm
    // from `poolStrings` below, so no already-cached id is left dangling.
    if (this.stringCache.size >= STRING_CACHE_CAP) this.stringCache.clear();

    for (let i = 0; i < stringIds.length; i++) {
      const id = stringIds[i];
      if (id !== undefined && id !== 0xffffffff && !this.stringCache.has(id)) {
        if (!missingIdSet) missingIdSet = new Set<number>();
        missingIdSet.add(id);
      }
    }
    if (missingIdSet) {
      stringPoolUpdateIds = Uint32Array.from(missingIdSet);
      stringPoolUpdateValues = this.wasm.poolStrings(stringPoolUpdateIds);
      for (let i = 0; i < stringPoolUpdateValues.length; i++) {
        this.stringCache.set(stringPoolUpdateIds[i] ?? 0xffffffff, stringPoolUpdateValues[i] ?? "");
      }
    }

    const values = this.windowValuesFor(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) {
        values[i] = numbers[i] ?? null;
      } else if (kinds[i] === KIND_BOOL) {
        values[i] = (numbers[i] ?? 0) !== 0;
      } else if (kinds[i] === KIND_STRING) {
        const poolId = stringIds[i] ?? 0xffffffff;
        if (poolId !== 0xffffffff) {
          values[i] = this.stringCache.get(poolId) ?? null;
        } else {
          const stringSlot = stringIndex[i] ?? -1;
          values[i] = stringSlot >= 0 ? (strings[stringSlot] ?? null) : null;
        }
      } else {
        values[i] = null;
      }
    }

    const styles = this.windowStylesFrom(styleDict);
    if (condMatches.length > 0) {
      this.mergeCondMatches(sheet, condMatches, styleIds, styles);
    }

    return {
      sheet,
      rows: { start: rows.start, end: rows.end },
      cols,
      values,
      styleIds,
      styles,
      valueKinds: kinds,
      numberValues: numbers,
      stringPoolIds: stringIds,
      stringLocalIds: stringIndex,
      stringPoolUpdateIds,
      stringPoolUpdateValues,
      localStrings: strings,
    };
  }

  private syncConditionalRules(sheet: SheetId, handle: number): boolean {
    const rules = this.sheetMeta(sheet).conditionalFormats ?? [];
    const packable = rules.filter((r) => r.range.sheet === sheet).slice(0, 32);
    const signature = conditionalRulesSignature(packable);
    if (this.condRulesSynced.get(sheet) === signature) return packable.length > 0;
    this.condRulesSynced.set(sheet, signature);

    const kinds = new Uint8Array(packable.length);
    const bounds = new Uint32Array(packable.length * 4);
    const nums = new Float64Array(packable.length);
    const strs: string[] = new Array(packable.length).fill("");
    const flags = new Uint8Array(packable.length);

    for (let i = 0; i < packable.length; i++) {
      const rule = packable[i]!;
      bounds[i * 4] = Math.min(rule.range.start.row, rule.range.end.row);
      bounds[i * 4 + 1] = Math.min(rule.range.start.col, rule.range.end.col);
      bounds[i * 4 + 2] = Math.max(rule.range.start.row, rule.range.end.row);
      bounds[i * 4 + 3] = Math.max(rule.range.start.col, rule.range.end.col);

      const when = rule.when;
      if (when.kind === "greaterThan") {
        kinds[i] = 0;
        nums[i] = when.value;
      } else if (when.kind === "lessThan") {
        kinds[i] = 1;
        nums[i] = when.value;
      } else if (when.kind === "equal") {
        if (typeof when.value === "number") {
          kinds[i] = 2;
          nums[i] = when.value;
        } else if (typeof when.value === "string") {
          kinds[i] = 3;
          strs[i] = when.value;
        } else {
          kinds[i] = 4;
        }
      } else {
        kinds[i] = 5;
        strs[i] = when.text;
        flags[i] = when.matchCase ? 1 : 0;
      }
    }
    this.wasm.setConditionalRules(handle, kinds, bounds, nums, strs, flags);
    return packable.length > 0;
  }

  /**
   * Fold matched conditional-format styles into the window's style dictionary.
   * `condMatches` bit `b` on cell `i` means rule `b` matched; rules apply in
   * declaration order, mirroring the pre-port JS semantics. Merged styles are
   * memoized by the `(base style id, rule mask)` pair — window-local style ids
   * and 32-bit masks compose into one safe integer — so each distinct
   * combination allocates and merges exactly once per window.
   */
  private mergeCondMatches(
    sheet: SheetId,
    condMatches: Uint32Array,
    styleIds: Uint32Array,
    styles: CellStyle[],
  ): void {
    const rules = (this.sheetMeta(sheet).conditionalFormats ?? []).filter(
      (r) => r.range.sheet === sheet,
    );
    const mergedIds = new Map<number, number>();

    for (let i = 0; i < condMatches.length; i++) {
      const fullMask = condMatches[i]!;
      if (fullMask === 0) continue;

      const base = styleIds[i]!;
      const comboKey = base * 0x1_0000_0000 + fullMask;
      let local = mergedIds.get(comboKey);
      if (local === undefined) {
        let merged = styles[base] ?? {};
        for (let bit = 0, mask = fullMask; mask !== 0; bit++, mask >>>= 1) {
          if (mask & 1) merged = { ...merged, ...rules[bit]?.style };
        }
        local = styles.length;
        styles.push(merged);
        mergedIds.set(comboKey, local);
      }
      styleIds[i] = local;
    }
  }

  aggregate(sheet: SheetId, col: number, op: AggregateOp): number {
    this.requireCompleteQuery(sheet);
    return this.wasm.aggregate(this.handleOf(sheet), col, AGG_OP[op]);
  }

  /** Single-column sort; compat shim over the multi-key path. */
  sortBy(sheet: SheetId, col: number, ascending: boolean): void {
    this.sortByMulti(sheet, [{ col, ascending }]);
  }

  /**
   * Replace a sheet's sort with `keys` (first = primary), then recompute the
   * view. Passing `[]` removes the sort while leaving filters, hidden rows, and
   * groups intact.
   */
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

  /**
   * Set (or clear, with `null`) the filter on one column, then recompute. All
   * active column filters AND together.
   */
  setColumnFilter(sheet: SheetId, col: number, filter: ColumnFilter | null): void {
    if (filter !== null) this.requireCompleteQuery(sheet);
    const filters = new Map(this.sheetMeta(sheet).filters ?? []);
    if (filter === null) {
      if (!filters.delete(col)) return;
    } else {
      filters.set(col, cloneJsonValue(filter));
    }
    void this.applyTransaction(
      {
        patches: [
          {
            op: "setSheetMeta",
            sheet,
            patch: { filters: [...filters] },
          },
        ],
      },
      "structure",
    );
  }

  /** Substring "contains" filter on one column; compat shim over the filter path. */
  filterBy(sheet: SheetId, col: number, needle: string): void {
    this.setColumnFilter(sheet, col, { kind: "contains", text: needle });
  }

  /** Live view of a sheet's active column filters, keyed by column index. */
  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.viewState.get(sheet)?.filters ?? EMPTY_FILTERS;
  }

  /**
   * Distinct resolved values of a column in first-seen order, capped at `limit`
   * distinct values (`0` = uncapped). Blanks collapse to a single `null` entry.
   * Feeds a values-filter picker.
   */
  distinctValues(sheet: SheetId, col: number, limit = 1000): CellScalar[] {
    this.requireCompleteQuery(sheet);
    const column = this.wasm.distinctValues(this.handleOf(sheet), col, limit);
    const kinds = column.takeKinds();
    const numbers = column.takeNumbers();
    const texts = column.takeTexts();
    column.free();

    const out: CellScalar[] = new Array(kinds.length);
    let numberAt = 0;
    let textAt = 0;
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === 1) out[i] = numbers[numberAt++] ?? null;
      else if (kinds[i] === 2) out[i] = texts[textAt++] ?? null;
      else if (kinds[i] === 3) out[i] = (numbers[numberAt++] ?? 0) !== 0;
      else out[i] = null;
    }
    return out;
  }

  /** Hide the given data rows; they drop out of the view until shown again. */
  hideRows(sheet: SheetId, rows: readonly number[]): void {
    const meta = this.sheetMeta(sheet);
    const patches: DocumentOp[] = [];
    for (const row of new Set(rows)) {
      if (!integerAt(row) || row >= meta.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet,
        row,
        meta: { height: meta.rowHeights?.get(row), hidden: true },
      });
    }
    void this.applyTransaction({ patches }, "structure");
  }

  /** Show hidden rows — the given ones, or every hidden row when omitted. */
  showRows(sheet: SheetId, rows?: readonly number[]): void {
    const meta = this.sheetMeta(sheet);
    const targets = rows ?? [...(meta.hiddenRows ?? [])];
    const patches: DocumentOp[] = [];
    for (const row of new Set(targets)) {
      if (!integerAt(row) || row >= meta.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet,
        row,
        meta: { height: meta.rowHeights?.get(row), hidden: false },
      });
    }
    void this.applyTransaction({ patches }, "structure");
  }

  /** The sheet's explicitly hidden data rows, ascending. */
  hiddenRows(sheet: SheetId): number[] {
    return [...(this.sheetMeta(sheet).hiddenRows ?? [])].sort((a, b) => a - b);
  }

  /** Add a collapsible row group over the data-row range `[start, end]`. */
  groupRows(sheet: SheetId, start: number, end: number): void {
    const meta = this.sheetMeta(sheet);
    const group = { start: Math.min(start, end), end: Math.max(start, end), collapsed: false };
    const groups = (meta.rowGroups ?? []).filter(
      (existing) => existing.start !== group.start || existing.end !== group.end,
    );
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: [...groups, group] } }] },
      "structure",
    );
  }

  /** Remove the group exactly matching `[start, end]`, if present. */
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

  /** Collapse or expand every group that begins at `start`. */
  setGroupCollapsed(sheet: SheetId, start: number, collapsed: boolean): void {
    const groups = (this.sheetMeta(sheet).rowGroups ?? []).map((group) =>
      group.start === start ? { ...group, collapsed } : group,
    );
    void this.applyTransaction(
      { patches: [{ op: "setSheetMeta", sheet, patch: { rowGroups: groups } }] },
      "structure",
    );
  }

  /** Live view of a sheet's row groups. */
  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.sheetMeta(sheet).rowGroups ?? EMPTY_GROUPS;
  }

  /**
   * Ctrl+Arrow destination. With an active view order `row` is a VIEW position
   * and the scan runs in view space (`dataEdgeOrdered`): a vertical move returns
   * the destination VIEW position, a horizontal move returns a column index.
   * Without a view it scans data space (`dataEdge`) exactly as before.
   */
  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    this.requireCompleteQuery(sheet);
    const handle = this.handleOf(sheet);
    const order = this.viewOrder.get(sheet);
    if (order) return this.wasm.dataEdgeOrdered(handle, order, row, col, dRow, dCol);
    return this.wasm.dataEdge(handle, row, col, dRow, dCol);
  }

  /**
   * Fold a sheet's sort keys, filters, hidden rows, and collapsed groups into
   * the single row-order permutation the render path consumes. When nothing is
   * active the order is dropped entirely so reads take the identity fast path.
   */
  private recomputeView(sheet: SheetId): void {
    const state = this.viewState.get(sheet);
    const hasSort = state !== undefined && state.sortKeys.length > 0;
    const hasFilters = state !== undefined && state.filters.size > 0;
    const hidden = state ? this.hiddenRowSet(state) : null;

    if (!hasSort && !hasFilters && !hidden) {
      this.dropViewOrder(sheet);
      return;
    }

    const handle = this.handleOf(sheet);

    // Survivors after filtering; null means "every data row, natural order".
    let survivors: Uint32Array | null = hasFilters ? this.runFilters(handle, state!.filters) : null;

    // Subtract hidden rows ∪ collapsed-group rows from the survivor set.
    if (hidden) {
      if (survivors) {
        survivors = survivors.filter((row) => !hidden.has(row));
      } else {
        const rowCount = this.sheetMeta(sheet).rowCount;
        const kept: number[] = [];
        for (let row = 0; row < rowCount; row++) if (!hidden.has(row)) kept.push(row);
        survivors = Uint32Array.from(kept);
      }
    }

    // A non-null but empty survivor set is a genuine "matches nothing" view.
    // `sortRowsMulti` reads an empty `candidates` as "the whole sheet", so short
    // out here instead of accidentally repopulating every row.
    if (survivors && survivors.length === 0) {
      this.setViewOrder(sheet, EMPTY_U32);
      return;
    }

    if (!hasSort) {
      // Filters/hiding preserve natural row order — survivors ARE the view.
      // (survivors is non-null here: the no-sort/no-filter/no-hidden case
      // dropped the order and returned above.)
      this.setViewOrder(sheet, survivors ?? EMPTY_U32);
      return;
    }

    const { cols, ascending } = packSortKeys(state?.sortKeys ?? []);
    const order = this.wasm.sortRowsMulti(handle, cols, ascending, survivors ?? EMPTY_U32);
    this.setViewOrder(sheet, order);
  }

  /** Pack the active column filters and run the one-pass WASM scan. */
  private runFilters(handle: number, filters: ReadonlyMap<number, ColumnFilter>): Uint32Array {
    // The overwhelmingly common shape — one case-insensitive "contains" filter
    // (every `filterBy` call) — keeps the dedicated slice-zip fast scan; the
    // generic packed evaluator only pays for genuinely composed filters.
    if (filters.size === 1) {
      const [entry] = filters;
      const [col, filter] = entry!;
      if (filter.kind === "contains" && !filter.matchCase) {
        return this.wasm.filterRows(handle, col, filter.text);
      }
    }

    const count = filters.size;
    const cols = new Uint32Array(count);
    const kinds = new Uint8Array(count);
    const flags = new Uint8Array(count);
    const nums = new Float64Array(count);
    const numCounts = new Uint32Array(count);
    const textCounts = new Uint32Array(count);
    const valueNums: number[] = [];
    const valueTexts: string[] = [];

    let i = 0;
    for (const [col, filter] of filters) {
      cols[i] = col;
      switch (filter.kind) {
        case "values": {
          kinds[i] = 0;
          let includesNull = false;
          let numberCount = 0;
          let textCount = 0;
          for (const value of filter.values) {
            if (value === null) includesNull = true;
            else if (typeof value === "number") {
              valueNums.push(value);
              numberCount++;
            } else if (typeof value === "boolean") {
              valueTexts.push(value ? "\0TRUE" : "\0FALSE");
              textCount++;
            } else {
              valueTexts.push(value);
              textCount++;
            }
          }
          numCounts[i] = numberCount;
          textCounts[i] = textCount;
          flags[i] = includesNull ? 1 : 0;
          break;
        }
        case "contains": {
          kinds[i] = 1;
          flags[i] = filter.matchCase ? 1 : 0;
          textCounts[i] = 1;
          valueTexts.push(filter.text);
          break;
        }
        case "compare": {
          kinds[i] = 2;
          flags[i] = COMPARE_OP[filter.op];
          nums[i] = filter.value;
          break;
        }
        case "empty": {
          kinds[i] = 3;
          break;
        }
        case "nonEmpty": {
          kinds[i] = 4;
          break;
        }
      }
      i++;
    }

    return this.wasm.filterRowsMulti(
      handle,
      cols,
      kinds,
      flags,
      nums,
      numCounts,
      textCounts,
      Float64Array.from(valueNums),
      valueTexts,
    );
  }

  /**
   * The data rows hidden from a sheet's view: explicitly hidden rows plus every
   * row inside a collapsed group. Returns null when nothing is hidden. Avoids
   * copying when there are no collapsed groups.
   */
  private hiddenRowSet(state: ViewState): ReadonlySet<number> | null {
    let hasCollapsed = false;
    for (const group of state.groups) {
      if (group.collapsed) {
        hasCollapsed = true;
        break;
      }
    }
    if (!hasCollapsed) return state.hiddenRows.size > 0 ? state.hiddenRows : null;

    const hidden = new Set<number>(state.hiddenRows);
    for (const group of state.groups) {
      if (!group.collapsed) continue;
      for (let row = group.start; row <= group.end; row++) hidden.add(row);
    }
    return hidden.size > 0 ? hidden : null;
  }

  private ensureViewState(sheet: SheetId): ViewState {
    let state = this.viewState.get(sheet);
    if (!state) {
      const meta = this.sheetMeta(sheet);
      state = {
        sortKeys: meta.sortKeys?.map((key) => ({ ...key })) ?? [],
        filters: new Map(meta.filters?.map(([col, filter]) => [col, cloneJsonValue(filter)]) ?? []),
        hiddenRows: new Set(meta.hiddenRows ?? []),
        groups: meta.rowGroups?.map((group) => ({ ...group })) ?? [],
      };
      this.viewState.set(sheet, state);
    }
    return state;
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

  private clearHostValuesInRange(range: Range): void {
    const bounds = normalizedRange(range);
    for (const key of this.formulaSrc.keys()) {
      const addr = parseCellKey(key);
      if (
        addr.sheet === bounds.sheet &&
        addr.row >= bounds.start.row &&
        addr.row <= bounds.end.row &&
        addr.col >= bounds.start.col &&
        addr.col <= bounds.end.col
      ) {
        this.formulaSrc.delete(key);
      }
    }
    for (const [source] of this.refs.entries()) {
      if (
        source.sheet === bounds.sheet &&
        source.row >= bounds.start.row &&
        source.row <= bounds.end.row &&
        source.col >= bounds.start.col &&
        source.col <= bounds.end.col
      ) {
        this.refs.removeRef(cellKey(source));
      }
    }
  }

  /**
   * Clear a sheet's column sort and filters. Hidden rows and row groups are
   * deliberately preserved and keep applying — a "clear view" resets the query
   * (sort/filter) without un-hiding rows the user explicitly hid. The order is
   * recomputed so any surviving hidden rows / collapsed groups still apply.
   */
  clearView(sheet: SheetId): void {
    const meta = this.sheetMeta(sheet);
    if ((meta.sortKeys?.length ?? 0) === 0 && (meta.filters?.length ?? 0) === 0) return;
    void this.applyTransaction(
      {
        patches: [
          {
            op: "setSheetMeta",
            sheet,
            patch: { sortKeys: [], filters: [] },
          },
        ],
      },
      "structure",
    );
  }

  viewRowCount(sheet: SheetId): number {
    return this.viewOrder.get(sheet)?.length ?? this.sheetMeta(sheet).rowCount;
  }

  hasView(sheet: SheetId): boolean {
    return this.viewOrder.has(sheet);
  }

  ensureColumns(sheet: SheetId, columns: readonly Column[]): void {
    const meta = this.sheetMeta(sheet);
    if (columns.length <= meta.columns.length) return;

    const additions = columns.slice(meta.columns.length);
    this.wasm.insertCols(this.handleOf(sheet), meta.columns.length, additions.length);
    meta.columns.push(...additions);
  }

  private evaluateLocalPolicy(
    patches: readonly DocumentOp[],
    commitReason: CommitReason,
  ): {
    patches: DocumentOp[];
    warnings: MutationIssue[];
    rejections: MutationIssue[];
  } {
    const allowed: DocumentOp[] = [];
    const warnings: MutationIssue[] = [];
    const rejections: MutationIssue[] = [];
    const rulesBySheet = new Map<SheetId, DataValidationRule[]>();
    const protectionsBySheet = new Map<SheetId, ProtectedRange[]>();

    const rulesFor = (sheet: SheetId): DataValidationRule[] => {
      let rules = rulesBySheet.get(sheet);
      if (!rules) {
        rules = [
          ...(this.workbook.sheets.find((item) => item.id === sheet)?.validationRules ?? []),
        ];
        rulesBySheet.set(sheet, rules);
      }
      return rules;
    };
    const protectionsFor = (sheet: SheetId): ProtectedRange[] => {
      let ranges = protectionsBySheet.get(sheet);
      if (!ranges) {
        ranges = [
          ...(this.workbook.sheets.find((item) => item.id === sheet)?.protectedRanges ?? []),
        ];
        protectionsBySheet.set(sheet, ranges);
      }
      return ranges;
    };

    for (let operationIndex = 0; operationIndex < patches.length; operationIndex++) {
      const patch = patches[operationIndex]!;
      const patchIssues: MutationIssue[] = [];
      const sheetId = patchSheetId(patch);
      if (sheetId) {
        patchIssues.push(
          ...this.protectionIssues(patch, operationIndex, commitReason, protectionsFor(sheetId)),
          ...this.validationIssues(patch, operationIndex, rulesFor(sheetId)),
        );
      }
      warnings.push(...patchIssues.filter((issue) => issue.severity === "warning"));
      const errors = patchIssues.filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        rejections.push(...errors);
        continue;
      }

      allowed.push(patch);
      if (patch.op === "setValidationRule") {
        const rules = rulesFor(patch.sheet);
        const index = rules.findIndex((rule) => rule.id === patch.rule.id);
        if (index < 0) rules.push(patch.rule);
        else rules[index] = patch.rule;
      } else if (patch.op === "removeValidationRule") {
        rulesBySheet.set(
          patch.sheet,
          rulesFor(patch.sheet).filter((rule) => rule.id !== patch.id),
        );
      } else if (patch.op === "setProtectedRange") {
        const ranges = protectionsFor(patch.sheet);
        const index = ranges.findIndex((range) => range.id === patch.protectedRange.id);
        if (index < 0) ranges.push(patch.protectedRange);
        else ranges[index] = patch.protectedRange;
      } else if (patch.op === "removeProtectedRange") {
        protectionsBySheet.set(
          patch.sheet,
          protectionsFor(patch.sheet).filter((range) => range.id !== patch.id),
        );
      }
    }

    return {
      patches: this.mutationPolicy === "atomic" && rejections.length > 0 ? [] : allowed,
      warnings,
      rejections,
    };
  }

  private protectionIssues(
    patch: DocumentOp,
    operationIndex: number,
    commitReason: CommitReason,
    protectedRanges: readonly ProtectedRange[],
  ): MutationIssue[] {
    if (protectedRanges.length === 0) return [];
    const affected = this.affectedRanges(patch);
    if (affected.length === 0) return [];

    const issues: MutationIssue[] = [];
    const seen = new Set<string>();
    for (const protectedRange of protectedRanges) {
      if (
        seen.has(protectedRange.id) ||
        !affected.some((range) => rangesIntersect(range, protectedRange.range))
      ) {
        continue;
      }
      seen.add(protectedRange.id);
      let allowed = false;
      try {
        allowed =
          this.protectionResolver?.({
            protectedRange,
            operation: patch,
            commitReason,
          }) === "allow";
      } catch {
        allowed = false;
      }
      if (!allowed) {
        issues.push({
          kind: "protection",
          severity: "error",
          protectedRangeId: protectedRange.id,
          range: normalizedRange(protectedRange.range),
          operationIndex,
          message: protectedRange.label
            ? `Protected range "${protectedRange.label}" denied this mutation`
            : `Protected range "${protectedRange.id}" denied this mutation`,
        });
      }
    }
    return issues;
  }

  private affectedRanges(patch: DocumentOp): Range[] {
    if (patch.op === "set") return [cellRange(patch.addr)];
    if (
      patch.op === "setRange" ||
      patch.op === "setBlock" ||
      patch.op === "setRangeStyle" ||
      patch.op === "clearRange"
    ) {
      return [normalizedRange(patch.range)];
    }
    if (patch.op === "setNote") return [cellRange(patch.addr)];
    if (patch.op === "addMerge" || patch.op === "removeMerge") {
      return [
        {
          sheet: patch.sheet,
          start: { row: patch.merge.r0, col: patch.merge.c0 },
          end: { row: patch.merge.r1, col: patch.merge.c1 },
        },
      ];
    }
    if (patch.op === "setValidationRule") return [normalizedRange(patch.rule.range)];

    const sheetId = patchSheetId(patch);
    const sheet = sheetId
      ? this.workbook.sheets.find((candidate) => candidate.id === sheetId)
      : undefined;
    if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
    if (patch.op === "setColumn") {
      return [
        {
          sheet: patch.sheet,
          start: { row: 0, col: patch.col },
          end: { row: sheet.rowCount - 1, col: patch.col },
        },
      ];
    }
    if (patch.op === "setRowMeta") {
      return [
        {
          sheet: patch.sheet,
          start: { row: patch.row, col: 0 },
          end: { row: patch.row, col: sheet.columns.length - 1 },
        },
      ];
    }
    if (
      patch.op === "addRows" ||
      patch.op === "removeRows" ||
      patch.op === "moveRows" ||
      patch.op === "addColumns" ||
      patch.op === "removeColumns" ||
      patch.op === "moveColumns" ||
      patch.op === "removeSheet" ||
      patch.op === "renameSheet" ||
      patch.op === "moveSheet"
    ) {
      return [fullSheetRange(sheet)];
    }
    return [];
  }

  private validationIssues(
    patch: DocumentOp,
    operationIndex: number,
    rules: readonly DataValidationRule[],
  ): MutationIssue[] {
    if (rules.length === 0) return [];
    const issues: MutationIssue[] = [];

    if (patch.op === "set" && patch.value.kind === "literal") {
      for (const rule of rules) {
        if (
          rule.policy === "allow" ||
          !rangeContains(rule.range, patch.addr) ||
          validationAccepts(rule, patch.value.value)
        ) {
          continue;
        }
        issues.push({
          kind: "validation",
          severity: rule.policy === "warn" ? "warning" : "error",
          ruleId: rule.id,
          addr: patch.addr,
          value: patch.value,
          operationIndex,
          message: rule.helpText ?? validationMessage(rule),
        });
      }
      return issues;
    }

    if (patch.op === "setRange") {
      const range = normalizedRange(patch.range);
      for (const cell of patch.cells) {
        if (cell.value.kind !== "literal") continue;
        const addr = {
          sheet: range.sheet,
          row: range.start.row + cell.rowOffset,
          col: range.start.col + cell.colOffset,
        };
        for (const rule of rules) {
          if (
            rule.policy === "allow" ||
            !rangeContains(rule.range, addr) ||
            validationAccepts(rule, cell.value.value)
          ) {
            continue;
          }
          issues.push({
            kind: "validation",
            severity: rule.policy === "warn" ? "warning" : "error",
            ruleId: rule.id,
            addr,
            value: cell.value,
            operationIndex,
            message: rule.helpText ?? validationMessage(rule),
          });
        }
      }
      return issues;
    }

    if (patch.op === "clearRange") {
      const range = normalizedRange(patch.range);
      for (const rule of rules) {
        const ruleRange = normalizedRange(rule.range);
        if (
          rule.policy === "allow" ||
          !rangesIntersect(range, ruleRange) ||
          validationAccepts(rule, null)
        ) {
          continue;
        }
        const addr = {
          sheet: range.sheet,
          row: Math.max(range.start.row, ruleRange.start.row),
          col: Math.max(range.start.col, ruleRange.start.col),
        };
        issues.push({
          kind: "validation",
          severity: rule.policy === "warn" ? "warning" : "error",
          ruleId: rule.id,
          addr,
          value: { kind: "literal", value: null },
          operationIndex,
          message: rule.helpText ?? validationMessage(rule),
        });
      }
      return issues;
    }

    if (patch.op !== "setBlock") return issues;
    const range = normalizedRange(patch.range);
    const formulaOffsets = new Set((patch.block.formulas ?? []).map(([offset]) => offset));
    const refOffsets = new Set((patch.block.refs ?? []).map(([offset]) => offset));
    for (const rule of rules) {
      if (rule.policy === "allow" || rule.range.sheet !== range.sheet) continue;
      const ruleRange = normalizedRange(rule.range);
      const rowStart = Math.max(range.start.row, ruleRange.start.row);
      const rowEnd = Math.min(range.end.row, ruleRange.end.row);
      const colStart = Math.max(range.start.col, ruleRange.start.col);
      const colEnd = Math.min(range.end.col, ruleRange.end.col);
      if (rowStart > rowEnd || colStart > colEnd) continue;

      for (let row = rowStart; row <= rowEnd; row++) {
        const rowOffset = (row - range.start.row) * patch.block.colCount;
        for (let col = colStart; col <= colEnd; col++) {
          const offset = rowOffset + col - range.start.col;
          if (formulaOffsets.has(offset) || refOffsets.has(offset)) continue;
          const scalar = patch.block.values[offset] ?? null;
          if (validationAccepts(rule, scalar)) continue;
          const value: CellValue = { kind: "literal", value: scalar };
          issues.push({
            kind: "validation",
            severity: rule.policy === "warn" ? "warning" : "error",
            ruleId: rule.id,
            addr: { sheet: range.sheet, row, col },
            value,
            operationIndex,
            message: rule.helpText ?? validationMessage(rule),
          });
        }
      }
    }
    return issues;
  }

  /**
   * Internal producers may pass a bare reason; public persistence callers pass
   * explicit source and commit-reason options.
   */
  applyTransaction(
    tx: Transaction,
    reasonOrOptions: CommitReason | TransactionApplicationOptions = {},
  ): ApplyTransactionResult {
    const options =
      typeof reasonOrOptions === "string" ? { commitReason: reasonOrOptions } : reasonOrOptions;
    const commitReason = options.commitReason ?? "api";
    const source = options.source ?? "local";
    // Non-reentrant barrier: a stale epoch is rejected outright (the app
    // rebases on the change stream and resubmits).
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
      return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
    }
    if (source === "local" && tx.patches.some((patch) => !this.canApplyLocally(patch))) {
      return { status: "noop", epoch: this.epoch, reason: "incomplete-data" };
    }
    let effectiveTx = tx;
    let policyWarnings: MutationIssue[] = [];
    let policyRejections: MutationIssue[] = [];
    if (source === "local") {
      const policy = this.evaluateLocalPolicy(tx.patches, commitReason);
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
    const changes: ChangeEvent["changes"] | null = hasListeners ? [] : null;
    const appliedPatches: DocumentOp[] = [];
    const touchedSheets = new Set<SheetId>();
    let hasStructuralPatch = false;

    if (source === "remote") this.wasm.beginPageLoad();
    try {
      for (const patch of effectiveTx.patches) {
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
          const sheet = patch.op === "addSheet" ? patch.sheet.id : patch.sheet;
          touchedSheets.add(sheet);
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
      if (source === "remote") this.wasm.endPageLoad();
    }

    if (appliedPatches.length === 0) {
      return {
        status: "noop",
        epoch: this.epoch,
        reason: effectiveTx.patches.length === 0 ? "empty" : "out-of-bounds",
      };
    }

    if (hasStructuralPatch) {
      this.syncFormulaSources();
      for (const sheet of this.workbook.sheets) {
        this.wasm.recompute(this.handleOf(sheet.id));
      }
    } else {
      for (const sheet of touchedSheets) {
        this.wasm.recompute(this.handleOf(sheet));
      }
    }
    if (this.refs.hasRefs()) {
      this.refs.refreshAll((addr) => this.rawCell(addr).resolved);
    }

    this.epoch += 1;

    const transaction =
      appliedPatches.length === effectiveTx.patches.length
        ? effectiveTx
        : { ...effectiveTx, patches: appliedPatches };

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
      changes: changes ?? [],
      commitReason,
      source,
      epoch: this.epoch,
    };
    for (const fn of this.listeners) fn(event);
    return {
      status: "applied",
      epoch: this.epoch,
      transaction,
      ...(policyWarnings.length > 0 ? { warnings: policyWarnings } : {}),
      ...(policyRejections.length > 0 ? { rejections: policyRejections } : {}),
    };
  }

  private applyPatch(patch: DocumentOp, changes: ChangeEvent["changes"] | null): boolean {
    switch (patch.op) {
      case "set": {
        if (!this.isCellInBounds(patch.addr)) return false;
        const before = changes ? this.getCell(patch.addr) : null;
        const styleId = this.styles.intern(patch.style);
        const handle = this.handleOf(patch.addr.sheet);
        const { row, col } = patch.addr;
        if (patch.value.kind === "formula") {
          const key = cellKey(patch.addr);
          this.refs.removeRef(key);
          this.formulaSrc.set(key, patch.value.src);
          this.wasm.setFormula(handle, row, col, patch.value.src, styleId);
        } else if (patch.value.kind === "ref") {
          const key = cellKey(patch.addr);
          const literalAt: LiteralLookup = (a) => this.rawCell(a).resolved;
          this.wasm.clearCell(handle, row, col, styleId);
          this.formulaSrc.delete(key);
          this.refs.setRef(patch.addr, patch.value.target, literalAt);
        } else {
          const hasRefs = this.refs.hasRefs();
          const hasFormulaSources = this.formulaSrc.size > 0;
          const key = hasRefs || hasFormulaSources ? cellKey(patch.addr) : undefined;
          if (key && hasRefs) this.refs.removeRef(key);
          const value = patch.value.value;
          if (typeof value === "number") this.wasm.setNumber(handle, row, col, value, styleId);
          else if (typeof value === "boolean") this.wasm.setBool(handle, row, col, value, styleId);
          else if (typeof value === "string") this.wasm.setString(handle, row, col, value, styleId);
          else this.wasm.clearCell(handle, row, col, styleId);
          if (key && hasFormulaSources) this.formulaSrc.delete(key);
          if (key && hasRefs) {
            const literalAt: LiteralLookup = (a) => this.rawCell(a).resolved;
            this.refs.onLiteralChanged(key, literalAt);
          }
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
        for (const cell of patch.cells) {
          const addr = {
            sheet: bounds.sheet,
            row: bounds.start.row + cell.rowOffset,
            col: bounds.start.col + cell.colOffset,
          };
          this.applyPatch({ op: "set", addr, value: cell.value, style: cell.style }, changes);
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

        const formulaByOffset = new Map(block.formulas ?? []);
        const refByOffset = new Map(block.refs ?? []);
        const kinds = new Uint8Array(cellCount);
        const numbers = new Float64Array(cellCount);
        const texts: string[] = new Array(cellCount);
        const wasmStyles = new Uint32Array(cellCount);
        for (let offset = 0; offset < cellCount; offset++) {
          const value = block.values[offset]!;
          if (formulaByOffset.has(offset) || refByOffset.has(offset) || value === null) {
            kinds[offset] = 0;
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
            styleIds === undefined ? undefined : styleTable[styleIds[offset]!],
          );
        }

        this.clearHostValuesInRange(bounds);
        if (
          !this.wasm.setBlock(
            this.handleOf(bounds.sheet),
            bounds.start.row,
            bounds.start.col,
            rows,
            cols,
            kinds,
            numbers,
            texts,
            wasmStyles,
          )
        ) {
          return false;
        }
        for (const [offset, source] of formulaByOffset) {
          const rowOffset = Math.floor(offset / cols);
          const colOffset = offset % cols;
          this.applyPatch(
            {
              op: "set",
              addr: {
                sheet: bounds.sheet,
                row: bounds.start.row + rowOffset,
                col: bounds.start.col + colOffset,
              },
              value: { kind: "formula", src: source },
              style: styleIds === undefined ? undefined : styleTable[styleIds[offset]!],
            },
            null,
          );
        }
        for (const [offset, target] of refByOffset) {
          const rowOffset = Math.floor(offset / cols);
          const colOffset = offset % cols;
          this.applyPatch(
            {
              op: "set",
              addr: {
                sheet: bounds.sheet,
                row: bounds.start.row + rowOffset,
                col: bounds.start.col + colOffset,
              },
              value: { kind: "ref", target },
              style: styleIds === undefined ? undefined : styleTable[styleIds[offset]!],
            },
            null,
          );
        }
        return true;
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
        const oldIds = this.wasm.rangeStyleIds(
          this.handleOf(bounds.sheet),
          bounds.start.row,
          bounds.start.col,
          bounds.end.row,
          bounds.end.col,
        );
        const newIds = new Uint32Array(oldIds.length);
        for (let i = 0; i < oldIds.length; i++) {
          newIds[i] =
            patch.style === null
              ? 0
              : this.styles.intern({ ...this.styles.get(oldIds[i]!), ...patch.style });
        }
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
        const clearContents = patch.contents ?? true;
        const clearStyle = patch.style ?? true;
        if (clearContents) this.clearHostValuesInRange(bounds);
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
        const state = this.ensureViewState(patch.sheet);
        state.hiddenRows = new Set(sheet.hiddenRows);
        this.recomputeView(patch.sheet);
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
        return true;
      }
      case "removeValidationRule": {
        const sheet = this.sheetMeta(patch.sheet);
        const rules = sheet.validationRules ?? [];
        if (!rules.some((rule) => rule.id === patch.id)) return false;
        sheet.validationRules = rules.filter((rule) => rule.id !== patch.id);
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
        return true;
      }
      case "removeProtectedRange": {
        const sheet = this.sheetMeta(patch.sheet);
        const ranges = sheet.protectedRanges ?? [];
        if (!ranges.some((range) => range.id === patch.id)) return false;
        sheet.protectedRanges = ranges.filter((range) => range.id !== patch.id);
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
        return true;
      }
      case "removeMerge": {
        const sheet = this.sheetMeta(patch.sheet);
        const merge = normalizeMerge(patch.merge);
        const merges = sheet.merges ?? [];
        const index = merges.findIndex((existing) => sameMerge(existing, merge));
        if (index < 0) return false;
        sheet.merges = [...merges.slice(0, index), ...merges.slice(index + 1)];
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
          this.condRulesSynced.delete(patch.sheet);
          this.syncConditionalRules(patch.sheet, this.handleOf(patch.sheet));
        }
        if (patch.patch.rowGroups !== undefined) {
          sheet.rowGroups = patch.patch.rowGroups.map((group) => ({ ...group }));
          const state = this.ensureViewState(patch.sheet);
          state.groups = sheet.rowGroups.map((group) => ({ ...group }));
          this.recomputeView(patch.sheet);
        }
        if (patch.patch.sortKeys !== undefined || patch.patch.filters !== undefined) {
          const state = this.ensureViewState(patch.sheet);
          if (patch.patch.sortKeys !== undefined) {
            sheet.sortKeys = patch.patch.sortKeys.map((key) => ({ ...key }));
            state.sortKeys = sheet.sortKeys.map((key) => ({ ...key }));
          }
          if (patch.patch.filters !== undefined) {
            sheet.filters = patch.patch.filters.map(([col, filter]) => [
              col,
              cloneJsonValue(filter),
            ]);
            state.filters = new Map(sheet.filters);
          }
          this.recomputeView(patch.sheet);
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

  private valueAt(addr: CellAddress): CellValue {
    const formula = this.getFormula(addr);
    if (formula) return { kind: "formula", src: formula };
    const target = this.getRefTarget(addr);
    if (target) return { kind: "ref", target };
    return { kind: "literal", value: this.getCell(addr).resolved };
  }

  private snapshotCells(
    sheet: SheetId,
    rowStart: number,
    rowEnd: number,
    colStart: number,
    colEnd: number,
  ): Array<Extract<DocumentOp, { op: "set" }>> {
    const patches: Array<Extract<DocumentOp, { op: "set" }>> = [];
    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const addr = { sheet, row, col };
        const cell = this.getCell(addr);
        const value = this.valueAt(addr);
        if (
          value.kind === "literal" &&
          value.value === null &&
          Object.keys(cell.style).length === 0
        ) {
          continue;
        }
        patches.push({ op: "set", addr, value, style: cell.style });
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
    for (const cell of cells) {
      this.applyPatch(
        {
          ...cell,
          addr: { ...cell.addr, row: patch.to + (cell.addr.row - patch.from) },
        },
        changes,
      );
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
    for (const cell of cells) {
      this.applyPatch(
        {
          ...cell,
          addr: { ...cell.addr, col: patch.to + (cell.addr.col - patch.from) },
        },
        changes,
      );
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
    if (
      !snapshot.id ||
      this.handles.has(snapshot.id) ||
      !integerAt(snapshot.order) ||
      snapshot.order > this.workbook.sheets.length ||
      !integerAt(snapshot.rowCount) ||
      snapshot.columns.length === 0 ||
      !uniqueColumnKeys(snapshot.columns) ||
      !snapshot.name.trim() ||
      this.workbook.sheets.some((sheet) => sheet.name === snapshot.name)
    ) {
      return false;
    }
    const merges = snapshot.merges?.map(normalizeMerge) ?? [];
    const candidate: Sheet = {
      id: snapshot.id,
      name: snapshot.name,
      rowCount: snapshot.rowCount,
      columns: snapshot.columns,
      frozenRows: snapshot.frozenRows,
      frozenCols: snapshot.frozenCols,
    };
    candidate.validationRules = snapshot.validationRules;
    candidate.protectedRanges = snapshot.protectedRanges;
    candidate.notes = snapshot.notes;
    candidate.sortKeys = snapshot.sortKeys;
    candidate.filters = snapshot.filters;
    if (
      (snapshot.frozenRows !== undefined && snapshot.frozenRows > snapshot.rowCount) ||
      (snapshot.frozenCols !== undefined && snapshot.frozenCols > snapshot.columns.length) ||
      merges.some(
        (merge) => !validMerge(candidate, merge) || mergeCrossesFreeze(candidate, merge),
      ) ||
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
      return false;
    }
    const handle = this.allocateSheet(snapshot.columns.length, snapshot.rowCount);
    this.wasm.setSheetName(handle, snapshot.id, snapshot.name);
    this.handles.set(snapshot.id, handle);
    const sheet: Sheet = {
      id: snapshot.id,
      name: snapshot.name,
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
      for (const cell of block.cells) {
        if (
          !this.applyPatch(
            {
              op: "set",
              addr: {
                sheet: snapshot.id,
                row: block.startRow + cell.rowOffset,
                col: block.startCol + cell.colOffset,
              },
              value: cell.value,
              style: cell.style,
            },
            changes,
          )
        ) {
          return false;
        }
      }
    }
    this.condRulesSynced.delete(snapshot.id);
    this.syncConditionalRules(snapshot.id, handle);
    return true;
  }

  private removeSheetSnapshot(sheetId: SheetId, changes: ChangeEvent["changes"] | null): boolean {
    const index = this.workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
    if (index < 0 || this.workbook.sheets.length <= 1) return false;
    if (!this.removeSheetFormulaIdentity(sheetId)) return false;
    for (const [source, target] of this.refs.entries()) {
      if (source.sheet === sheetId) {
        this.refs.removeRef(cellKey(source));
      } else if (target.sheet === sheetId) {
        this.applyPatch(
          {
            op: "set",
            addr: source,
            value: { kind: "literal", value: "#REF!" },
            style: this.getCell(source).style,
          },
          changes,
        );
      }
    }
    this.handles.delete(sheetId);
    this.viewState.delete(sheetId);
    this.viewOrder.delete(sheetId);
    this.condRulesSynced.delete(sheetId);
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
    this.rebaseViewRows(sheet, remap);
    this.rebaseFormulaSources(sheet, remap);

    const literalAt: LiteralLookup = (addr) => this.rawCell(addr).resolved;
    this.refs.rebaseRows(sheet, remap, literalAt);
  }

  private syncFormulaSources(): void {
    if (this.formulaSrc.size === 0) return;

    for (const [key] of this.formulaSrc) {
      const addr = parseCellKey(key);
      const source = this.wasm.formulaSource(this.handleOf(addr.sheet), addr.row, addr.col);
      if (source === undefined) {
        this.formulaSrc.delete(key);
      } else {
        this.formulaSrc.set(key, source);
      }
    }
  }

  private rebaseFormulaSources(sheet: SheetId, remap: (row: number) => number | null): void {
    if (this.formulaSrc.size === 0) return;

    const next = new Map<string, string>();
    for (const [key, src] of this.formulaSrc) {
      const addr = parseCellKey(key);
      if (addr.sheet !== sheet) {
        next.set(key, src);
        continue;
      }

      const row = remap(addr.row);
      if (row !== null) next.set(cellKey({ ...addr, row }), src);
    }

    this.formulaSrc.clear();
    for (const [key, src] of next) this.formulaSrc.set(key, src);
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
    this.rebaseViewCols(sheet);
    this.rebaseFormulaSourceCols(sheet, remap);

    const literalAt: LiteralLookup = (addr) => this.rawCell(addr).resolved;
    this.refs.rebaseCols(sheet, remap, literalAt);
  }

  /**
   * Rebase a sheet's view after a structural row edit. Column sort/filter are
   * dropped (their row set is invalidated by the shift, matching the historical
   * behaviour), while hidden rows and groups follow their data rows through
   * `remap`; the order is then recomputed from what survives.
   */
  private rebaseViewRows(sheet: SheetId, remap: (row: number) => number | null): void {
    const state = this.viewState.get(sheet);
    if (state) {
      state.sortKeys = [];
      state.filters.clear();
      const meta = this.sheetMeta(sheet);
      meta.sortKeys = [];
      meta.filters = [];
      if (state.hiddenRows.size > 0) {
        const next = new Set<number>();
        for (const row of state.hiddenRows) {
          const mapped = remap(row);
          if (mapped !== null) next.add(mapped);
        }
        state.hiddenRows = next;
      }
      if (state.groups.length > 0) {
        const groups: RowGroup[] = [];
        for (const group of state.groups) {
          const rebased = this.rebaseGroup(group, remap);
          if (rebased) groups.push(rebased);
        }
        state.groups = groups;
      }
    }
    this.recomputeView(sheet);
  }

  /**
   * Rebase a sheet's view after a structural column edit. Sort keys and filters
   * are column-indexed, so a column shift invalidates them; hidden rows and
   * groups are row-based and untouched. The order is recomputed so any surviving
   * hidden rows / collapsed groups keep applying.
   */
  private rebaseViewCols(sheet: SheetId): void {
    const state = this.viewState.get(sheet);
    if (state) {
      state.sortKeys = [];
      state.filters.clear();
      const meta = this.sheetMeta(sheet);
      meta.sortKeys = [];
      meta.filters = [];
    }
    this.recomputeView(sheet);
  }

  /**
   * Remap a group's row range through `remap` (monotonic non-decreasing). The
   * surviving rows form a contiguous block; scan inward from both ends to the
   * first surviving row. Returns null when the whole group was removed.
   */
  private rebaseGroup(group: RowGroup, remap: (row: number) => number | null): RowGroup | null {
    let start: number | null = null;
    for (let row = group.start; row <= group.end; row++) {
      const mapped = remap(row);
      if (mapped !== null) {
        start = mapped;
        break;
      }
    }
    if (start === null) return null;
    let end = start;
    for (let row = group.end; row >= group.start; row--) {
      const mapped = remap(row);
      if (mapped !== null) {
        end = mapped;
        break;
      }
    }
    return { start, end, collapsed: group.collapsed };
  }

  private rebaseFormulaSourceCols(sheet: SheetId, remap: (col: number) => number | null): void {
    if (this.formulaSrc.size === 0) return;

    const next = new Map<string, string>();
    for (const [key, src] of this.formulaSrc) {
      const addr = parseCellKey(key);
      if (addr.sheet !== sheet) {
        next.set(key, src);
        continue;
      }

      const col = remap(addr.col);
      if (col !== null) next.set(cellKey({ ...addr, col }), src);
    }

    this.formulaSrc.clear();
    for (const [key, src] of next) this.formulaSrc.set(key, src);
  }

  on(_evt: "change", fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  acknowledgeOperations(operations: readonly DocumentOp[]): void {
    for (const operation of operations) {
      if (operation.op === "set") {
        this.wasm.markRangeClean(
          this.handleOf(operation.addr.sheet),
          operation.addr.row,
          operation.addr.row + 1,
          operation.addr.col,
          operation.addr.col + 1,
        );
      } else if (operation.op === "setRange") {
        const range = normalizedRange(operation.range);
        for (const cell of operation.cells) {
          const row = range.start.row + cell.rowOffset;
          const col = range.start.col + cell.colOffset;
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

  exportSnapshot(): WorkbookSnapshot {
    for (const sheet of this.workbook.sheets) {
      this.requireCompleteQuery(sheet.id);
    }
    const refTargets = new Map<string, CellAddress>();
    for (const [source, target] of this.refs.entries()) {
      refTargets.set(cellKey(source), target);
    }
    const sheets: SheetSnapshot[] = this.workbook.sheets.map((sheet, order) => {
      const rowMetaRows = new Set<number>([
        ...(sheet.rowHeights?.keys() ?? []),
        ...(sheet.hiddenRows?.values() ?? []),
      ]);
      const rowMeta = [...rowMetaRows]
        .sort((left, right) => left - right)
        .map(
          (row) =>
            [
              row,
              {
                ...(sheet.rowHeights?.has(row) ? { height: sheet.rowHeights.get(row) } : {}),
                ...(sheet.hiddenRows?.has(row) ? { hidden: true } : {}),
              },
            ] as const,
        );

      const cols = sheet.columns.map((_, col) => col);
      const window = this.readWindow(sheet.id, { start: 0, end: sheet.rowCount }, cols, false);
      const cells: SnapshotCell[] = [];
      for (let row = 0; row < sheet.rowCount; row++) {
        for (let col = 0; col < cols.length; col++) {
          const index = row * cols.length + col;
          const addr = { sheet: sheet.id, row, col };
          const key = cellKey(addr);
          const formula = this.formulaSrc.get(key);
          const target = refTargets.get(key);
          const style = window.styles[window.styleIds[index] ?? 0] ?? {};
          const hasStyle = Object.keys(style).length > 0;
          const resolved = window.values[index] ?? null;
          if (!formula && !target && resolved === null && !hasStyle) continue;
          const value: CellValue = formula
            ? { kind: "formula", src: formula }
            : target
              ? { kind: "ref", target: { ...target } }
              : { kind: "literal", value: resolved };
          cells.push({
            rowOffset: row,
            colOffset: col,
            value,
            ...(hasStyle ? { style: cloneJsonValue(style) } : {}),
          });
        }
      }

      return {
        id: sheet.id,
        name: sheet.name,
        order,
        rowCount: sheet.rowCount,
        columns: cloneJsonValue(sheet.columns) ?? [],
        ...(sheet.frozenRows !== undefined ? { frozenRows: sheet.frozenRows } : {}),
        ...(sheet.frozenCols !== undefined ? { frozenCols: sheet.frozenCols } : {}),
        ...(rowMeta.length > 0 ? { rowMeta: rowMeta.map(([row, meta]) => [row, meta]) } : {}),
        ...(sheet.merges?.length ? { merges: cloneJsonValue(sheet.merges) } : {}),
        ...(sheet.conditionalFormats?.length
          ? { conditionalFormats: cloneJsonValue(sheet.conditionalFormats) }
          : {}),
        ...(sheet.validationRules?.length
          ? { validationRules: cloneJsonValue(sheet.validationRules) }
          : {}),
        ...(sheet.protectedRanges?.length
          ? { protectedRanges: cloneJsonValue(sheet.protectedRanges) }
          : {}),
        ...(sheet.notes?.length ? { notes: cloneJsonValue(sheet.notes) } : {}),
        ...(sheet.sortKeys?.length ? { sortKeys: cloneJsonValue(sheet.sortKeys) } : {}),
        ...(sheet.filters?.length ? { filters: cloneJsonValue(sheet.filters) } : {}),
        ...(sheet.rowGroups?.length ? { rowGroups: cloneJsonValue(sheet.rowGroups) } : {}),
        cells:
          cells.length > 0
            ? [
                {
                  startRow: 0,
                  startCol: 0,
                  rowCount: sheet.rowCount,
                  colCount: sheet.columns.length,
                  cells,
                },
              ]
            : [],
      };
    });

    return {
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      ...(this.documentId !== undefined ? { documentId: this.documentId } : {}),
      ...(this.documentVersion !== undefined ? { version: this.documentVersion } : {}),
      workbook: {
        activeSheet: this.workbook.activeSheet,
        ...(this.workbook.namedRanges?.length
          ? { namedRanges: cloneJsonValue(this.workbook.namedRanges) }
          : {}),
      },
      sheets,
    };
  }

  /** Rewrite resolved formula sheet identity without changing the stable WASM handle. */
  renameSheetFormulaIdentity(sheet: SheetId, name: string): boolean {
    const handle = this.handleOf(sheet);
    if (!this.wasm.renameSheet(handle, sheet, name)) return false;
    this.syncFormulaSourcesFromWasm();
    return true;
  }

  /** Tombstone a stable WASM handle and rewrite surviving formulas to `#REF!`. */
  removeSheetFormulaIdentity(sheet: SheetId): boolean {
    const handle = this.handleOf(sheet);
    if (!this.wasm.removeSheet(handle)) return false;
    this.syncFormulaSourcesFromWasm();
    return true;
  }

  private syncFormulaSourcesFromWasm(): void {
    for (const key of [...this.formulaSrc.keys()]) {
      const addr = parseCellKey(key);
      const handle = this.handles.get(addr.sheet);
      const source =
        handle === undefined ? undefined : this.wasm.formulaSource(handle, addr.row, addr.col);
      if (source === undefined) this.formulaSrc.delete(key);
      else this.formulaSrc.set(key, source);
    }
  }

  /** Bulk-load datasource rows into a sheet. Hydration emits nothing and never becomes dirty. */
  loadRows(
    sheet: SheetId,
    start: number,
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    if (rows.length === 0) return;
    this.wasm.beginPageLoad();
    try {
      const handle = this.handleOf(sheet);
      const columns = this.sheetMeta(sheet).columns;
      const exceptions: DocumentOp[] = [];
      const protectedCells: DocumentOp[] = [];

      for (let c = 0; c < columns.length; c++) {
        const column = columns[c]!;
        for (let offset = 0; offset < rows.length; offset++) {
          const addr = { sheet, row: start + offset, col: c };
          if (this.wasm.cellState(handle, addr.row, addr.col) === 3 || protect?.(addr)) {
            const formula = this.getFormula(addr);
            const target = this.getRefTarget(addr);
            const cell = this.getCell(addr);
            const value: CellValue = formula
              ? { kind: "formula", src: formula }
              : target
                ? { kind: "ref", target }
                : { kind: "literal", value: cell.resolved };
            protectedCells.push({ op: "set", addr, value, style: cell.style });
            continue;
          }
          const dataCell = rows[offset]![column.key];
          const wrapped =
            dataCell && typeof dataCell === "object" && !("kind" in dataCell) && "value" in dataCell
              ? dataCell
              : undefined;
          const value: CellScalar | CellValue | undefined = wrapped
            ? wrapped.value
            : (dataCell as CellScalar | CellValue | undefined);
          if (
            wrapped?.style !== undefined ||
            (value &&
              typeof value === "object" &&
              (value.kind === "formula" || value.kind === "ref"))
          ) {
            exceptions.push({
              op: "set",
              addr,
              value: value as CellValue,
              style: wrapped?.style,
            });
          }
        }
        this.loadColumnBlock(handle, column, c, start, rows);
      }

      for (const patch of exceptions) this.applyPatch(patch, null);
      for (const patch of protectedCells) this.applyPatch(patch, null);
      this.wasm.recompute(handle);
      if (this.refs.hasRefs()) {
        this.refs.refreshAll((addr) => this.rawCell(addr).resolved);
      }
    } finally {
      this.wasm.endPageLoad();
    }
  }

  private hydrateSnapshotCells(snapshot: WorkbookSnapshot): void {
    const literalExceptions: DocumentOp[] = [];
    const formulas: DocumentOp[] = [];
    const references: DocumentOp[] = [];

    for (const sourceSheet of snapshot.sheets) {
      const handle = this.handleOf(sourceSheet.id);
      const bulkByColumn = new Map<number, Array<{ row: number; value: string | number }>>();
      for (const block of sourceSheet.cells) {
        for (const cell of block.cells) {
          const addr = {
            sheet: sourceSheet.id,
            row: block.startRow + cell.rowOffset,
            col: block.startCol + cell.colOffset,
          };
          const patch: DocumentOp = { op: "set", addr, value: cell.value, style: cell.style };
          if (cell.value.kind === "formula") {
            formulas.push(patch);
          } else if (cell.value.kind === "ref") {
            references.push(patch);
          } else if (
            cell.style === undefined &&
            (typeof cell.value.value === "number" || typeof cell.value.value === "string")
          ) {
            const entries = bulkByColumn.get(addr.col) ?? [];
            entries.push({ row: addr.row, value: cell.value.value });
            bulkByColumn.set(addr.col, entries);
          } else {
            literalExceptions.push(patch);
          }
        }
      }

      for (const [col, entries] of bulkByColumn) {
        entries.sort((left, right) => left.row - right.row);
        for (let index = 0; index < entries.length; ) {
          const first = entries[index]!;
          const kind = typeof first.value;
          let end = index + 1;
          while (
            end < entries.length &&
            entries[end]!.row === entries[end - 1]!.row + 1 &&
            typeof entries[end]!.value === kind
          ) {
            end += 1;
          }
          const run = entries.slice(index, end);
          if (kind === "number") {
            this.wasm.setColumnNumbers(
              handle,
              col,
              first.row,
              Float64Array.from(run, (entry) => entry.value as number),
              0,
            );
          } else {
            const values = run.map((entry) => entry.value as string);
            const lengths = Uint32Array.from(values, (value) => value.length);
            this.wasm.setColumnStringsPacked(handle, col, first.row, values.join(""), lengths, 0);
          }
          index = end;
        }
      }
    }

    for (const patch of literalExceptions) this.applyPatch(patch, null);
    for (const patch of formulas) this.applyPatch(patch, null);
    for (const patch of references) this.applyPatch(patch, null);
    for (const sheet of this.workbook.sheets) {
      const handle = this.handleOf(sheet.id);
      this.syncConditionalRules(sheet.id, handle);
      this.wasm.recompute(handle);
    }
    if (this.refs.hasRefs()) {
      this.refs.refreshAll((addr) => this.rawCell(addr).resolved);
    }
    this.epoch = snapshot.version ?? 0;
  }

  /** Release the WASM-side cell store immediately; the store is unusable afterwards. */
  dispose(): void {
    this.wasm.free();
  }

  private loadColumnBlock(
    handle: number,
    column: Column,
    col: number,
    start: number,
    rows: readonly RowData[],
  ): void {
    const key = column.key;
    if (column.type === "number" || column.type === "currency") {
      const nums = new Float64Array(rows.length);
      for (let r = 0; r < rows.length; r++) nums[r] = toNumber(rows[r]![key]);
      this.wasm.setColumnNumbers(handle, col, start, nums, 0);
    } else {
      const strs: string[] = new Array(rows.length);
      for (let r = 0; r < rows.length; r++) strs[r] = toText(rows[r]![key]);
      this.wasm.setColumnStrings(handle, col, start, strs, 0);
    }
  }

  private loadColumnar(sheet: SheetId, data: ColumnarData): void {
    const handle = this.handleOf(sheet);
    const columns = this.sheetMeta(sheet).columns;
    let loadedFormulas = false;
    for (let c = 0; c < columns.length; c++) {
      const column = columns[c]!;
      const source = data.columns[column.key];
      if (!source) continue;
      if (column.type === "number" || column.type === "currency") {
        if (source instanceof Float64Array) {
          this.wasm.setColumnNumbers(handle, c, 0, source.subarray(0, data.rowCount), 0);
          continue;
        }

        const nums = new Float64Array(data.rowCount);
        for (let r = 0; r < data.rowCount; r++) nums[r] = toNumber(source[r]);
        this.wasm.setColumnNumbers(handle, c, 0, nums, 0);
      } else {
        const stringSource = stringArrayForRows(source, data.rowCount);
        if (stringSource) {
          this.loadPackedStrings(handle, c, stringSource);
          continue;
        }

        const strs: string[] = new Array(data.rowCount);
        for (let r = 0; r < data.rowCount; r++) strs[r] = toText(source[r]);
        this.loadPackedStrings(handle, c, strs);
      }

      // Formula CellValues ride the bulk scalar pass as placeholders, then
      // land individually so the calc engine parses and tracks them —
      // honoring the ColumnarData contract for `{ kind: "formula" }` entries.
      if (Array.isArray(source)) {
        for (let r = 0; r < data.rowCount; r++) {
          const value = source[r];
          if (value && typeof value === "object" && value.kind === "formula") {
            this.formulaSrc.set(cellKey({ sheet, row: r, col: c }), value.src);
            this.wasm.setFormula(handle, r, c, value.src, 0);
            loadedFormulas = true;
          }
        }
      }
    }

    // Same barrier a transaction ends with: evaluate everything just ingested.
    if (loadedFormulas) this.wasm.recompute(handle);
  }

  /**
   * Ship one text column as a single concatenated buffer plus per-row UTF-16
   * lengths: one boundary string decode instead of one per row, which
   * dominates text-column ingest cost at scale.
   */
  private loadPackedStrings(handle: number, col: number, values: readonly string[]): void {
    const lens = new Uint32Array(values.length);
    for (let r = 0; r < values.length; r++) lens[r] = values[r]!.length;
    this.wasm.setColumnStringsPacked(handle, col, 0, values.join(""), lens, 0);
  }
}

function stringArrayForRows(
  source: ArrayLike<CellScalar | CellValue>,
  rowCount: number,
): string[] | null {
  if (!Array.isArray(source) || source.length < rowCount) return null;
  for (let i = 0; i < rowCount; i++) {
    if (typeof source[i] !== "string") return null;
  }
  return source.length === rowCount ? source : source.slice(0, rowCount);
}

function integerAt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function positiveCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function uniqueColumnKeys(columns: readonly Column[]): boolean {
  const keys = new Set<string>();
  for (const column of columns) {
    if (!column.key || keys.has(column.key)) return false;
    keys.add(column.key);
  }
  return true;
}

function normalizedRange(range: Range): Range {
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

function normalizeMerge(merge: MergeRange): MergeRange {
  return {
    r0: Math.min(merge.r0, merge.r1),
    c0: Math.min(merge.c0, merge.c1),
    r1: Math.max(merge.r0, merge.r1),
    c1: Math.max(merge.c0, merge.c1),
  };
}

function validMerge(sheet: Sheet, merge: MergeRange): boolean {
  return (
    [merge.r0, merge.c0, merge.r1, merge.c1].every(integerAt) &&
    merge.r0 <= merge.r1 &&
    merge.c0 <= merge.c1 &&
    merge.r1 < sheet.rowCount &&
    merge.c1 < sheet.columns.length &&
    (merge.r0 !== merge.r1 || merge.c0 !== merge.c1)
  );
}

function mergesOverlap(left: MergeRange, right: MergeRange): boolean {
  return left.r0 <= right.r1 && right.r0 <= left.r1 && left.c0 <= right.c1 && right.c0 <= left.c1;
}

function sameMerge(left: MergeRange, right: MergeRange): boolean {
  const normalized = normalizeMerge(left);
  return (
    normalized.r0 === right.r0 &&
    normalized.c0 === right.c0 &&
    normalized.r1 === right.r1 &&
    normalized.c1 === right.c1
  );
}

function mergeCrossesFreeze(sheet: Sheet, merge: MergeRange): boolean {
  const frozenRows = sheet.frozenRows ?? 0;
  const frozenCols = sheet.frozenCols ?? 0;
  return (
    (merge.r0 < frozenRows && merge.r1 >= frozenRows) ||
    (merge.c0 < frozenCols && merge.c1 >= frozenCols)
  );
}

function validConditionalRules(sheet: Sheet, rules: readonly ConditionalFormatRule[]): boolean {
  return rules.every((rule) => {
    if (rule.range.sheet !== sheet.id) return false;
    const range = normalizedRange(rule.range);
    return (
      integerAt(range.start.row) &&
      integerAt(range.start.col) &&
      range.end.row < sheet.rowCount &&
      range.end.col < sheet.columns.length
    );
  });
}

function validValidationRules(sheet: Sheet, rules: readonly DataValidationRule[]): boolean {
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
          condition.min > condition.max)
      ) {
        return false;
      }
    } else if (condition.kind === "textLength") {
      if (
        (condition.min !== undefined && !integerAt(condition.min)) ||
        (condition.max !== undefined && !integerAt(condition.max)) ||
        (condition.min !== undefined &&
          condition.max !== undefined &&
          condition.min > condition.max)
      ) {
        return false;
      }
    } else if (condition.kind !== "checkbox") {
      return false;
    }
  }
  return true;
}

function validProtectedRanges(sheet: Sheet, ranges: readonly ProtectedRange[]): boolean {
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

function validNotes(sheet: Sheet): boolean {
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

function validSortAndFilters(
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

function patchSheetId(patch: DocumentOp): SheetId | null {
  switch (patch.op) {
    case "set":
    case "setNote":
      return patch.addr.sheet;
    case "setRange":
    case "setBlock":
    case "setRangeStyle":
    case "clearRange":
      return patch.range.sheet;
    case "setNamedRange":
    case "removeNamedRange":
      return null;
    case "addSheet":
      return patch.sheet.id;
    default:
      return patch.sheet;
  }
}

function cellRange(addr: CellAddress): Range {
  return {
    sheet: addr.sheet,
    start: { row: addr.row, col: addr.col },
    end: { row: addr.row, col: addr.col },
  };
}

function fullSheetRange(sheet: Sheet): Range {
  return {
    sheet: sheet.id,
    start: { row: 0, col: 0 },
    end: { row: sheet.rowCount - 1, col: sheet.columns.length - 1 },
  };
}

function rangesIntersect(left: Range, right: Range): boolean {
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

function rangeContains(range: Range, addr: CellAddress): boolean {
  if (range.sheet !== addr.sheet) return false;
  const normalized = normalizedRange(range);
  return (
    addr.row >= normalized.start.row &&
    addr.row <= normalized.end.row &&
    addr.col >= normalized.start.col &&
    addr.col <= normalized.end.col
  );
}

function rebaseRangeRows<T extends { range: Range }>(
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

function rebaseRangeCols<T extends { range: Range }>(
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

function validationAccepts(rule: DataValidationRule, value: CellScalar): boolean {
  if (value === null && (rule.allowBlank ?? true)) return true;
  const condition = rule.condition;
  if (condition.kind === "list") {
    return (
      condition.allowCustom === true || condition.values.some((item) => Object.is(item, value))
    );
  }
  if (condition.kind === "checkbox") {
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    return Object.is(value, checked) || Object.is(value, unchecked);
  }
  if (condition.kind === "textLength") {
    if (typeof value !== "string") return false;
    return (
      (condition.min === undefined || value.length >= condition.min) &&
      (condition.max === undefined || value.length <= condition.max)
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return (
    (condition.min === undefined || value >= condition.min) &&
    (condition.max === undefined || value <= condition.max)
  );
}

function validationMessage(rule: DataValidationRule): string {
  switch (rule.condition.kind) {
    case "list":
      return "Value must match one of the allowed options";
    case "number":
      return "Value must be within the allowed numeric range";
    case "date":
      return "Date must be within the allowed range";
    case "textLength":
      return "Text length is outside the allowed range";
    case "checkbox":
      return "Value must be a valid checkbox state";
  }
}

function remapSpan(
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

function moveIndex(index: number, from: number, count: number, to: number): number {
  if (index >= from && index < from + count) return to + index - from;
  const removed = index < from ? index : index - count;
  return removed >= to ? removed + count : removed;
}

function conditionalRulesSignature(rules: readonly ConditionalFormatRule[]): string {
  let signature = String(rules.length);

  for (const rule of rules) {
    const r0 = Math.min(rule.range.start.row, rule.range.end.row);
    const c0 = Math.min(rule.range.start.col, rule.range.end.col);
    const r1 = Math.max(rule.range.start.row, rule.range.end.row);
    const c1 = Math.max(rule.range.start.col, rule.range.end.col);
    signature += `|${r0},${c0},${r1},${c1}`;

    const when = rule.when;
    if (when.kind === "greaterThan" || when.kind === "lessThan") {
      signature += `|${when.kind}:${when.value}`;
    } else if (when.kind === "equal") {
      const value = when.value;
      signature +=
        typeof value === "string" ? `|equal:s${value.length}:${value}` : `|equal:${value}`;
    } else {
      signature += `|contains:${when.matchCase ? 1 : 0}:${when.text.length}:${when.text}`;
    }
  }
  return signature;
}

function dataCellValue(value: DataCell | undefined): CellScalar | CellValue | undefined {
  if (value && typeof value === "object" && !("kind" in value) && "value" in value) {
    return value.value;
  }
  return value;
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
