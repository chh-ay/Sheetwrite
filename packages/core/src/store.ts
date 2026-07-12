import { CellStore, isLoaded, type WindowView } from "@sheetwrite/wasm";
import { cellKey, type LiteralLookup, parseCellKey, ReferenceGraph } from "./reference.js";
import { StyleDictionary } from "./style-dictionary.js";
import type {
  AggregateOp,
  ApplyTransactionResult,
  CellAddress,
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
  Patch,
  ResolvedCell,
  RowData,
  RowGroup,
  SheetId,
  SortKey,
  Store,
  Transaction,
  VisibleWindowView,
  Workbook,
} from "./types.js";

// Mirror of the WASM cell tags.
const KIND_NUMBER = 1;
const KIND_STRING = 2;
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

type ChangeListener = (event: ChangeEvent) => void;

type RecomputingCellStore = CellStore & {
  recompute(sheet: number): void;
  setSheetName(sheet: number, id: string, name: string): void;
  insertCols(sheet: number, at: number, count: number): void;
  formulaSource(sheet: number, row: number, col: number): string | undefined;
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
  private readonly refs = new ReferenceGraph((addr, value) => this.writeRefShadow(addr, value));
  private readonly viewOrder = new Map<SheetId, Uint32Array>();
  private readonly viewRowIndex = new Map<SheetId, Map<number, number>>();
  private readonly viewState = new Map<SheetId, ViewState>();
  private readonly colsU32Cache = new WeakMap<ReadonlyArray<number>, Uint32Array>();
  private windowValuesScratch: CellScalar[] = [];
  private readonly formulaSrc = new Map<string, string>();
  private readonly stringCache = new Map<number, string>();
  private readonly condRulesSynced = new Map<SheetId, string>();

  constructor(workbook: Workbook, data?: ColumnarData) {
    if (!isLoaded()) {
      throw new Error("Sheetwrite: await initSheetwrite() before constructing SheetwriteStore");
    }
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

  /**
   * Write a plain reference's resolved value into its WASM cell as a derived
   * "shadow" literal, preserving the cell's style. Shadows keep the render
   * window, sort/filter/search, and formula evaluation consistent with the
   * displayed value without a JS overlay pass — the window stays transferable.
   */
  private writeRefShadow(addr: CellAddress, value: CellScalar): void {
    const handle = this.handles.get(addr.sheet);
    if (handle === undefined) return;

    const style = this.wasm.styleIdAt(handle, addr.row, addr.col);
    if (typeof value === "number") this.wasm.setNumber(handle, addr.row, addr.col, value, style);
    else if (typeof value === "string") {
      this.wasm.setString(handle, addr.row, addr.col, value, style);
    } else this.wasm.clearCell(handle, addr.row, addr.col, style);
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
    const hasCondRules = this.syncConditionalRules(sheet, handle);

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
    this.ensureViewState(sheet).sortKeys = keys.map((k) => ({
      col: k.col,
      ascending: k.ascending,
    }));
    this.recomputeView(sheet);
  }

  /**
   * Set (or clear, with `null`) the filter on one column, then recompute. All
   * active column filters AND together.
   */
  setColumnFilter(sheet: SheetId, col: number, filter: ColumnFilter | null): void {
    if (filter === null) {
      const state = this.viewState.get(sheet);
      if (!state?.filters.delete(col)) return;
    } else {
      this.ensureViewState(sheet).filters.set(col, filter);
    }
    this.recomputeView(sheet);
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
      else out[i] = null;
    }
    return out;
  }

  /** Hide the given data rows; they drop out of the view until shown again. */
  hideRows(sheet: SheetId, rows: readonly number[]): void {
    if (rows.length === 0) return;
    const hidden = this.ensureViewState(sheet).hiddenRows;
    for (const row of rows) hidden.add(row);
    this.recomputeView(sheet);
  }

  /** Show hidden rows — the given ones, or every hidden row when omitted. */
  showRows(sheet: SheetId, rows?: readonly number[]): void {
    const state = this.viewState.get(sheet);
    if (!state || state.hiddenRows.size === 0) return;
    if (rows === undefined) state.hiddenRows.clear();
    else for (const row of rows) state.hiddenRows.delete(row);
    this.recomputeView(sheet);
  }

  /** The sheet's explicitly hidden data rows, ascending. */
  hiddenRows(sheet: SheetId): number[] {
    const state = this.viewState.get(sheet);
    if (!state) return [];
    return [...state.hiddenRows].sort((a, b) => a - b);
  }

  /** Add a collapsible row group over the data-row range `[start, end]`. */
  groupRows(sheet: SheetId, start: number, end: number): void {
    this.ensureViewState(sheet).groups.push({ start, end, collapsed: false });
    this.recomputeView(sheet);
  }

  /** Remove the group exactly matching `[start, end]`, if present. */
  ungroupRows(sheet: SheetId, start: number, end: number): void {
    const state = this.viewState.get(sheet);
    if (!state) return;
    const before = state.groups.length;
    state.groups = state.groups.filter((g) => g.start !== start || g.end !== end);
    if (state.groups.length !== before) this.recomputeView(sheet);
  }

  /** Collapse or expand every group that begins at `start`. */
  setGroupCollapsed(sheet: SheetId, start: number, collapsed: boolean): void {
    const state = this.viewState.get(sheet);
    if (!state) return;
    let changed = false;
    for (const group of state.groups) {
      if (group.start === start && group.collapsed !== collapsed) {
        group.collapsed = collapsed;
        changed = true;
      }
    }
    if (changed) this.recomputeView(sheet);
  }

  /** Live view of a sheet's row groups. */
  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.viewState.get(sheet)?.groups ?? EMPTY_GROUPS;
  }

  /**
   * Ctrl+Arrow destination. With an active view order `row` is a VIEW position
   * and the scan runs in view space (`dataEdgeOrdered`): a vertical move returns
   * the destination VIEW position, a horizontal move returns a column index.
   * Without a view it scans data space (`dataEdge`) exactly as before.
   */
  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
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
      state = { sortKeys: [], filters: new Map(), hiddenRows: new Set(), groups: [] };
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

  /**
   * Clear a sheet's column sort and filters. Hidden rows and row groups are
   * deliberately preserved and keep applying — a "clear view" resets the query
   * (sort/filter) without un-hiding rows the user explicitly hid. The order is
   * recomputed so any surviving hidden rows / collapsed groups still apply.
   */
  clearView(sheet: SheetId): void {
    const state = this.viewState.get(sheet);
    if (state) {
      state.sortKeys = [];
      state.filters.clear();
    }
    this.recomputeView(sheet);
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

  /**
   * Public `Store` shape takes one argument (reason defaults to `"api"`);
   * internal producers thread their {@link CommitReason} via the second.
   */
  applyTransaction(tx: Transaction, commitReason: CommitReason = "api"): ApplyTransactionResult {
    // Non-reentrant barrier: a stale epoch is rejected outright (the app
    // rebases on the change stream and resubmits).
    if (tx.epoch !== undefined && tx.epoch !== this.epoch) {
      return { status: "conflict", expectedEpoch: tx.epoch, actualEpoch: this.epoch };
    }

    const hasListeners = this.listeners.size > 0;
    const changes: ChangeEvent["changes"] | null = hasListeners ? [] : null;
    const appliedPatches: Patch[] = [];
    const touchedSheets = new Set<SheetId>();
    let hasStructuralPatch = false;

    for (const patch of tx.patches) {
      if (patch.op === "set" && !this.isCellInBounds(patch.addr)) continue;

      this.applyPatch(patch, changes);
      appliedPatches.push(patch);

      if (patch.op === "set") {
        touchedSheets.add(patch.addr.sheet);
      } else if (
        patch.op === "addRows" ||
        patch.op === "removeRows" ||
        patch.op === "addColumns" ||
        patch.op === "removeColumns"
      ) {
        touchedSheets.add(patch.sheet);
        hasStructuralPatch = true;
      }
    }

    if (appliedPatches.length === 0) {
      return {
        status: "noop",
        epoch: this.epoch,
        reason: tx.patches.length === 0 ? "empty" : "out-of-bounds",
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

    this.dirty.push(...appliedPatches);
    this.epoch += 1;

    const transaction =
      appliedPatches.length === tx.patches.length ? tx : { ...tx, patches: appliedPatches };

    if (!hasListeners) {
      return { status: "applied", epoch: this.epoch, transaction };
    }

    const event: ChangeEvent = {
      transaction,
      changes: changes ?? [],
      dirty: [...this.dirty],
      commitReason,
      epoch: this.epoch,
    };
    for (const fn of this.listeners) fn(event);
    return { status: "applied", epoch: this.epoch, transaction };
  }

  private applyPatch(patch: Patch, changes: ChangeEvent["changes"] | null): void {
    switch (patch.op) {
      case "set": {
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

          // The graph tracks the edge; the resolved value is written through to
          // WASM as a derived shadow literal (style set by clearCell first).
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
        break;
      }
      case "addRows": {
        const { sheet, at, count } = patch;
        this.wasm.addRows(this.handleOf(sheet), at, count);
        this.sheetMeta(sheet).rowCount += count;
        this.rebaseSheetRows(sheet, (row) => (row >= at ? row + count : row));
        break;
      }
      case "removeRows": {
        const { sheet, at, count } = patch;
        this.wasm.removeRows(this.handleOf(sheet), at, count);
        const meta = this.sheetMeta(sheet);
        meta.rowCount = Math.max(0, meta.rowCount - count);
        this.rebaseSheetRows(sheet, (row) =>
          row < at ? row : row < at + count ? null : row - count,
        );
        break;
      }
      case "addColumns": {
        const { sheet, at, columns } = patch;
        if (columns.length === 0) break;
        const meta = this.sheetMeta(sheet);
        const insertAt = Math.min(at, meta.columns.length);
        this.wasm.insertCols(this.handleOf(sheet), insertAt, columns.length);
        meta.columns.splice(insertAt, 0, ...columns);
        this.rebaseSheetCols(sheet, (col) => (col >= insertAt ? col + columns.length : col));
        break;
      }
      case "removeColumns": {
        const { sheet, at, count } = patch;
        const meta = this.sheetMeta(sheet);
        if (count === 0 || at >= meta.columns.length) break;
        const removeCount = Math.min(count, meta.columns.length - at);
        this.wasm.removeCols(this.handleOf(sheet), at, removeCount);
        meta.columns.splice(at, removeCount);
        this.rebaseSheetCols(sheet, (col) =>
          col < at ? col : col < at + removeCount ? null : col - removeCount,
        );
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

  private rebaseSheetRows(sheet: SheetId, remap: (row: number) => number | null): void {
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

  getDirty(): Patch[] {
    return [...this.dirty];
  }

  markClean(patches: Patch[]): void {
    if (patches.length === 0 || this.dirty.length === 0) return;

    let prefix = 0;
    while (
      prefix < patches.length &&
      prefix < this.dirty.length &&
      this.dirty[prefix] === patches[prefix]
    ) {
      prefix += 1;
    }
    if (prefix === patches.length) {
      if (prefix === this.dirty.length) {
        this.dirty = [];
      } else if (prefix > 1024 && prefix * 2 > this.dirty.length) {
        this.dirty = this.dirty.slice(prefix);
      } else {
        this.dirty.splice(0, prefix);
      }
      return;
    }

    const clean = new Set(patches);
    this.dirty = this.dirty.filter((p) => !clean.has(p));
  }

  /** Bulk-load datasource rows into a sheet. Hydration emits nothing and never becomes dirty. */
  loadRows(
    sheet: SheetId,
    start: number,
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ): void {
    if (rows.length === 0) return;
    const handle = this.handleOf(sheet);
    const columns = this.sheetMeta(sheet).columns;
    const exceptions: Patch[] = [];
    const protectedCells: Patch[] = [];
    const loadedLiteralKeys: string[] = [];

    for (let c = 0; c < columns.length; c++) {
      const column = columns[c]!;
      for (let offset = 0; offset < rows.length; offset++) {
        const addr = { sheet, row: start + offset, col: c };
        if (protect?.(addr)) {
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
          (value && typeof value === "object" && (value.kind === "formula" || value.kind === "ref"))
        ) {
          exceptions.push({
            op: "set",
            addr,
            value: value as CellValue,
            style: wrapped?.style,
          });
        } else {
          loadedLiteralKeys.push(cellKey(addr));
        }
      }
      this.loadColumnBlock(handle, column, c, start, rows);
    }

    for (const patch of exceptions) this.applyPatch(patch, null);
    for (const patch of protectedCells) this.applyPatch(patch, null);
    if (loadedLiteralKeys.length > 0 && this.refs.hasRefs()) {
      const literalAt: LiteralLookup = (addr) => this.rawCell(addr).resolved;
      for (const key of loadedLiteralKeys) this.refs.onLiteralChanged(key, literalAt);
    }
    this.wasm.recompute(handle);
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
