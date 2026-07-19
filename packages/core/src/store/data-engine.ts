import { CellStore, isLoaded, type RangeSnapshot } from "@sheetwrite/wasm";
import { parseCellLiteralInput } from "../cell-input.js";
import { dateToSerial } from "../date-serial.js";
import { cellKey, type LiteralLookup, parseCellKey, ReferenceGraph } from "../reference.js";
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

const DEFAULT_PAGED_CACHE_BYTES = 32 * 1024 * 1024;
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
}

export interface SheetwriteStoreOptions {
  storage?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
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

export interface StoreDataEngineEffects {
  readonly appliedPatches: DocumentOp[];
  readonly changes: ChangeEvent["changes"] | null;
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
  private readonly refs = new ReferenceGraph((addr, value) => this.writeRefShadow(addr, value));
  private readonly formulaSrc = new Map<string, string>();
  private readonly view: StoreViewState;
  private readonly windowReader: StoreWindowReader;
  private readonly snapshotCodec: StoreSnapshotCodec;
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
  };

  constructor(workbook: Workbook, data?: ColumnarData, options: SheetwriteStoreOptions = {}) {
    if (!isLoaded()) {
      throw new Error("Sheetwrite: await initSheetwrite() before constructing SheetwriteStore");
    }
    if (data && options.storage === "paged") {
      throw new Error("Sheetwrite: ColumnarData requires dense storage");
    }
    this.workbook = workbook;
    this.storageOptions = options;
    this.wasm = new CellStore() as RecomputingCellStore;
    this.view = new StoreViewState(this.wasm, workbook, this.handles);
    this.windowReader = new StoreWindowReader(this.wasm, workbook, this.handles, this.styles);
    this.snapshotCodec = new StoreSnapshotCodec(
      workbook,
      this.windowReader,
      this.formulaSrc,
      this.refs,
    );
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

  private noteRangeMutationFfi(transferredArrayLength = 0): void {
    this.rangeMutationStats.ffiCalls += 1;
    this.rangeMutationStats.maxTransferredArrayLength = Math.max(
      this.rangeMutationStats.maxTransferredArrayLength,
      transferredArrayLength,
    );
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
        this.rangeMutationStats.historyMaterializations += 1;
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
    return this.windowReader.read(sheet, rows, cols, this.view.order(sheet), true);
  }

  getDataWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    return this.windowReader.read(sheet, rows, cols, undefined, false);
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
      formulas,
      refs,
      ffiCalls: window.ffiCalls ?? 0,
      transferredElements:
        window.values.length +
        window.styleIds.length +
        dataRows.length +
        window.styles.length +
        formulas.length * 2 +
        refs.length * 4,
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
      if (remoteLoad) this.wasm.endPageLoad();
    }

    if (appliedPatches.length === 0) return { appliedPatches, changes };
    this.rangeMutationStats.documentOperations += appliedPatches.length;
    this.rangeMutationStats.jsPatchObjects += appliedPatches.length;

    if (hasStructuralPatch) {
      this.syncFormulaSources();
      for (const sheet of this.workbook.sheets) {
        this.noteRangeMutationFfi();
        this.wasm.recompute(this.handleOf(sheet.id));
      }
    } else {
      for (const sheet of touchedSheets) {
        this.noteRangeMutationFfi();
        this.wasm.recompute(this.handleOf(sheet));
      }
    }
    if (this.refs.hasRefs()) {
      this.refs.refreshAll((addr) => this.rawCell(addr).resolved);
    }
    return { appliedPatches, changes };
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
          this.noteRangeMutationFfi();
          this.wasm.setFormula(handle, row, col, patch.value.src, styleId);
        } else if (patch.value.kind === "ref") {
          const key = cellKey(patch.addr);
          const literalAt: LiteralLookup = (a) => this.rawCell(a).resolved;
          this.noteRangeMutationFfi();
          this.wasm.clearCell(handle, row, col, styleId);
          this.formulaSrc.delete(key);
          this.refs.setRef(patch.addr, patch.value.target, literalAt);
        } else {
          const hasRefs = this.refs.hasRefs();
          const hasFormulaSources = this.formulaSrc.size > 0;
          const key = hasRefs || hasFormulaSources ? cellKey(patch.addr) : undefined;
          if (key && hasRefs) this.refs.removeRef(key);
          const value = patch.value.value;
          this.noteRangeMutationFfi();
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
        this.rangeMutationStats.jsPatchObjects += patch.cells.length;
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
        this.rangeMutationStats.jsPatchObjects += exceptions.length;
        this.noteRangeMutationFfi(cellCount);
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
        const clearContents = patch.contents ?? true;
        const clearStyle = patch.style ?? true;
        if (clearContents) this.clearHostValuesInRange(bounds);
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
      visibility: snapshot.visibility,
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
    this.windowReader.conditionalRulesChanged(snapshot.id);
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
    this.view.columnsChanged(sheet);
    this.rebaseFormulaSourceCols(sheet, remap);

    const literalAt: LiteralLookup = (addr) => this.rawCell(addr).resolved;
    this.refs.rebaseCols(sheet, remap, literalAt);
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
      const protectedByColumn: Uint32Array[] = Array.from(
        { length: columns.length },
        () => EMPTY_U32,
      );
      if (protect) {
        const address: CellAddress = { sheet, row: start, col: 0 };
        for (let col = 0; col < columns.length; col++) {
          const offsets: number[] = [];
          address.col = col;
          for (let offset = 0; offset < rows.length; offset++) {
            address.row = start + offset;
            if (protect(address)) offsets.push(offset);
          }
          if (offsets.length > 0) protectedByColumn[col] = Uint32Array.from(offsets);
        }
      }

      this.clearHydratedMetadata(handle, sheet, start, rows.length, protectedByColumn);
      const exceptions: DocumentOp[] = [];
      for (let col = 0; col < columns.length; col++) {
        this.hydratePageColumn(
          handle,
          sheet,
          columns[col]!,
          col,
          start,
          rows,
          protectedByColumn[col]!,
          exceptions,
        );
      }

      for (const patch of exceptions) this.applyPatch(patch, null);
      this.wasm.recompute(handle);
      if (this.refs.hasRefs()) {
        this.refs.refreshAll((addr) => this.rawCell(addr).resolved);
      }
    } finally {
      this.wasm.endPageLoad();
    }
  }

  hydrateSnapshot(snapshot: WorkbookSnapshot): void {
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
      this.windowReader.conditionalRulesChanged(sheet.id);
      this.wasm.recompute(handle);
    }
    if (this.refs.hasRefs()) {
      this.refs.refreshAll((addr) => this.rawCell(addr).resolved);
    }
  }

  /** Release the WASM-side cell store immediately; the store is unusable afterwards. */
  dispose(): void {
    this.wasm.free();
  }

  private clearHydratedMetadata(
    handle: number,
    sheet: SheetId,
    start: number,
    rowCount: number,
    protectedByColumn: readonly Uint32Array[],
  ): void {
    const end = start + rowCount;
    for (const key of this.formulaSrc.keys()) {
      const address = parseCellKey(key);
      if (
        address.sheet !== sheet ||
        address.row < start ||
        address.row >= end ||
        address.col >= protectedByColumn.length
      ) {
        continue;
      }
      const offset = address.row - start;
      if (
        hasSortedOffset(protectedByColumn[address.col]!, offset) ||
        this.wasm.cellState(handle, address.row, address.col) === 3
      ) {
        continue;
      }
      this.formulaSrc.delete(key);
    }
    for (const [address] of this.refs.entries()) {
      if (
        address.sheet !== sheet ||
        address.row < start ||
        address.row >= end ||
        address.col >= protectedByColumn.length
      ) {
        continue;
      }
      const offset = address.row - start;
      if (
        hasSortedOffset(protectedByColumn[address.col]!, offset) ||
        this.wasm.cellState(handle, address.row, address.col) === 3
      ) {
        continue;
      }
      this.refs.removeRef(cellKey(address));
    }
  }

  private hydratePageColumn(
    handle: number,
    sheet: SheetId,
    column: Column,
    col: number,
    start: number,
    rows: readonly RowData[],
    protectedOffsets: Uint32Array,
    exceptions: DocumentOp[],
  ): void {
    const key = column.key;
    const numeric = column.type === "number" || column.type === "currency";
    const numbers = numeric ? new Float64Array(rows.length) : undefined;
    const texts = numeric ? undefined : new Array<string>(rows.length);
    const utf16Lens = numeric ? undefined : new Uint32Array(rows.length);

    for (let offset = 0; offset < rows.length; offset++) {
      const dataCell = rows[offset]![key];
      if (numbers) {
        numbers[offset] = toNumber(dataCell);
      } else {
        const text = toText(dataCell);
        texts![offset] = text;
        utf16Lens![offset] = text.length;
      }

      const wrapped =
        dataCell && typeof dataCell === "object" && !("kind" in dataCell) && "value" in dataCell
          ? dataCell
          : undefined;
      const value = dataCellValue(dataCell);
      const exceptional =
        wrapped?.style !== undefined ||
        (value && typeof value === "object" && (value.kind === "formula" || value.kind === "ref"));
      if (
        !exceptional ||
        hasSortedOffset(protectedOffsets, offset) ||
        this.wasm.cellState(handle, start + offset, col) === 3
      ) {
        continue;
      }
      const cellValue: CellValue =
        value && typeof value === "object" ? value : { kind: "literal", value: value ?? null };
      exceptions.push({
        op: "set",
        addr: { sheet, row: start + offset, col },
        value: cellValue,
        style: wrapped?.style,
      });
    }

    if (numbers) {
      this.wasm.hydratePageNumbers(handle, col, start, numbers, 0, protectedOffsets);
    } else {
      this.wasm.hydratePageStringsPacked(
        handle,
        col,
        start,
        texts!.join(""),
        utf16Lens!,
        0,
        protectedOffsets,
      );
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
      const numericColumn =
        column.type === "number" || column.type === "currency" || column.type === "date";
      if (numericColumn) {
        if (source instanceof Float64Array) {
          this.wasm.setColumnNumbers(handle, c, 0, source.subarray(0, data.rowCount), 0);
          continue;
        }

        const nums = new Float64Array(data.rowCount);
        for (let r = 0; r < data.rowCount; r++) {
          const value = columnarScalar(source[r], column.type);
          nums[r] = typeof value === "number" ? value : Number.NaN;
        }
        this.wasm.setColumnNumbers(handle, c, 0, nums, 0);
      } else {
        const stringSource = stringArrayForRows(source, data.rowCount);
        if (stringSource) {
          this.loadPackedStrings(handle, c, stringSource);
        } else {
          const strs: string[] = new Array(data.rowCount);
          for (let r = 0; r < data.rowCount; r++) strs[r] = toText(source[r]);
          this.loadPackedStrings(handle, c, strs);
        }
      }

      // Bulk columns carry homogeneous numeric/text values. Restore mixed
      // booleans and inert text in numeric/date columns, clear canonical blanks,
      // and land formulas individually so the engine tracks their sources.
      for (let r = 0; r < data.rowCount; r++) {
        const value = columnarScalar(source[r], column.type);
        if (value && typeof value === "object") {
          if (value.kind === "formula") {
            this.formulaSrc.set(cellKey({ sheet, row: r, col: c }), value.src);
            this.wasm.setFormula(handle, r, c, value.src, 0);
            loadedFormulas = true;
          }
          continue;
        }
        if (typeof value === "boolean") {
          this.wasm.setBool(handle, r, c, value, 0);
        } else if (numericColumn && typeof value === "string") {
          this.wasm.setString(handle, r, c, value, 0);
        } else if (value === null || value === undefined) {
          this.wasm.clearCell(handle, r, c, 0);
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

function hasSortedOffset(offsets: Uint32Array, target: number): boolean {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const value = offsets[mid]!;
    if (value < target) lo = mid + 1;
    else hi = mid;
  }
  return offsets[lo] === target;
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
