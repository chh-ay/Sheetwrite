---
title: "CellStore | @sheetwrite/wasm"
description: "The workbook-wide store: every sheet, one string pool."
---
<!-- api-export:@sheetwrite/wasm|.|CellStore -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

The workbook-wide store: every sheet, one string pool.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L20</code></dd></div>
</dl>

## Members <span class="api-count">60</span>

<div class="api-member-list">

<details class="api-member" id="cell-store-add-paged-sheet" data-pagefind-weight="1">
<summary><code>addPagedSheet</code> <span class="api-member-summary">Allocate a logical sheet whose cell chunks materialize on page load or edit.</span></summary>

```ts generated
addPagedSheet: (n_cols: number, row_count: number, chunk_rows: number, byte_budget: number) => number;
```

</details>

<details class="api-member" id="cell-store-add-rows" data-pagefind-weight="1">
<summary><code>addRows</code></summary>

```ts generated
addRows: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-add-sheet" data-pagefind-weight="1">
<summary><code>addSheet</code> <span class="api-member-summary">Allocate a sheet grid and return its numeric handle.</span></summary>

```ts generated
addSheet: (n_cols: number, row_count: number) => number;
```

</details>

<details class="api-member" id="cell-store-aggregate" data-pagefind-weight="1">
<summary><code>aggregate</code> <span class="api-member-summary">Column aggregate over numeric cells.</span></summary>

```ts generated
aggregate: (sheet: number, col: number, op: number) => number;
```

<p class="api-member-doc">Column aggregate over numeric cells. op: 0 sum, 1 avg, 2 min, 3 max, 4 count.</p>
</details>

<details class="api-member" id="cell-store-begin-page-load" data-pagefind-weight="1">
<summary><code>beginPageLoad</code></summary>

```ts generated
beginPageLoad: () => void;
```

</details>

<details class="api-member" id="cell-store-capture-range" data-pagefind-weight="1">
<summary><code>captureRange</code> <span class="api-member-summary">Capture a dense rectangle into an opaque store-local history resource.</span></summary>

```ts generated
captureRange: (sheet: number, r0: number, c0: number, rows: number, cols: number) => RangeSnapshot | undefined;
```

</details>

<details class="api-member" id="cell-store-cell-state" data-pagefind-weight="1">
<summary><code>cellState</code> <span class="api-member-summary">0 unloaded, 1 loaded-empty, 2 loaded-value, 3 dirty local edit.</span></summary>

```ts generated
cellState: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-clear-cell" data-pagefind-weight="1">
<summary><code>clearCell</code></summary>

```ts generated
clearCell: (sheet: number, row: number, col: number, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-clear-range" data-pagefind-weight="1">
<summary><code>clearRange</code> <span class="api-member-summary">Clear a rectangle while independently controlling contents and style.</span></summary>

```ts generated
clearRange: (sheet: number, r0: number, c0: number, r1: number, c1: number, contents: boolean, style: boolean) => boolean;
```

</details>

<details class="api-member" id="cell-store-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>

```ts generated
colCount: (sheet: number) => number;
```

</details>

<details class="api-member" id="cell-store-data-edge" data-pagefind-weight="1">
<summary><code>dataEdge</code> <span class="api-member-summary">Ctrl+Arrow destination: from (row, col) stepping by (drow, dcol) (exactly one of them ±1), return the destination row (vertical moves) or column (horizontal moves), Google Sheets semantics: - current and adjacent…</span></summary>

```ts generated
dataEdge: (sheet: number, row: number, col: number, d_row: number, d_col: number) => number;
```

<p class="api-member-doc">Ctrl+Arrow destination: from `(row, col)` stepping by `(d_row, d_col)`
(exactly one of them ±1), return the destination row (vertical moves) or
column (horizontal moves), Google Sheets semantics:

- current and adjacent cell non-empty → end of the contiguous non-empty
  run;
- otherwise → the next non-empty cell in that direction;
- nothing ahead → the sheet edge.</p>
</details>

<details class="api-member" id="cell-store-data-edge-ordered" data-pagefind-weight="1">
<summary><code>dataEdgeOrdered</code></summary>

```ts generated
dataEdgeOrdered: (sheet: number, order: Uint32Array, row: number, col: number, d_row: number, d_col: number) => number;
```

</details>

<details class="api-member" id="cell-store-distinct-values" data-pagefind-weight="1">
<summary><code>distinctValues</code></summary>

```ts generated
distinctValues: (sheet: number, col: number, limit: number) => DistinctColumn;
```

</details>

<details class="api-member" id="cell-store-end-page-load" data-pagefind-weight="1">
<summary><code>endPageLoad</code></summary>

```ts generated
endPageLoad: () => void;
```

</details>

<details class="api-member" id="cell-store-filter-rows" data-pagefind-weight="1">
<summary><code>filterRows</code> <span class="api-member-summary">Data-row indices whose column text contains needle (case-insensitive).</span></summary>

```ts generated
filterRows: (sheet: number, col: number, needle: string) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-filter-rows-multi" data-pagefind-weight="1">
<summary><code>filterRowsMulti</code></summary>

```ts generated
filterRowsMulti: (sheet: number, cols: Uint32Array, kinds: Uint8Array, flags: Uint8Array, nums: Float64Array, num_counts: Uint32Array, text_counts: Uint32Array, value_nums: Float64Array, value_texts: string[]) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-formula-source" data-pagefind-weight="1">
<summary><code>formulaSource</code></summary>

```ts generated
formulaSource: (sheet: number, row: number, col: number) => string | undefined;
```

</details>

<details class="api-member" id="cell-store-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="cell-store-get-cell" data-pagefind-weight="1">
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions/tests — never the render hot path.</span></summary>

```ts generated
getCell: (sheet: number, row: number, col: number) => CellOut;
```

</details>

<details class="api-member" id="cell-store-get-window" data-pagefind-weight="1">
<summary><code>getWindow</code> <span class="api-member-summary">One bulk read of a rectangular window for the renderer.</span></summary>

```ts generated
getWindow: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => WindowView;
```

<p class="api-member-doc">One bulk read of a rectangular window for the renderer. Returns
contiguous typed arrays (row-major over `rows x cols`) plus the unique
strings referenced by the window, so the host paints without crossing
the boundary per cell.</p>
</details>

<details class="api-member" id="cell-store-get-window-rows" data-pagefind-weight="1">
<summary><code>getWindowRows</code> <span class="api-member-summary">Bulk read of an explicit row list (sorted/filtered views) — same output shape as getwindow, rows taken from rows rather than a range.</span></summary>

```ts generated
getWindowRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) => WindowView;
```

<p class="api-member-doc">Bulk read of an explicit row list (sorted/filtered views) — same output
shape as `get_window`, rows taken from `rows` rather than a range.</p>
</details>

<details class="api-member" id="cell-store-insert-cols" data-pagefind-weight="1">
<summary><code>insertCols</code></summary>

```ts generated
insertCols: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-is-fully-loaded" data-pagefind-weight="1">
<summary><code>isFullyLoaded</code></summary>

```ts generated
isFullyLoaded: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-is-paged" data-pagefind-weight="1">
<summary><code>isPaged</code></summary>

```ts generated
isPaged: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-is-sheet-alive" data-pagefind-weight="1">
<summary><code>isSheetAlive</code></summary>

```ts generated
isSheetAlive: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-mark-range-clean" data-pagefind-weight="1">
<summary><code>markRangeClean</code></summary>

```ts generated
markRangeClean: (sheet: number, start_row: number, end_row: number, start_col: number, end_col: number) => void;
```

</details>

<details class="api-member" id="cell-store-paged-stats" data-pagefind-weight="1">
<summary><code>pagedStats</code> <span class="api-member-summary">[chunks, loaded cells, dirty cells, allocated bytes, fully loaded].</span></summary>

```ts generated
pagedStats: (sheet: number) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-pin-range" data-pagefind-weight="1">
<summary><code>pinRange</code></summary>

```ts generated
pinRange: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) => void;
```

</details>

<details class="api-member" id="cell-store-pool-strings" data-pagefind-weight="1">
<summary><code>poolStrings</code></summary>

```ts generated
poolStrings: (ids: Uint32Array) => string[];
```

</details>

<details class="api-member" id="cell-store-query-resource-stats" data-pagefind-weight="1">
<summary><code>queryResourceStats</code> <span class="api-member-summary">[contains cache constructions, owned distinct strings].</span></summary>

```ts generated
queryResourceStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-range-fully-loaded" data-pagefind-weight="1">
<summary><code>rangeFullyLoaded</code></summary>

```ts generated
rangeFullyLoaded: (sheet: number, r0: number, c0: number, r1: number, c1: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-range-style-ids" data-pagefind-weight="1">
<summary><code>rangeStyleIds</code> <span class="api-member-summary">Unique style ids present in a rectangle; cost stays inside WASM.</span></summary>

```ts generated
rangeStyleIds: (sheet: number, r0: number, c0: number, r1: number, c1: number) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-recompute" data-pagefind-weight="1">
<summary><code>recompute</code> <span class="api-member-summary">Recompute formulas affected by cells changed since the last call.</span></summary>

```ts generated
recompute: (sheet: number) => void;
```

<p class="api-member-doc">Recompute formulas affected by cells changed since the last call.

The pass first grows the dirty cell set through formula read-sets to find
all dependent formulas. It then evaluates only those formulas, using a
per-pass memo table so each formula cell is evaluated at most once even
when many downstream formulas reference it.</p>
</details>

<details class="api-member" id="cell-store-recompute-volatile" data-pagefind-weight="1">
<summary><code>recomputeVolatile</code> <span class="api-member-summary">Explicit volatile barrier.</span></summary>

```ts generated
recomputeVolatile: (serial: number) => boolean;
```

<p class="api-member-doc">Explicit volatile barrier. `serial` is a UTC spreadsheet serial using
the 1899-12-30 epoch; only TODAY/NOW formulas and their dependents dirty.</p>
</details>

<details class="api-member" id="cell-store-remap-range-styles" data-pagefind-weight="1">
<summary><code>remapRangeStyles</code> <span class="api-member-summary">Remap styles over a rectangle using parallel old/new id tables.</span></summary>

```ts generated
remapRangeStyles: (sheet: number, r0: number, c0: number, r1: number, c1: number, old_ids: Uint32Array, new_ids: Uint32Array) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-cols" data-pagefind-weight="1">
<summary><code>removeCols</code></summary>

```ts generated
removeCols: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-remove-named-range" data-pagefind-weight="1">
<summary><code>removeNamedRange</code></summary>

```ts generated
removeNamedRange: (name: string, scope: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-rows" data-pagefind-weight="1">
<summary><code>removeRows</code></summary>

```ts generated
removeRows: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-remove-sheet" data-pagefind-weight="1">
<summary><code>removeSheet</code> <span class="api-member-summary">Tombstone a stable sheet handle and invalidate every formula reference to it.</span></summary>

```ts generated
removeSheet: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-rename-sheet" data-pagefind-weight="1">
<summary><code>renameSheet</code> <span class="api-member-summary">Rename a live stable sheet handle and rewrite every resolved formula AST reference.</span></summary>

```ts generated
renameSheet: (sheet: number, id: string, name: string) => boolean;
```

</details>

<details class="api-member" id="cell-store-reset-query-resource-stats" data-pagefind-weight="1">
<summary><code>resetQueryResourceStats</code></summary>

```ts generated
resetQueryResourceStats: () => void;
```

</details>

<details class="api-member" id="cell-store-restore-range" data-pagefind-weight="1">
<summary><code>restoreRange</code> <span class="api-member-summary">Restore a captured block at a destination of the same dimensions.</span></summary>

```ts generated
restoreRange: (sheet: number, r0: number, c0: number, snapshot: RangeSnapshot) => boolean;
```

</details>

<details class="api-member" id="cell-store-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: (sheet: number) => number;
```

</details>

<details class="api-member" id="cell-store-search" data-pagefind-weight="1">
<summary><code>search</code> <span class="api-member-summary">Cell coordinates whose text matches query, as a flat [row, col, ...] list.</span></summary>

```ts generated
search: (sheet: number, cols: Uint32Array, query: string, case_insensitive: boolean, whole_cell: boolean) => Uint32Array;
```

<p class="api-member-doc">Cell coordinates whose text matches `query`, as a flat `[row, col, ...]`
list. Scans the requested columns column-major (cache-local), then sorts
row-major so search navigation runs top-to-bottom, left-to-right.</p>
</details>

<details class="api-member" id="cell-store-set-block" data-pagefind-weight="1">
<summary><code>setBlock</code> <span class="api-member-summary">Write one row-major typed block in a single boundary call.</span></summary>

```ts generated
setBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array) => boolean;
```

<p class="api-member-doc">Write one row-major typed block in a single boundary call. `kinds` uses
0 empty / 1 number / 2 string; formulas and references are sparse host
exceptions applied after this literal bulk write.</p>
</details>

<details class="api-member" id="cell-store-set-bool" data-pagefind-weight="1">
<summary><code>setBool</code></summary>

```ts generated
setBool: (sheet: number, row: number, col: number, value: boolean, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-column-numbers" data-pagefind-weight="1">
<summary><code>setColumnNumbers</code> <span class="api-member-summary">Bulk-load one column with numbers starting at startrow.</span></summary>

```ts generated
setColumnNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number) => void;
```

<p class="api-member-doc">Bulk-load one column with numbers starting at `start_row`.</p>
</details>

<details class="api-member" id="cell-store-set-column-strings" data-pagefind-weight="1">
<summary><code>setColumnStrings</code> <span class="api-member-summary">Bulk-load one column with strings starting at startrow.</span></summary>

```ts generated
setColumnStrings: (sheet: number, col: number, start_row: number, values: string[], style: number) => void;
```

<p class="api-member-doc">Bulk-load one column with strings starting at `start_row`.</p>
</details>

<details class="api-member" id="cell-store-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>setColumnStringsPacked</code> <span class="api-member-summary">Bulk-load one column of strings from a single concatenated buffer plus per-row lengths in UTF-16 code units (the JS string.length unit).</span></summary>

```ts generated
setColumnStringsPacked: (sheet: number, col: number, start_row: number, buf: string, utf16_lens: Uint32Array, style: number) => void;
```

<p class="api-member-doc">Bulk-load one column of strings from a single concatenated buffer plus
per-row lengths in UTF-16 code units (the JS `string.length` unit).
One boundary decode and one Rust allocation for the whole column,
instead of one per row — the dominant ingest cost for text columns.</p>
</details>

<details class="api-member" id="cell-store-set-conditional-rules" data-pagefind-weight="1">
<summary><code>setConditionalRules</code> <span class="api-member-summary">Replace a sheet's conditional-format rules.</span></summary>

```ts generated
setConditionalRules: (sheet: number, kinds: Uint8Array, bounds: Uint32Array, nums: Float64Array, strs: string[], flags: Uint8Array) => void;
```

<p class="api-member-doc">Replace a sheet's conditional-format rules. Packed columnar encoding,
one entry per rule: `kinds` 0 gt / 1 lt / 2 eqNum / 3 eqStr / 4 eqEmpty /
5 contains; `bounds` = normalized `[r0, c0, r1, c1]` per rule; `nums`
carries the numeric operand; `strs` the text operand; `flags` bit 0 =
match-case for `contains`. Case-insensitive needles are lowercased here
once so the per-cell match never allocates.</p>
</details>

<details class="api-member" id="cell-store-set-formula" data-pagefind-weight="1">
<summary><code>setFormula</code> <span class="api-member-summary">Parse and store an arithmetic formula at (row, col).</span></summary>

```ts generated
setFormula: (sheet: number, row: number, col: number, src: string, style: number) => number;
```

<p class="api-member-doc">Parse and store an arithmetic formula at `(row, col)`.

Setters only mark cells dirty; they do not recompute formulas. The host
calls `recompute(sheet)` once at the transaction barrier so a multi-cell
edit performs one dependency-scoped pass instead of one full-sheet pass
per setter. The returned value is the previous cached value until that
barrier recompute runs, and the store facade ignores it for batched edits.</p>
</details>

<details class="api-member" id="cell-store-set-named-range" data-pagefind-weight="1">
<summary><code>setNamedRange</code></summary>

```ts generated
setNamedRange: (name: string, scope: number, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-set-number" data-pagefind-weight="1">
<summary><code>setNumber</code></summary>

```ts generated
setNumber: (sheet: number, row: number, col: number, value: number, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-sheet-name" data-pagefind-weight="1">
<summary><code>setSheetName</code></summary>

```ts generated
setSheetName: (sheet: number, id: string, name: string) => void;
```

</details>

<details class="api-member" id="cell-store-set-string" data-pagefind-weight="1">
<summary><code>setString</code></summary>

```ts generated
setString: (sheet: number, row: number, col: number, value: string, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-snapshot-numbers" data-pagefind-weight="1">
<summary><code>snapshotNumbers</code></summary>

```ts generated
snapshotNumbers: (snapshot: RangeSnapshot) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-snapshot-texts" data-pagefind-weight="1">
<summary><code>snapshotTexts</code></summary>

```ts generated
snapshotTexts: (snapshot: RangeSnapshot) => string[];
```

</details>

<details class="api-member" id="cell-store-sort-rows" data-pagefind-weight="1">
<summary><code>sortRows</code> <span class="api-member-summary">Stable row order sorted by a column.</span></summary>

```ts generated
sortRows: (sheet: number, col: number, ascending: boolean) => Uint32Array;
```

<p class="api-member-doc">Stable row order sorted by a column. Returns a data-row permutation.</p>
</details>

<details class="api-member" id="cell-store-sort-rows-multi" data-pagefind-weight="1">
<summary><code>sortRowsMulti</code></summary>

```ts generated
sortRowsMulti: (sheet: number, cols: Uint32Array, ascending: Uint8Array, candidates: Uint32Array) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-style-id-at" data-pagefind-weight="1">
<summary><code>styleIdAt</code> <span class="api-member-summary">Current style-dictionary id at a cell; 0 when out of bounds.</span></summary>

```ts generated
styleIdAt: (sheet: number, row: number, col: number) => number
```

<p class="api-member-doc">Current style-dictionary id at a cell; `0` when out of bounds. Used by
the host to write derived (reference-shadow) values without disturbing
the cell's style.</p>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class CellStore {
  addPagedSheet: (
    n_cols: number,
    row_count: number,
    chunk_rows: number,
    byte_budget: number,
  ) => number;
  addRows: (sheet: number, at: number, count: number) => void;
  addSheet: (n_cols: number, row_count: number) => number;
  aggregate: (sheet: number, col: number, op: number) => number;
  beginPageLoad: () => void;
  captureRange: (
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ) => RangeSnapshot | undefined;
  cellState: (sheet: number, row: number, col: number) => number;
  clearCell: (sheet: number, row: number, col: number, style: number) => void;
  clearRange: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    contents: boolean,
    style: boolean,
  ) => boolean;
  colCount: (sheet: number) => number;
  dataEdge: (
    sheet: number,
    row: number,
    col: number,
    d_row: number,
    d_col: number,
  ) => number;
  dataEdgeOrdered: (
    sheet: number,
    order: Uint32Array,
    row: number,
    col: number,
    d_row: number,
    d_col: number,
  ) => number;
  distinctValues: (
    sheet: number,
    col: number,
    limit: number,
  ) => DistinctColumn;
  endPageLoad: () => void;
  filterRows: (sheet: number, col: number, needle: string) => Uint32Array;
  filterRowsMulti: (
    sheet: number,
    cols: Uint32Array,
    kinds: Uint8Array,
    flags: Uint8Array,
    nums: Float64Array,
    num_counts: Uint32Array,
    text_counts: Uint32Array,
    value_nums: Float64Array,
    value_texts: string[],
  ) => Uint32Array;
  formulaSource: (
    sheet: number,
    row: number,
    col: number,
  ) => string | undefined;
  free: () => void;
  getCell: (sheet: number, row: number, col: number) => CellOut;
  getWindow: (
    sheet: number,
    row_start: number,
    row_end: number,
    cols: Uint32Array,
  ) => WindowView;
  getWindowRows: (
    sheet: number,
    rows: Uint32Array,
    cols: Uint32Array,
  ) => WindowView;
  insertCols: (sheet: number, at: number, count: number) => void;
  isFullyLoaded: (sheet: number) => boolean;
  isPaged: (sheet: number) => boolean;
  isSheetAlive: (sheet: number) => boolean;
  markRangeClean: (
    sheet: number,
    start_row: number,
    end_row: number,
    start_col: number,
    end_col: number,
  ) => void;
  pagedStats: (sheet: number) => Float64Array;
  pinRange: (
    sheet: number,
    start_row: number,
    end_row: number,
    cols: Uint32Array,
  ) => void;
  poolStrings: (ids: Uint32Array) => string[];
  queryResourceStats: () => Float64Array;
  rangeFullyLoaded: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
  ) => boolean;
  rangeStyleIds: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
  ) => Uint32Array;
  recompute: (sheet: number) => void;
  recomputeVolatile: (serial: number) => boolean;
  remapRangeStyles: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    old_ids: Uint32Array,
    new_ids: Uint32Array,
  ) => boolean;
  removeCols: (sheet: number, at: number, count: number) => void;
  removeNamedRange: (name: string, scope: number) => boolean;
  removeRows: (sheet: number, at: number, count: number) => void;
  removeSheet: (sheet: number) => boolean;
  renameSheet: (sheet: number, id: string, name: string) => boolean;
  resetQueryResourceStats: () => void;
  restoreRange: (
    sheet: number,
    r0: number,
    c0: number,
    snapshot: RangeSnapshot,
  ) => boolean;
  rowCount: (sheet: number) => number;
  search: (
    sheet: number,
    cols: Uint32Array,
    query: string,
    case_insensitive: boolean,
    whole_cell: boolean,
  ) => Uint32Array;
  setBlock: (
    sheet: number,
    start_row: number,
    start_col: number,
    rows: number,
    cols: number,
    kinds: Uint8Array,
    numbers: Float64Array,
    texts: string[],
    styles: Uint32Array,
  ) => boolean;
  setBool: (
    sheet: number,
    row: number,
    col: number,
    value: boolean,
    style: number,
  ) => void;
  setColumnNumbers: (
    sheet: number,
    col: number,
    start_row: number,
    values: Float64Array,
    style: number,
  ) => void;
  setColumnStrings: (
    sheet: number,
    col: number,
    start_row: number,
    values: string[],
    style: number,
  ) => void;
  setColumnStringsPacked: (
    sheet: number,
    col: number,
    start_row: number,
    buf: string,
    utf16_lens: Uint32Array,
    style: number,
  ) => void;
  setConditionalRules: (
    sheet: number,
    kinds: Uint8Array,
    bounds: Uint32Array,
    nums: Float64Array,
    strs: string[],
    flags: Uint8Array,
  ) => void;
  setFormula: (
    sheet: number,
    row: number,
    col: number,
    src: string,
    style: number,
  ) => number;
  setNamedRange: (
    name: string,
    scope: number,
    sheet: number,
    row_start: number,
    col_start: number,
    row_end: number,
    col_end: number,
  ) => boolean;
  setNumber: (
    sheet: number,
    row: number,
    col: number,
    value: number,
    style: number,
  ) => void;
  setSheetName: (sheet: number, id: string, name: string) => void;
  setString: (
    sheet: number,
    row: number,
    col: number,
    value: string,
    style: number,
  ) => void;
  snapshotNumbers: (snapshot: RangeSnapshot) => Float64Array;
  snapshotTexts: (snapshot: RangeSnapshot) => string[];
  sortRows: (sheet: number, col: number, ascending: boolean) => Uint32Array;
  sortRowsMulti: (
    sheet: number,
    cols: Uint32Array,
    ascending: Uint8Array,
    candidates: Uint32Array,
  ) => Uint32Array;
  styleIdAt: (sheet: number, row: number, col: number) => number;
}
```

</details>
