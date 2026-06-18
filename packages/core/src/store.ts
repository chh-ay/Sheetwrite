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
  private readonly wasm: CellStore;
  private readonly workbook: Workbook;
  private readonly handles = new Map<SheetId, number>();
  private readonly styles = new StyleDictionary();
  private readonly listeners = new Set<ChangeListener>();
  private dirty: Patch[] = [];
  private epoch = 0;
  private readonly refs = new ReferenceGraph();
  private readonly refIndex = new Map<SheetId, Map<number, Map<number, string>>>();
  private readonly viewOrder = new Map<SheetId, Uint32Array>();
  private readonly formulaSrc = new Map<string, string>();

  constructor(workbook: Workbook, data?: ColumnarData) {
    this.workbook = workbook;
    this.wasm = new CellStore();
    for (const sheet of workbook.sheets) {
      const handle = this.wasm.addSheet(sheet.columns.length, sheet.rowCount);
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

  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView {
    const handle = this.handleOf(sheet);
    const colsU32 = Uint32Array.from(cols);
    const order = this.viewOrder.get(sheet);

    let view: WindowView;
    let dataRows: Uint32Array | null = null;
    if (order) {
      dataRows = order.subarray(rows.start, Math.min(rows.end, order.length));
      view = this.wasm.getWindowRows(handle, dataRows, colsU32);
    } else {
      view = this.wasm.getWindow(handle, rows.start, rows.end, colsU32);
    }

    const kinds = view.kinds;
    const numbers = view.numbers;
    const stringIndex = view.stringIndex;
    const styleIds = view.styleIds;
    const strings = view.strings;
    view.free();

    const nCols = cols.length;
    const values: CellScalar[] = new Array(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] === KIND_NUMBER) values[i] = numbers[i]!;
      else if (kinds[i] === KIND_STRING) values[i] = strings[stringIndex[i]!] ?? null;
      else values[i] = null;
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
    this.viewOrder.set(sheet, this.wasm.sortRows(this.handleOf(sheet), col, ascending));
  }

  filterBy(sheet: SheetId, col: number, needle: string): void {
    this.viewOrder.set(sheet, this.wasm.filterRows(this.handleOf(sheet), col, needle));
  }

  clearView(sheet: SheetId): void {
    this.viewOrder.delete(sheet);
  }

  viewRowCount(sheet: SheetId): number {
    return this.viewOrder.get(sheet)?.length ?? this.sheetMeta(sheet).rowCount;
  }

  applyTransaction(tx: Transaction): void {
    // Non-reentrant barrier: a stale epoch is rejected outright (the app
    // rebases on the change stream and resubmits).
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) return;

    const changes: ChangeEvent["changes"] = [];
    for (const patch of tx.patches) {
      this.applyPatch(patch, changes);
    }
    this.dirty.push(...tx.patches);
    this.epoch += 1;

    const event: ChangeEvent = {
      transaction: tx,
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
