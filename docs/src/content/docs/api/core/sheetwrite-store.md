---
title: "SheetwriteStore | @sheetwrite/core"
description: "Stable public facade and the sole transaction, epoch, policy, and event barrier."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteStore -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable public facade and the sole transaction, epoch, policy, and event barrier.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/store.ts#L47</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>50</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-store-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(workbook: Workbook, data?: ColumnarData, options?: SheetwriteStoreOptions);
```

</details>

<details class="api-member" id="sheetwrite-store-acknowledge-operations" data-pagefind-weight="1">
<summary><code>acknowledgeOperations</code> <span class="api-member-summary">Release paged dirty pins after server acknowledgement.</span></summary>

```ts generated
acknowledgeOperations: (operations: readonly DocumentOp[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-aggregate" data-pagefind-weight="1">
<summary><code>aggregate</code></summary>

```ts generated
aggregate: (sheet: SheetId, col: number, op: AggregateOp) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code> <span class="api-member-summary">Apply a low-level storage transaction.</span></summary>

```ts generated
applyTransaction: (tx: Transaction, reasonOrOptions?: CommitReason | TransactionApplicationOptions) => ApplyTransactionResult;
```

<p class="api-member-doc">Apply a low-level storage transaction.

This bypasses Grid read-only checks and Grid undo/redo history. Use
`Grid.applyTransaction` for normal host-driven edits.
Queued and flushed at a barrier — never reentrant.</p>
</details>

<details class="api-member" id="sheetwrite-store-can-apply-locally" data-pagefind-weight="1">
<summary><code>canApplyLocally</code></summary>

```ts generated
canApplyLocally: (patch: DocumentOp) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-capture-range-history" data-pagefind-weight="1">
<summary><code>captureRangeHistory</code></summary>

```ts generated
captureRangeHistory: (input: Range) => CompactRangeHistory | null;
```

</details>

<details class="api-member" id="sheetwrite-store-clear-view" data-pagefind-weight="1">
<summary><code>clearView</code></summary>

```ts generated
clearView: (sheet: SheetId) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-column-filters" data-pagefind-weight="1">
<summary><code>columnFilters</code></summary>

```ts generated
columnFilters: (sheet: SheetId) => ReadonlyMap<number, ColumnFilter>;
```

</details>

<details class="api-member" id="sheetwrite-store-data-edge" data-pagefind-weight="1">
<summary><code>dataEdge</code></summary>

```ts generated
dataEdge: (sheet: SheetId, row: number, col: number, dRow: number, dCol: number) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-data-row-at" data-pagefind-weight="1">
<summary><code>dataRowAt</code></summary>

```ts generated
dataRowAt: (sheet: SheetId, viewRow: number) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-dispose" data-pagefind-weight="1">
<summary><code>dispose</code></summary>

```ts generated
dispose: () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-distinct-values" data-pagefind-weight="1">
<summary><code>distinctValues</code></summary>

```ts generated
distinctValues: (sheet: SheetId, col: number, limit?: number) => CellScalar[];
```

</details>

<details class="api-member" id="sheetwrite-store-ensure-columns" data-pagefind-weight="1">
<summary><code>ensureColumns</code> <span class="api-member-summary">Ensure a sheet can address at least columns.length columns without producing user changes or dirty patches.</span></summary>

```ts generated
ensureColumns: (sheet: SheetId, columns: readonly Column[]) => void;
```

<p class="api-member-doc">Ensure a sheet can address at least `columns.length` columns without
producing user changes or dirty patches. Used for presentation padding.</p>
</details>

<details class="api-member" id="sheetwrite-store-export-snapshot" data-pagefind-weight="1">
<summary><code>exportSnapshot</code> <span class="api-member-summary">Deterministic, JSON-safe authoritative runtime document.</span></summary>

```ts generated
exportSnapshot: () => WorkbookSnapshot;
```

</details>

<details class="api-member" id="sheetwrite-store-filter-by" data-pagefind-weight="1">
<summary><code>filterBy</code></summary>

```ts generated
filterBy: (sheet: SheetId, col: number, needle: string) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-get-cell" data-pagefind-weight="1">
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions, API reads, and tests.</span></summary>

```ts generated
getCell: (addr: CellAddress) => ResolvedCell;
```

<p class="api-member-doc">Single-cell read for interactions, API reads, and tests.
NOT for the render hot path — renderers use `getVisibleWindow`.</p>
</details>

<details class="api-member" id="sheetwrite-store-get-cell-load-state" data-pagefind-weight="1">
<summary><code>getCellLoadState</code> <span class="api-member-summary">Loaded/empty/local state; dense stores always return a loaded state.</span></summary>

```ts generated
getCellLoadState: (addr: CellAddress) => CellLoadState;
```

</details>

<details class="api-member" id="sheetwrite-store-get-clipboard-window" data-pagefind-weight="1">
<summary><code>getClipboardWindow</code> <span class="api-member-summary">Optional packed clipboard read.</span></summary>

```ts generated
getClipboardWindow: (sheet: SheetId, viewRows: { start: number; end: number; }, cols: readonly number[]) => ClipboardWindowView;
```

<p class="api-member-doc">Optional packed clipboard read. Custom stores may omit it; the controller
preserves the per-cell Store fallback contract.</p>
</details>

<details class="api-member" id="sheetwrite-store-get-formula" data-pagefind-weight="1">
<summary><code>getFormula</code> <span class="api-member-summary">Formula source at addr, or null when the cell is not a formula.</span></summary>

```ts generated
getFormula: (addr: CellAddress) => string | null;
```

</details>

<details class="api-member" id="sheetwrite-store-get-paged-stats" data-pagefind-weight="1">
<summary><code>getPagedStats</code></summary>

```ts generated
getPagedStats: (sheet: SheetId) => PagedStoreStats;
```

</details>

<details class="api-member" id="sheetwrite-store-get-range-mutation-allocation-stats" data-pagefind-weight="1">
<summary><code>getRangeMutationAllocationStats</code></summary>

```ts generated
getRangeMutationAllocationStats: () => RangeMutationAllocationStats;
```

</details>

<details class="api-member" id="sheetwrite-store-get-ref-target" data-pagefind-weight="1">
<summary><code>getRefTarget</code> <span class="api-member-summary">Plain-reference target at addr, or null when the cell is not a ref.</span></summary>

```ts generated
getRefTarget: (addr: CellAddress) => CellAddress | null;
```

</details>

<details class="api-member" id="sheetwrite-store-get-visible-window" data-pagefind-weight="1">
<summary><code>getVisibleWindow</code> <span class="api-member-summary">Bulk read of a visible window; the only read a renderer should use per frame.</span></summary>

```ts generated
getVisibleWindow: (sheet: SheetId, rows: { start: number; end: number; }, cols: readonly number[]) => VisibleWindowView;
```

</details>

<details class="api-member" id="sheetwrite-store-get-workbook" data-pagefind-weight="1">
<summary><code>getWorkbook</code></summary>

```ts generated
getWorkbook: () => Workbook;
```

</details>

<details class="api-member" id="sheetwrite-store-group-rows" data-pagefind-weight="1">
<summary><code>groupRows</code></summary>

```ts generated
groupRows: (sheet: SheetId, start: number, end: number) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-has-view" data-pagefind-weight="1">
<summary><code>hasView</code></summary>

```ts generated
hasView: (sheet: SheetId) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-hidden-rows" data-pagefind-weight="1">
<summary><code>hiddenRows</code></summary>

```ts generated
hiddenRows: (sheet: SheetId) => number[];
```

</details>

<details class="api-member" id="sheetwrite-store-hide-rows" data-pagefind-weight="1">
<summary><code>hideRows</code></summary>

```ts generated
hideRows: (sheet: SheetId, rows: readonly number[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-is-paged" data-pagefind-weight="1">
<summary><code>isPaged</code></summary>

```ts generated
isPaged: (sheet: SheetId) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-is-range-fully-loaded" data-pagefind-weight="1">
<summary><code>isRangeFullyLoaded</code></summary>

```ts generated
isRangeFullyLoaded: (input: Range) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-load-rows" data-pagefind-weight="1">
<summary><code>loadRows</code></summary>

```ts generated
loadRows: (sheet: SheetId, start: number, rows: readonly RowData[], protect?: (addr: CellAddress) => boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on: (_evt: "change", fn: ChangeListener) => () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-query-capability" data-pagefind-weight="1">
<summary><code>queryCapability</code> <span class="api-member-summary">Explicit partial-data state for paged datasource stores.</span></summary>

```ts generated
queryCapability: (sheet: SheetId) => QueryCapability;
```

</details>

<details class="api-member" id="sheetwrite-store-recalculate-volatile" data-pagefind-weight="1">
<summary><code>recalculateVolatile</code> <span class="api-member-summary">Recompute volatile formulas (TODAY/NOW) from one captured instant.</span></summary>

```ts generated
recalculateVolatile: (now?: Date) => void;
```

<p class="api-member-doc">Recompute volatile formulas (`TODAY`/`NOW`) from one captured instant.
The supplied Date is interpreted as an absolute UTC instant.</p>
</details>

<details class="api-member" id="sheetwrite-store-remove-sheet-formula-identity" data-pagefind-weight="1">
<summary><code>removeSheetFormulaIdentity</code></summary>

```ts generated
removeSheetFormulaIdentity: (sheet: SheetId) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-rename-sheet-formula-identity" data-pagefind-weight="1">
<summary><code>renameSheetFormulaIdentity</code></summary>

```ts generated
renameSheetFormulaIdentity: (sheet: SheetId, name: string) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-reset-range-mutation-allocation-stats" data-pagefind-weight="1">
<summary><code>resetRangeMutationAllocationStats</code></summary>

```ts generated
resetRangeMutationAllocationStats: () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code></summary>

```ts generated
rowGroups: (sheet: SheetId) => readonly RowGroup[];
```

</details>

<details class="api-member" id="sheetwrite-store-search-cells" data-pagefind-weight="1">
<summary><code>searchCells</code></summary>

```ts generated
searchCells: (sheet: SheetId, query: string, opts?: { matchCase?: boolean; wholeCell?: boolean; columns?: number[]; }) => CellAddress[];
```

</details>

<details class="api-member" id="sheetwrite-store-search-cells-flat" data-pagefind-weight="1">
<summary><code>searchCellsFlat</code></summary>

```ts generated
searchCellsFlat: (sheet: SheetId, query: string, opts?: { matchCase?: boolean; wholeCell?: boolean; columns?: number[]; }) => Uint32Array;
```

</details>

<details class="api-member" id="sheetwrite-store-set-column-filter" data-pagefind-weight="1">
<summary><code>setColumnFilter</code></summary>

```ts generated
setColumnFilter: (sheet: SheetId, col: number, filter: ColumnFilter | null) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-set-group-collapsed" data-pagefind-weight="1">
<summary><code>setGroupCollapsed</code></summary>

```ts generated
setGroupCollapsed: (sheet: SheetId, start: number, collapsed: boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code> <span class="api-member-summary">Configure host-owned protected-range permissions.</span></summary>

```ts generated
setProtectionResolver: (resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode) => void;
```

<p class="api-member-doc">Configure host-owned protected-range permissions. The resolver is synchronous
so every local mutation ingress shares one atomic commit barrier.</p>
</details>

<details class="api-member" id="sheetwrite-store-show-rows" data-pagefind-weight="1">
<summary><code>showRows</code></summary>

```ts generated
showRows: (sheet: SheetId, rows?: readonly number[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-sort-by" data-pagefind-weight="1">
<summary><code>sortBy</code></summary>

```ts generated
sortBy: (sheet: SheetId, col: number, ascending: boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-sort-by-multi" data-pagefind-weight="1">
<summary><code>sortByMulti</code></summary>

```ts generated
sortByMulti: (sheet: SheetId, keys: readonly SortKey[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-ungroup-rows" data-pagefind-weight="1">
<summary><code>ungroupRows</code></summary>

```ts generated
ungroupRows: (sheet: SheetId, start: number, end: number) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-view-row-count" data-pagefind-weight="1">
<summary><code>viewRowCount</code> <span class="api-member-summary">Displayed row count after any active sort/filter view.</span></summary>

```ts generated
viewRowCount: (sheet: SheetId) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-view-row-of" data-pagefind-weight="1">
<summary><code>viewRowOf</code></summary>

```ts generated
viewRowOf: (sheet: SheetId, dataRow: number) => number | null;
```

</details>

<details class="api-member" id="sheetwrite-store-from-snapshot" data-pagefind-weight="1">
<summary><code>fromSnapshot</code></summary>

```ts generated
static fromSnapshot: (input: unknown) => SheetwriteStore
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SheetwriteStore implements Store {
  constructor(
    workbook: Workbook,
    data?: ColumnarData,
    options?: SheetwriteStoreOptions,
  );
  acknowledgeOperations: (operations: readonly DocumentOp[]) => void;
  aggregate: (sheet: SheetId, col: number, op: AggregateOp) => number;
  applyTransaction: (
    tx: Transaction,
    reasonOrOptions?: CommitReason | TransactionApplicationOptions,
  ) => ApplyTransactionResult;
  canApplyLocally: (patch: DocumentOp) => boolean;
  captureRangeHistory: (input: Range) => CompactRangeHistory | null;
  clearView: (sheet: SheetId) => void;
  columnFilters: (sheet: SheetId) => ReadonlyMap<number, ColumnFilter>;
  dataEdge: (
    sheet: SheetId,
    row: number,
    col: number,
    dRow: number,
    dCol: number,
  ) => number;
  dataRowAt: (sheet: SheetId, viewRow: number) => number;
  dispose: () => void;
  distinctValues: (
    sheet: SheetId,
    col: number,
    limit?: number,
  ) => CellScalar[];
  ensureColumns: (sheet: SheetId, columns: readonly Column[]) => void;
  exportSnapshot: () => WorkbookSnapshot;
  filterBy: (sheet: SheetId, col: number, needle: string) => void;
  getCell: (addr: CellAddress) => ResolvedCell;
  getCellLoadState: (addr: CellAddress) => CellLoadState;
  getClipboardWindow: (
    sheet: SheetId,
    viewRows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ) => ClipboardWindowView;
  getFormula: (addr: CellAddress) => string | null;
  getPagedStats: (sheet: SheetId) => PagedStoreStats;
  getRangeMutationAllocationStats: () => RangeMutationAllocationStats;
  getRefTarget: (addr: CellAddress) => CellAddress | null;
  getVisibleWindow: (
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ) => VisibleWindowView;
  getWorkbook: () => Workbook;
  groupRows: (sheet: SheetId, start: number, end: number) => void;
  hasView: (sheet: SheetId) => boolean;
  hiddenRows: (sheet: SheetId) => number[];
  hideRows: (sheet: SheetId, rows: readonly number[]) => void;
  isPaged: (sheet: SheetId) => boolean;
  isRangeFullyLoaded: (input: Range) => boolean;
  loadRows: (
    sheet: SheetId,
    start: number,
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ) => void;
  on: (_evt: "change", fn: ChangeListener) => () => void;
  queryCapability: (sheet: SheetId) => QueryCapability;
  recalculateVolatile: (now?: Date) => void;
  removeSheetFormulaIdentity: (sheet: SheetId) => boolean;
  renameSheetFormulaIdentity: (sheet: SheetId, name: string) => boolean;
  resetRangeMutationAllocationStats: () => void;
  rowGroups: (sheet: SheetId) => readonly RowGroup[];
  searchCells: (
    sheet: SheetId,
    query: string,
    opts?: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
    },
  ) => CellAddress[];
  searchCellsFlat: (
    sheet: SheetId,
    query: string,
    opts?: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
    },
  ) => Uint32Array;
  setColumnFilter: (
    sheet: SheetId,
    col: number,
    filter: ColumnFilter | null,
  ) => void;
  setGroupCollapsed: (
    sheet: SheetId,
    start: number,
    collapsed: boolean,
  ) => void;
  setProtectionResolver: (
    resolver: ProtectionResolver | undefined,
    mode?: MutationPolicyMode,
  ) => void;
  showRows: (sheet: SheetId, rows?: readonly number[]) => void;
  sortBy: (sheet: SheetId, col: number, ascending: boolean) => void;
  sortByMulti: (sheet: SheetId, keys: readonly SortKey[]) => void;
  ungroupRows: (sheet: SheetId, start: number, end: number) => void;
  viewRowCount: (sheet: SheetId) => number;
  viewRowOf: (sheet: SheetId, dataRow: number) => number | null;
  static fromSnapshot: (input: unknown) => SheetwriteStore;
}
```

</details>
