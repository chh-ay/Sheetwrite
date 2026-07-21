import type { ResourceOwnerBytes } from "../resource-accounting.js";
import type { CellScalar } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { ColumnFilter, RowGroup, SortKey, Workbook } from "../types/document.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

const EMPTY_U32 = new Uint32Array(0);
const EMPTY_FILTERS: ReadonlyMap<number, ColumnFilter> = new Map();
const EMPTY_GROUPS: readonly RowGroup[] = [];
const ABSENT_VIEW_ROW = 0xffff_ffff;

type PackedRowIndexKind = "empty" | "sparse" | "dense";

interface PackedRowIndex {
  readonly kind: PackedRowIndexKind;
  readonly storage: Uint32Array;
  logicalRows: number;
  valid: boolean;
}

interface PackedRowIndexShape {
  readonly kind: PackedRowIndexKind;
  readonly storageLength: number;
}

function packedIndexShape(logicalRows: number, survivors: number): PackedRowIndexShape {
  if (survivors === 0) return { kind: "empty", storageLength: 0 };

  const requiredSlots = survivors * 2;
  if (requiredSlots < 0x8000_0000) {
    let capacity = 1;
    while (capacity < requiredSlots) capacity *= 2;
    const storageLength = capacity * 2;
    if (storageLength < logicalRows) return { kind: "sparse", storageLength };
  }
  return { kind: "dense", storageLength: logicalRows };
}

function hashDataRow(row: number): number {
  return Math.imul(row ^ (row >>> 16), 0x045d_9f3b) >>> 0;
}

const COMPARE_OP: Record<"gt" | "gte" | "lt" | "lte" | "eq" | "neq", number> = {
  gt: 0,
  gte: 1,
  lt: 2,
  lte: 3,
  eq: 4,
  neq: 5,
};

interface ViewState {
  sortKeys: SortKey[];
  filters: Map<number, ColumnFilter>;
  hiddenRows: Set<number>;
  groups: RowGroup[];
}

/** Owns the mutable view permutation and its query configuration. */
export class StoreViewState {
  private readonly orderBySheet = new Map<SheetId, Uint32Array>();
  private readonly rowIndexBySheet = new Map<SheetId, PackedRowIndex>();
  private readonly stateBySheet = new Map<SheetId, ViewState>();

  constructor(
    private readonly wasm: RecomputingCellStore,
    private readonly workbook: Workbook,
    private readonly handles: ReadonlyMap<SheetId, number>,
  ) {}

  order(sheet: SheetId): Uint32Array | undefined {
    return this.orderBySheet.get(sheet);
  }

  dataRowAt(sheet: SheetId, viewRow: number): number {
    const order = this.orderBySheet.get(sheet);
    return order ? (order[viewRow] ?? viewRow) : viewRow;
  }

  viewRowOf(sheet: SheetId, dataRow: number): number | null {
    if (!Number.isInteger(dataRow) || dataRow < 0) return null;

    const order = this.orderBySheet.get(sheet);
    if (!order) {
      const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
      return meta !== undefined && dataRow < meta.rowCount ? dataRow : null;
    }

    let index = this.rowIndexBySheet.get(sheet);
    if (!index?.valid) {
      const meta = this.sheetMeta(sheet);
      if (dataRow >= meta.rowCount) return null;
      index = this.rebuildRowIndex(sheet, order, meta.rowCount, index);
    }
    if (dataRow >= index.logicalRows || index.kind === "empty") return null;

    if (index.kind === "dense") {
      const viewRow = index.storage[dataRow]!;
      return viewRow === ABSENT_VIEW_ROW ? null : viewRow;
    }

    const capacity = index.storage.length / 2;
    const mask = capacity - 1;
    let slot = hashDataRow(dataRow) & mask;
    for (;;) {
      const at = slot * 2;
      const storedDataRow = index.storage[at]!;
      if (storedDataRow === ABSENT_VIEW_ROW) return null;
      if (storedDataRow === dataRow) return index.storage[at + 1]!;
      slot = (slot + 1) & mask;
    }
  }

  /** Retained packed backing bytes for focused resource attribution. */
  inverseIndexByteLength(sheet: SheetId): number {
    return this.rowIndexBySheet.get(sheet)?.storage.byteLength ?? 0;
  }

  columnFilters(sheet: SheetId): ReadonlyMap<number, ColumnFilter> {
    return this.stateBySheet.get(sheet)?.filters ?? EMPTY_FILTERS;
  }

  rowGroups(sheet: SheetId): readonly RowGroup[] {
    return this.sheetMeta(sheet).rowGroups ?? EMPTY_GROUPS;
  }

  dataEdge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number {
    const handle = this.handleOf(sheet);
    const order = this.orderBySheet.get(sheet);
    if (order) return this.wasm.dataEdgeOrdered(handle, order, row, col, dRow, dCol);
    return this.wasm.dataEdge(handle, row, col, dRow, dCol);
  }

  viewRowCount(sheet: SheetId): number {
    return this.orderBySheet.get(sheet)?.length ?? this.sheetMeta(sheet).rowCount;
  }

  hasView(sheet: SheetId): boolean {
    return this.orderBySheet.has(sheet);
  }

  /** Refresh state after row/group/query metadata has been applied to the workbook. */
  metadataChanged(sheet: SheetId): void {
    const meta = this.sheetMeta(sheet);
    const state = this.ensureState(sheet);
    state.sortKeys = meta.sortKeys?.map((key) => ({ ...key })) ?? [];
    state.filters = new Map(
      meta.filters?.map(([col, filter]) => [col, cloneJsonValue(filter)]) ?? [],
    );
    state.hiddenRows = new Set(meta.hiddenRows ?? []);
    state.groups = meta.rowGroups?.map((group) => ({ ...group })) ?? [];
    this.recompute(sheet);
  }

  /** Row structures already rebased workbook metadata; invalidate query and rebuild from it. */
  rowsChanged(sheet: SheetId): void {
    const state = this.stateBySheet.get(sheet);
    if (state) {
      const meta = this.sheetMeta(sheet);
      meta.sortKeys = [];
      meta.filters = [];
      state.sortKeys = [];
      state.filters.clear();
      state.hiddenRows = new Set(meta.hiddenRows ?? []);
      state.groups = meta.rowGroups?.map((group) => ({ ...group })) ?? [];
    }
    this.recompute(sheet);
  }

  /** Column shifts invalidate column-indexed query state but preserve row visibility. */
  columnsChanged(sheet: SheetId): void {
    const state = this.stateBySheet.get(sheet);
    if (state) {
      const meta = this.sheetMeta(sheet);
      meta.sortKeys = [];
      meta.filters = [];
      state.sortKeys = [];
      state.filters.clear();
    }
    this.recompute(sheet);
  }

  removeSheet(sheet: SheetId): void {
    this.stateBySheet.delete(sheet);
    this.orderBySheet.delete(sheet);
    this.rowIndexBySheet.delete(sheet);
  }

  resourceOwners(): ResourceOwnerBytes[] {
    let orderBytes = 0;
    let orderEntries = 0;
    for (const order of this.orderBySheet.values()) {
      orderBytes += order.byteLength;
      orderEntries += order.length;
    }
    let inverseBytes = 0;
    let inverseEntries = 0;
    for (const index of this.rowIndexBySheet.values()) {
      inverseBytes += index.storage.byteLength;
      inverseEntries += index.storage.length;
    }
    let configEntries = 0;
    for (const state of this.stateBySheet.values()) {
      configEntries +=
        state.sortKeys.length + state.filters.size + state.hiddenRows.size + state.groups.length;
    }
    return [
      {
        owner: "js.view.order",
        logicalBytes: orderBytes,
        allocatedBytes: orderBytes,
        entries: orderEntries,
        measurement: "typed-array-byte-length",
      },
      {
        owner: "js.view.inverse-index",
        logicalBytes: inverseBytes,
        allocatedBytes: inverseBytes,
        entries: inverseEntries,
        measurement: "typed-array-byte-length",
      },
      {
        owner: "js.view.configuration",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: configEntries,
        measurement: "entry-count-only",
      },
    ];
  }

  dispose(): void {
    this.stateBySheet.clear();
    this.orderBySheet.clear();
    this.rowIndexBySheet.clear();
  }

  distinctValues(sheet: SheetId, col: number, limit: number): CellScalar[] {
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

  private recompute(sheet: SheetId): void {
    const state = this.stateBySheet.get(sheet);
    const hasSort = state !== undefined && state.sortKeys.length > 0;
    const hasFilters = state !== undefined && state.filters.size > 0;
    const hidden = state ? this.hiddenRowSet(state) : null;

    if (!hasSort && !hasFilters && !hidden) {
      this.dropOrder(sheet);
      return;
    }

    const handle = this.handleOf(sheet);
    let survivors: Uint32Array | null = hasFilters ? this.runFilters(handle, state!.filters) : null;

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

    if (survivors && survivors.length === 0) {
      this.setOrder(sheet, EMPTY_U32);
      return;
    }
    if (!hasSort) {
      this.setOrder(sheet, survivors ?? EMPTY_U32);
      return;
    }

    const cols = new Uint32Array(state!.sortKeys.length);
    const ascending = new Uint8Array(state!.sortKeys.length);
    for (let i = 0; i < state!.sortKeys.length; i++) {
      cols[i] = state!.sortKeys[i]!.col;
      ascending[i] = state!.sortKeys[i]!.ascending ? 1 : 0;
    }
    this.setOrder(sheet, this.wasm.sortRowsMulti(handle, cols, ascending, survivors ?? EMPTY_U32));
  }

  private runFilters(handle: number, filters: ReadonlyMap<number, ColumnFilter>): Uint32Array {
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
        case "contains":
          kinds[i] = 1;
          flags[i] = filter.matchCase ? 1 : 0;
          textCounts[i] = 1;
          valueTexts.push(filter.text);
          break;
        case "compare":
          kinds[i] = 2;
          flags[i] = COMPARE_OP[filter.op];
          nums[i] = filter.value;
          break;
        case "empty":
          kinds[i] = 3;
          break;
        case "nonEmpty":
          kinds[i] = 4;
          break;
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

  private ensureState(sheet: SheetId): ViewState {
    let state = this.stateBySheet.get(sheet);
    if (!state) {
      const meta = this.sheetMeta(sheet);
      state = {
        sortKeys: meta.sortKeys?.map((key) => ({ ...key })) ?? [],
        filters: new Map(meta.filters?.map(([col, filter]) => [col, cloneJsonValue(filter)]) ?? []),
        hiddenRows: new Set(meta.hiddenRows ?? []),
        groups: meta.rowGroups?.map((group) => ({ ...group })) ?? [],
      };
      this.stateBySheet.set(sheet, state);
    }
    return state;
  }

  private rebuildRowIndex(
    sheet: SheetId,
    order: Uint32Array,
    logicalRows: number,
    reusable: PackedRowIndex | undefined,
  ): PackedRowIndex {
    if (logicalRows > ABSENT_VIEW_ROW || order.length > ABSENT_VIEW_ROW) {
      throw new RangeError(
        `sheet ${sheet} exceeds the packed inverse row limit of ${ABSENT_VIEW_ROW}`,
      );
    }

    const shape = packedIndexShape(logicalRows, order.length);
    let index = reusable;
    if (!index || index.kind !== shape.kind || index.storage.length !== shape.storageLength) {
      index = {
        kind: shape.kind,
        storage: shape.storageLength === 0 ? EMPTY_U32 : new Uint32Array(shape.storageLength),
        logicalRows,
        valid: false,
      };
      this.rowIndexBySheet.set(sheet, index);
    } else {
      index.logicalRows = logicalRows;
    }

    if (index.kind === "empty") {
      index.valid = true;
      return index;
    }

    index.storage.fill(ABSENT_VIEW_ROW);
    if (index.kind === "dense") {
      for (let viewRow = 0; viewRow < order.length; viewRow++) {
        const dataRow = order[viewRow]!;
        if (dataRow >= logicalRows) {
          throw new RangeError(
            `view order for sheet ${sheet} contains out-of-bounds data row ${dataRow}`,
          );
        }
        if (index.storage[dataRow] !== ABSENT_VIEW_ROW) {
          throw new RangeError(
            `view order for sheet ${sheet} contains duplicate data row ${dataRow}`,
          );
        }
        index.storage[dataRow] = viewRow;
      }
    } else {
      const capacity = index.storage.length / 2;
      const mask = capacity - 1;
      for (let viewRow = 0; viewRow < order.length; viewRow++) {
        const dataRow = order[viewRow]!;
        if (dataRow >= logicalRows) {
          throw new RangeError(
            `view order for sheet ${sheet} contains out-of-bounds data row ${dataRow}`,
          );
        }
        let slot = hashDataRow(dataRow) & mask;
        for (;;) {
          const at = slot * 2;
          const storedDataRow = index.storage[at]!;
          if (storedDataRow === dataRow) {
            throw new RangeError(
              `view order for sheet ${sheet} contains duplicate data row ${dataRow}`,
            );
          }
          if (storedDataRow === ABSENT_VIEW_ROW) {
            index.storage[at] = dataRow;
            index.storage[at + 1] = viewRow;
            break;
          }
          slot = (slot + 1) & mask;
        }
      }
    }
    index.valid = true;
    return index;
  }

  private setOrder(sheet: SheetId, order: Uint32Array): void {
    this.orderBySheet.set(sheet, order);
    const index = this.rowIndexBySheet.get(sheet);
    if (!index) return;

    const shape = packedIndexShape(this.sheetMeta(sheet).rowCount, order.length);
    if (index.kind !== shape.kind || index.storage.length !== shape.storageLength) {
      this.rowIndexBySheet.delete(sheet);
    } else {
      index.valid = false;
    }
  }

  private dropOrder(sheet: SheetId): void {
    this.orderBySheet.delete(sheet);
    this.rowIndexBySheet.delete(sheet);
  }

  private handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw new Error(`unknown sheet: ${sheet}`);
    return handle;
  }

  private sheetMeta(sheet: SheetId) {
    const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
    if (!meta) throw new Error(`unknown sheet: ${sheet}`);
    return meta;
  }
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
