import { CellStore, type WindowView } from "@sheetwrite/wasm";
import { cellKey, type LiteralLookup, ReferenceGraph } from "./reference";
import { StyleDictionary } from "./style-dictionary";
import type {
  AggregateOp,
  CellAddress,
  CellScalar,
  CellValue,
  ChangeEvent,
  Column,
  ColumnarData,
  Patch,
  ResolvedCell,
  RowData,
  SheetId,
  Store,
  Transaction,
  VisibleWindowView,
  Workbook,
} from "./types";

// Mirror of the WASM cell tags.
const KIND_NUMBER = 1;
const KIND_STRING = 2;
const KIND_FORMULA = 4;

const AGG_OP: Record<AggregateOp, number> = { sum: 0, avg: 1, min: 2, max: 3, count: 4 };

type ChangeListener = (event: ChangeEvent) => void;

type RecomputingCellStore = CellStore & {
  recompute(sheet: number): void;
  setSheetName(sheet: number, id: string, name: string): void;
};

type ConsumingWindowView = WindowView & {
  takeKinds(): Uint8Array;
  takeNumbers(): Float64Array;
  takeStringIndex(): Int32Array;
  takeStyleIds(): Uint32Array;
  takeStrings(): string[];
};

function literalOf(value: CellScalar): CellValue {
  return { kind: "literal", value };
}

/**
 * JS facade over the Rust/WASM columnar store. Heavy data lives in WASM linear
 * memory; this object holds workbook metadata, the style dictionary, dirty
 * tracking, and the transaction barrier. The render hot path goes through
 * `getVisibleWindow` (one bulk read), never `getCell`.
 */
export class SheetwriteStore implements Store {
  private readonly wasm: RecomputingCellStore;
  private readonly workbook: Workbook;
  private readonly handles = new Map<SheetId, number>();
  private readonly styles = new StyleDictionary();
  private readonly listeners = new Set<ChangeListener>();
  private dirty: Patch[] = [];
  private epoch = 0;
  private readonly refs = new ReferenceGraph();
  private readonly refIndex = new Map<SheetId, Map<number, Map<number, string>>>();
  private readonly viewOrder = new Map<SheetId, Uint32Array>();
  private readonly viewRowIndex = new Map<SheetId, Map<number, number>>();
  private readonly colsU32Cache = new WeakMap<ReadonlyArray<number>, Uint32Array>();
  private windowValuesScratch: CellScalar[] = [];
  private readonly formulaSrc = new Map<string, string>();

  constructor(workbook: Workbook, data?: ColumnarData) {
    this.workbook = workbook;
    this.wasm = new CellStore() as RecomputingCellStore;
    for (const sheet of workbook.sheets) {
      const handle = this.wasm.addSheet(sheet.columns.length, sheet.rowCount);
      this.wasm.setSheetName(handle, sheet.id, sheet.name);
      this.handles.set(sheet.id, handle);
    }
    if (data) this.loadColumnar(workbook.activeSheet, data);
  }

  private handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw new Error(`unknown sheet: ${sheet}`);
    return handle;
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

  /** Replace a sheet's view order and drop its stale inverse lookup. */
  private setViewOrder(sheet: SheetId, order: Uint32Array): void {
    this.viewOrder.set(sheet, order);
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
    return this.windowValuesScratch;
  }

  getWorkbook(): Workbook {
    return this.workbook;
  }

  private rawCell(addr: CellAddress): ResolvedCell {
    const cell = this.wasm.getCell(this.handleOf(addr.sheet), addr.row, addr.col);
    let resolved: CellScalar = null;
    if (cell.kind === KIND_NUMBER || cell.kind === KIND_FORMULA) resolved = cell.num;
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
    const handle = this.handleOf(sheet);
    const colsU32 = this.colsU32For(cols);
    const order = this.viewOrder.get(sheet);

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
    const stringIndex = view.takeStringIndex();
    const styleIds = view.takeStyleIds();
    const strings = view.takeStrings();
    view.free();

    const nCols = cols.length;
    const values = this.windowValuesFor(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) {
        values[i] = numbers[i] ?? null;
      } else if (kinds[i] === KIND_STRING) {
        const stringSlot = stringIndex[i] ?? -1;
        values[i] = stringSlot >= 0 ? (strings[stringSlot] ?? null) : null;
      } else {
        values[i] = null;
      }
    }

    // Overlay plain references (keyed by DATA row) with cached resolved values.
    const sheetRefs = this.refIndex.get(sheet);
    if (sheetRefs && nCols > 0) {
      const nRows = kinds.length / nCols;
      for (let ri = 0; ri < nRows; ri++) {
        const dataRow = dataRows ? dataRows[ri]! : rows.start + ri;
        const rowRefs = sheetRefs.get(dataRow);
        if (!rowRefs) continue;
        for (let cj = 0; cj < nCols; cj++) {
          const key = rowRefs.get(cols[cj]!);
          if (key) values[ri * nCols + cj] = this.refs.resolved(key);
        }
      }
    }

    return {
      sheet,
      rows: { start: rows.start, end: rows.end },
      cols,
      values,
      styleIds,
      styles: this.styles.table,
    };
  }

  aggregate(sheet: SheetId, col: number, op: AggregateOp): number {
    return this.wasm.aggregate(this.handleOf(sheet), col, AGG_OP[op]);
  }

  sortBy(sheet: SheetId, col: number, ascending: boolean): void {
    this.setViewOrder(sheet, this.wasm.sortRows(this.handleOf(sheet), col, ascending));
  }

  filterBy(sheet: SheetId, col: number, needle: string): void {
    this.setViewOrder(sheet, this.wasm.filterRows(this.handleOf(sheet), col, needle));
  }

  /** Cells whose text matches `query`, scanned in WASM and returned row-major. */
  searchCells(
    sheet: SheetId,
    query: string,
    opts: { matchCase?: boolean; wholeCell?: boolean; columns?: number[] } = {},
  ): CellAddress[] {
    const handle = this.handleOf(sheet);
    const columns = opts.columns ?? this.sheetMeta(sheet).columns.map((_, i) => i);
    const flat = this.wasm.search(
      handle,
      Uint32Array.from(columns),
      query,
      !opts.matchCase,
      opts.wholeCell ?? false,
    );

    const out: CellAddress[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push({ sheet, row: flat[i]!, col: flat[i + 1]! });
    }
    return out;
  }

  clearView(sheet: SheetId): void {
    this.viewOrder.delete(sheet);
    this.viewRowIndex.delete(sheet);
  }

  viewRowCount(sheet: SheetId): number {
    return this.viewOrder.get(sheet)?.length ?? this.sheetMeta(sheet).rowCount;
  }

  hasView(sheet: SheetId): boolean {
    return this.viewOrder.has(sheet);
  }

  applyTransaction(tx: Transaction): void {
    // Non-reentrant barrier: a stale epoch is rejected outright (the app
    // rebases on the change stream and resubmits).
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) return;

    const changes: ChangeEvent["changes"] = [];
    const appliedPatches: Patch[] = [];
    const touchedSheets = new Set<SheetId>();

    for (const patch of tx.patches) {
      if (patch.op === "set" && !this.isCellInBounds(patch.addr)) continue;

      this.applyPatch(patch, changes);
      appliedPatches.push(patch);

      if (patch.op === "set") {
        touchedSheets.add(patch.addr.sheet);
      } else if (patch.op === "addRows" || patch.op === "removeRows") {
        touchedSheets.add(patch.sheet);
      }
    }

    if (appliedPatches.length === 0) return;

    for (const sheet of touchedSheets) {
      this.wasm.recompute(this.handleOf(sheet));
    }

    this.dirty.push(...appliedPatches);
    this.epoch += 1;

    const transaction =
      appliedPatches.length === tx.patches.length ? tx : { ...tx, patches: appliedPatches };

    const event: ChangeEvent = {
      transaction,
      changes,
      dirty: [...this.dirty],
      epoch: this.epoch,
    };
    for (const fn of this.listeners) fn(event);
  }

  private applyPatch(patch: Patch, changes: ChangeEvent["changes"]): void {
    switch (patch.op) {
      case "set": {
        const before = this.getCell(patch.addr);
        const styleId = this.styles.intern(patch.style);
        const handle = this.handleOf(patch.addr.sheet);
        const { sheet, row, col } = patch.addr;
        const key = cellKey(patch.addr);
        const literalAt: LiteralLookup = (a) => this.rawCell(a).resolved;

        if (patch.value.kind === "formula") {
          if (this.refs.isRef(key)) {
            this.refs.removeRef(key);
            this.clearRefIndex(sheet, row, col);
          }
          this.formulaSrc.set(key, patch.value.src);
          this.wasm.setFormula(handle, row, col, patch.value.src, styleId);
        } else if (patch.value.kind === "ref") {
          // ref cells hold no literal in WASM; keep the style, track the edge.
          this.wasm.clearCell(handle, row, col, styleId);
          this.setRefIndex(sheet, row, col, key);
          this.formulaSrc.delete(key);
          this.refs.setRef(patch.addr, patch.value.target, literalAt);
        } else {
          if (this.refs.isRef(key)) {
            this.refs.removeRef(key);
            this.clearRefIndex(sheet, row, col);
          }
          const value = patch.value.value;
          if (typeof value === "number") this.wasm.setNumber(handle, row, col, value, styleId);
          else if (typeof value === "string") this.wasm.setString(handle, row, col, value, styleId);
          else this.wasm.clearCell(handle, row, col, styleId);
          this.formulaSrc.delete(key);
          this.refs.onLiteralChanged(key, literalAt);
        }

        changes.push({
          addr: patch.addr,
          oldValue: literalOf(before.resolved),
          newValue: patch.value,
          oldStyle: before.style,
          newStyle: patch.style,
        });
        break;
      }
      case "addRows": {
        this.wasm.addRows(this.handleOf(patch.sheet), patch.at, patch.count);
        this.sheetMeta(patch.sheet).rowCount += patch.count;
        break;
      }
      case "removeRows": {
        this.wasm.removeRows(this.handleOf(patch.sheet), patch.at, patch.count);
        const meta = this.sheetMeta(patch.sheet);
        meta.rowCount = Math.max(0, meta.rowCount - patch.count);
        break;
      }
      case "setColumn": {
        const meta = this.sheetMeta(patch.sheet);
        const col = meta.columns[patch.col];
        if (col) meta.columns[patch.col] = { ...col, ...patch.patch };
        break;
      }
    }
  }

  private setRefIndex(sheet: SheetId, row: number, col: number, key: string): void {
    let bySheet = this.refIndex.get(sheet);
    if (!bySheet) {
      bySheet = new Map();
      this.refIndex.set(sheet, bySheet);
    }
    let byRow = bySheet.get(row);
    if (!byRow) {
      byRow = new Map();
      bySheet.set(row, byRow);
    }
    byRow.set(col, key);
  }

  private clearRefIndex(sheet: SheetId, row: number, col: number): void {
    this.refIndex.get(sheet)?.get(row)?.delete(col);
  }

  on(_evt: "change", fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getDirty(): Patch[] {
    return [...this.dirty];
  }

  markClean(patches: Patch[]): void {
    this.dirty = this.dirty.filter((p) => !patches.includes(p));
  }

  /** Bulk-load datasource/in-memory rows into a sheet. Not an edit; emits nothing. */
  loadRows(sheet: SheetId, start: number, rows: readonly RowData[]): void {
    if (rows.length === 0) return;
    const handle = this.handleOf(sheet);
    const columns = this.sheetMeta(sheet).columns;
    for (let c = 0; c < columns.length; c++) {
      this.loadColumnBlock(handle, columns[c]!, c, start, rows);
    }
  }

  private loadColumnBlock(
    handle: number,
    column: Column,
    col: number,
    start: number,
    rows: readonly RowData[],
  ): void {
    const key = column.key;
    if (column.type === "number") {
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
    for (let c = 0; c < columns.length; c++) {
      const column = columns[c]!;
      const source = data.columns[column.key];
      if (!source) continue;
      if (column.type === "number") {
        const nums = new Float64Array(data.rowCount);
        for (let r = 0; r < data.rowCount; r++) nums[r] = toNumber(source[r]);
        this.wasm.setColumnNumbers(handle, c, 0, nums, 0);
      } else {
        const strs: string[] = new Array(data.rowCount);
        for (let r = 0; r < data.rowCount; r++) strs[r] = toText(source[r]);
        this.wasm.setColumnStrings(handle, c, 0, strs, 0);
      }
    }
  }
}

function toNumber(value: CellScalar | CellValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : Number.NaN;
  }
  if (value && typeof value === "object" && value.kind === "literal") return toNumber(value.value);
  return Number.NaN;
}

function toText(value: CellScalar | CellValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && value.kind === "literal") return toText(value.value);
  return "";
}
