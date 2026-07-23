---
title: "InitOutput | @sheetwrite/wasm"
description: "Result of module initialization: the instantiated exports plus the shared linear memory."
---
<!-- api-export:@sheetwrite/wasm|.|InitOutput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="interface">interface</span></div>

Result of module initialization: the instantiated exports plus the shared linear memory.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L413</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>134</span>

<div class="api-member-list">

<details class="api-member" id="init-output-memory" data-pagefind-weight="1">
<summary><code>memory</code></summary>

```ts generated
readonly memory: WebAssembly.Memory;
```

</details>

<details class="api-member" id="init-output-wbg-cellout-free" data-pagefind-weight="1">
<summary><code>__wbg_cellout_free</code></summary>

```ts generated
readonly __wbg_cellout_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-cellstore-free" data-pagefind-weight="1">
<summary><code>__wbg_cellstore_free</code></summary>

```ts generated
readonly __wbg_cellstore_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-distinctcolumn-free" data-pagefind-weight="1">
<summary><code>__wbg_distinctcolumn_free</code></summary>

```ts generated
readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-rangesnapshot-free" data-pagefind-weight="1">
<summary><code>__wbg_rangesnapshot_free</code></summary>

```ts generated
readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-sourcesnapshot-free" data-pagefind-weight="1">
<summary><code>__wbg_sourcesnapshot_free</code></summary>

```ts generated
readonly __wbg_sourcesnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-windowview-free" data-pagefind-weight="1">
<summary><code>__wbg_windowview_free</code></summary>

```ts generated
readonly __wbg_windowview_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-cellout-kind" data-pagefind-weight="1">
<summary><code>cellout_kind</code></summary>

```ts generated
readonly cellout_kind: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellout-num" data-pagefind-weight="1">
<summary><code>cellout_num</code></summary>

```ts generated
readonly cellout_num: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellout-string" data-pagefind-weight="1">
<summary><code>cellout_string</code></summary>

```ts generated
readonly cellout_string: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellout-style" data-pagefind-weight="1">
<summary><code>cellout_style</code></summary>

```ts generated
readonly cellout_style: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-acknowledge-revision" data-pagefind-weight="1">
<summary><code>cellstore_acknowledgeRevision</code></summary>

```ts generated
readonly cellstore_acknowledgeRevision: (a: number, b: bigint) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-add-paged-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addPagedSheet</code></summary>

```ts generated
readonly cellstore_addPagedSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-add-rows" data-pagefind-weight="1">
<summary><code>cellstore_addRows</code></summary>

```ts generated
readonly cellstore_addRows: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-add-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addSheet</code></summary>

```ts generated
readonly cellstore_addSheet: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-aggregate" data-pagefind-weight="1">
<summary><code>cellstore_aggregate</code></summary>

```ts generated
readonly cellstore_aggregate: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-begin-mutation" data-pagefind-weight="1">
<summary><code>cellstore_beginMutation</code></summary>

```ts generated
readonly cellstore_beginMutation: (a: number) => bigint;
```

</details>

<details class="api-member" id="init-output-cellstore-begin-page-load" data-pagefind-weight="1">
<summary><code>cellstore_beginPageLoad</code></summary>

```ts generated
readonly cellstore_beginPageLoad: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-can-dirty-cell" data-pagefind-weight="1">
<summary><code>cellstore_canDirtyCell</code></summary>

```ts generated
readonly cellstore_canDirtyCell: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-range" data-pagefind-weight="1">
<summary><code>cellstore_captureRange</code></summary>

```ts generated
readonly cellstore_captureRange: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-references" data-pagefind-weight="1">
<summary><code>cellstore_captureReferences</code></summary>

```ts generated
readonly cellstore_captureReferences: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-sources" data-pagefind-weight="1">
<summary><code>cellstore_captureSources</code></summary>

```ts generated
readonly cellstore_captureSources: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-sources-for-rows" data-pagefind-weight="1">
<summary><code>cellstore_captureSourcesForRows</code></summary>

```ts generated
readonly cellstore_captureSourcesForRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-cell-state" data-pagefind-weight="1">
<summary><code>cellstore_cellState</code></summary>

```ts generated
readonly cellstore_cellState: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-clear-cell" data-pagefind-weight="1">
<summary><code>cellstore_clearCell</code></summary>

```ts generated
readonly cellstore_clearCell: (a: number, b: number, c: number, d: number, e: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-clear-range" data-pagefind-weight="1">
<summary><code>cellstore_clearRange</code></summary>

```ts generated
readonly cellstore_clearRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-col-count" data-pagefind-weight="1">
<summary><code>cellstore_colCount</code></summary>

```ts generated
readonly cellstore_colCount: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-columns-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_columnsFullyLoaded</code></summary>

```ts generated
readonly cellstore_columnsFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-compact-string-storage" data-pagefind-weight="1">
<summary><code>cellstore_compactStringStorage</code></summary>

```ts generated
readonly cellstore_compactStringStorage: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-data-edge" data-pagefind-weight="1">
<summary><code>cellstore_dataEdge</code></summary>

```ts generated
readonly cellstore_dataEdge: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-data-edge-ordered" data-pagefind-weight="1">
<summary><code>cellstore_dataEdgeOrdered</code></summary>

```ts generated
readonly cellstore_dataEdgeOrdered: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-dirty-revision" data-pagefind-weight="1">
<summary><code>cellstore_dirtyRevision</code></summary>

```ts generated
readonly cellstore_dirtyRevision: (a: number, b: number, c: number, d: number) => bigint;
```

</details>

<details class="api-member" id="init-output-cellstore-distinct-values" data-pagefind-weight="1">
<summary><code>cellstore_distinctValues</code></summary>

```ts generated
readonly cellstore_distinctValues: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-end-mutation" data-pagefind-weight="1">
<summary><code>cellstore_endMutation</code></summary>

```ts generated
readonly cellstore_endMutation: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-end-page-load" data-pagefind-weight="1">
<summary><code>cellstore_endPageLoad</code></summary>

```ts generated
readonly cellstore_endPageLoad: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-filter-rows" data-pagefind-weight="1">
<summary><code>cellstore_filterRows</code></summary>

```ts generated
readonly cellstore_filterRows: (a: number, b: number, c: number, d: number, e: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-filter-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_filterRowsMulti</code></summary>

```ts generated
readonly cellstore_filterRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-matrix-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_formulaMatrixResourceStats</code></summary>

```ts generated
readonly cellstore_formulaMatrixResourceStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-source" data-pagefind-weight="1">
<summary><code>cellstore_formulaSource</code></summary>

```ts generated
readonly cellstore_formulaSource: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-get-cell" data-pagefind-weight="1">
<summary><code>cellstore_getCell</code></summary>

```ts generated
readonly cellstore_getCell: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-get-window" data-pagefind-weight="1">
<summary><code>cellstore_getWindow</code></summary>

```ts generated
readonly cellstore_getWindow: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-get-window-rows" data-pagefind-weight="1">
<summary><code>cellstore_getWindowRows</code></summary>

```ts generated
readonly cellstore_getWindowRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-hydrate-page-numbers" data-pagefind-weight="1">
<summary><code>cellstore_hydratePageNumbers</code></summary>

```ts generated
readonly cellstore_hydratePageNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-hydrate-page-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_hydratePageStringsPacked</code></summary>

```ts generated
readonly cellstore_hydratePageStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-insert-cols" data-pagefind-weight="1">
<summary><code>cellstore_insertCols</code></summary>

```ts generated
readonly cellstore_insertCols: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-is-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_isFullyLoaded</code></summary>

```ts generated
readonly cellstore_isFullyLoaded: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-is-paged" data-pagefind-weight="1">
<summary><code>cellstore_isPaged</code></summary>

```ts generated
readonly cellstore_isPaged: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-is-sheet-alive" data-pagefind-weight="1">
<summary><code>cellstore_isSheetAlive</code></summary>

```ts generated
readonly cellstore_isSheetAlive: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-mark-cell-clean-revision" data-pagefind-weight="1">
<summary><code>cellstore_markCellCleanRevision</code></summary>

```ts generated
readonly cellstore_markCellCleanRevision: (a: number, b: number, c: number, d: number, e: bigint) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-mark-range-clean" data-pagefind-weight="1">
<summary><code>cellstore_markRangeClean</code></summary>

```ts generated
readonly cellstore_markRangeClean: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-memory-stats" data-pagefind-weight="1">
<summary><code>cellstore_memoryStats</code></summary>

```ts generated
readonly cellstore_memoryStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-new" data-pagefind-weight="1">
<summary><code>cellstore_new</code></summary>

```ts generated
readonly cellstore_new: () => number;
```

</details>

<details class="api-member" id="init-output-cellstore-paged-dirty-coordinates" data-pagefind-weight="1">
<summary><code>cellstore_pagedDirtyCoordinates</code></summary>

```ts generated
readonly cellstore_pagedDirtyCoordinates: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-paged-stats" data-pagefind-weight="1">
<summary><code>cellstore_pagedStats</code></summary>

```ts generated
readonly cellstore_pagedStats: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-persisted-cell-data" data-pagefind-weight="1">
<summary><code>cellstore_persistedCellData</code></summary>

```ts generated
readonly cellstore_persistedCellData: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-pin-range" data-pagefind-weight="1">
<summary><code>cellstore_pinRange</code></summary>

```ts generated
readonly cellstore_pinRange: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-pool-strings" data-pagefind-weight="1">
<summary><code>cellstore_poolStrings</code></summary>

```ts generated
readonly cellstore_poolStrings: (a: number, b: number, c: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-query-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_queryResourceStats</code></summary>

```ts generated
readonly cellstore_queryResourceStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-range-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_rangeFullyLoaded</code></summary>

```ts generated
readonly cellstore_rangeFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-range-style-ids" data-pagefind-weight="1">
<summary><code>cellstore_rangeStyleIds</code></summary>

```ts generated
readonly cellstore_rangeStyleIds: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-recompute" data-pagefind-weight="1">
<summary><code>cellstore_recompute</code></summary>

```ts generated
readonly cellstore_recompute: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-recompute-changed" data-pagefind-weight="1">
<summary><code>cellstore_recomputeChanged</code></summary>

```ts generated
readonly cellstore_recomputeChanged: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-recompute-volatile" data-pagefind-weight="1">
<summary><code>cellstore_recomputeVolatile</code></summary>

```ts generated
readonly cellstore_recomputeVolatile: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-reference-target" data-pagefind-weight="1">
<summary><code>cellstore_referenceTarget</code></summary>

```ts generated
readonly cellstore_referenceTarget: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-references-targeting" data-pagefind-weight="1">
<summary><code>cellstore_referencesTargeting</code></summary>

```ts generated
readonly cellstore_referencesTargeting: (a: number, b: number, c: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-remap-range-styles" data-pagefind-weight="1">
<summary><code>cellstore_remapRangeStyles</code></summary>

```ts generated
readonly cellstore_remapRangeStyles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-cols" data-pagefind-weight="1">
<summary><code>cellstore_removeCols</code></summary>

```ts generated
readonly cellstore_removeCols: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-named-range" data-pagefind-weight="1">
<summary><code>cellstore_removeNamedRange</code></summary>

```ts generated
readonly cellstore_removeNamedRange: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-rows" data-pagefind-weight="1">
<summary><code>cellstore_removeRows</code></summary>

```ts generated
readonly cellstore_removeRows: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-sheet" data-pagefind-weight="1">
<summary><code>cellstore_removeSheet</code></summary>

```ts generated
readonly cellstore_removeSheet: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-table" data-pagefind-weight="1">
<summary><code>cellstore_removeTable</code></summary>

```ts generated
readonly cellstore_removeTable: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-rename-sheet" data-pagefind-weight="1">
<summary><code>cellstore_renameSheet</code></summary>

```ts generated
readonly cellstore_renameSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-reset-formula-matrix-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_resetFormulaMatrixResourceStats</code></summary>

```ts generated
readonly cellstore_resetFormulaMatrixResourceStats: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-reset-query-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_resetQueryResourceStats</code></summary>

```ts generated
readonly cellstore_resetQueryResourceStats: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-restore-range" data-pagefind-weight="1">
<summary><code>cellstore_restoreRange</code></summary>

```ts generated
readonly cellstore_restoreRange: (a: number, b: number, c: number, d: number, e: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-row-count" data-pagefind-weight="1">
<summary><code>cellstore_rowCount</code></summary>

```ts generated
readonly cellstore_rowCount: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-search" data-pagefind-weight="1">
<summary><code>cellstore_search</code></summary>

```ts generated
readonly cellstore_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-set-block" data-pagefind-weight="1">
<summary><code>cellstore_setBlock</code></summary>

```ts generated
readonly cellstore_setBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-bool" data-pagefind-weight="1">
<summary><code>cellstore_setBool</code></summary>

```ts generated
readonly cellstore_setBool: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-numbers" data-pagefind-weight="1">
<summary><code>cellstore_setColumnNumbers</code></summary>

```ts generated
readonly cellstore_setColumnNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-strings" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStrings</code></summary>

```ts generated
readonly cellstore_setColumnStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStringsPacked</code></summary>

```ts generated
readonly cellstore_setColumnStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-conditional-rules" data-pagefind-weight="1">
<summary><code>cellstore_setConditionalRules</code></summary>

```ts generated
readonly cellstore_setConditionalRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-formula" data-pagefind-weight="1">
<summary><code>cellstore_setFormula</code></summary>

```ts generated
readonly cellstore_setFormula: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-named-range" data-pagefind-weight="1">
<summary><code>cellstore_setNamedRange</code></summary>

```ts generated
readonly cellstore_setNamedRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-number" data-pagefind-weight="1">
<summary><code>cellstore_setNumber</code></summary>

```ts generated
readonly cellstore_setNumber: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-sheet-name" data-pagefind-weight="1">
<summary><code>cellstore_setSheetName</code></summary>

```ts generated
readonly cellstore_setSheetName: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-sparse-block" data-pagefind-weight="1">
<summary><code>cellstore_setSparseBlock</code></summary>

```ts generated
readonly cellstore_setSparseBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-spill-blockers" data-pagefind-weight="1">
<summary><code>cellstore_setSpillBlockers</code></summary>

```ts generated
readonly cellstore_setSpillBlockers: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-string" data-pagefind-weight="1">
<summary><code>cellstore_setString</code></summary>

```ts generated
readonly cellstore_setString: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-table" data-pagefind-weight="1">
<summary><code>cellstore_setTable</code></summary>

```ts generated
readonly cellstore_setTable: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-snapshot-numbers" data-pagefind-weight="1">
<summary><code>cellstore_snapshotNumbers</code></summary>

```ts generated
readonly cellstore_snapshotNumbers: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-snapshot-texts" data-pagefind-weight="1">
<summary><code>cellstore_snapshotTexts</code></summary>

```ts generated
readonly cellstore_snapshotTexts: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-sort-rows" data-pagefind-weight="1">
<summary><code>cellstore_sortRows</code></summary>

```ts generated
readonly cellstore_sortRows: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-sort-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_sortRowsMulti</code></summary>

```ts generated
readonly cellstore_sortRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-anchor-col" data-pagefind-weight="1">
<summary><code>cellstore_spillAnchorCol</code></summary>

```ts generated
readonly cellstore_spillAnchorCol: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-spill-anchor-row" data-pagefind-weight="1">
<summary><code>cellstore_spillAnchorRow</code></summary>

```ts generated
readonly cellstore_spillAnchorRow: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-spill-derived-mask" data-pagefind-weight="1">
<summary><code>cellstore_spillDerivedMask</code></summary>

```ts generated
readonly cellstore_spillDerivedMask: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-derived-mask-for-rows" data-pagefind-weight="1">
<summary><code>cellstore_spillDerivedMaskForRows</code></summary>

```ts generated
readonly cellstore_spillDerivedMaskForRows: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-owner-coordinates" data-pagefind-weight="1">
<summary><code>cellstore_spillOwnerCoordinates</code></summary>

```ts generated
readonly cellstore_spillOwnerCoordinates: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-style-id-at" data-pagefind-weight="1">
<summary><code>cellstore_styleIdAt</code></summary>

```ts generated
readonly cellstore_styleIdAt: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-wasm-committed-bytes" data-pagefind-weight="1">
<summary><code>cellstore_wasmCommittedBytes</code></summary>

```ts generated
readonly cellstore_wasmCommittedBytes: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-kinds" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeKinds</code></summary>

```ts generated
readonly distinctcolumn_takeKinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-numbers" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeNumbers</code></summary>

```ts generated
readonly distinctcolumn_takeNumbers: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-texts" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeTexts</code></summary>

```ts generated
readonly distinctcolumn_takeTexts: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-byte-length" data-pagefind-weight="1">
<summary><code>rangesnapshot_byteLength</code></summary>

```ts generated
readonly rangesnapshot_byteLength: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-rangesnapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>rangesnapshot_formulaOffsets</code></summary>

```ts generated
readonly rangesnapshot_formulaOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-formula-sources" data-pagefind-weight="1">
<summary><code>rangesnapshot_formulaSources</code></summary>

```ts generated
readonly rangesnapshot_formulaSources: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-kinds" data-pagefind-weight="1">
<summary><code>rangesnapshot_kinds</code></summary>

```ts generated
readonly rangesnapshot_kinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>rangesnapshot_referenceOffsets</code></summary>

```ts generated
readonly rangesnapshot_referenceOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-reference-targets" data-pagefind-weight="1">
<summary><code>rangesnapshot_referenceTargets</code></summary>

```ts generated
readonly rangesnapshot_referenceTargets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-style-ids" data-pagefind-weight="1">
<summary><code>rangesnapshot_styleIds</code></summary>

```ts generated
readonly rangesnapshot_styleIds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-byte-length" data-pagefind-weight="1">
<summary><code>sourcesnapshot_byteLength</code></summary>

```ts generated
readonly sourcesnapshot_byteLength: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>sourcesnapshot_formulaOffsets</code></summary>

```ts generated
readonly sourcesnapshot_formulaOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-formula-sources" data-pagefind-weight="1">
<summary><code>sourcesnapshot_formulaSources</code></summary>

```ts generated
readonly sourcesnapshot_formulaSources: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>sourcesnapshot_referenceOffsets</code></summary>

```ts generated
readonly sourcesnapshot_referenceOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-reference-targets" data-pagefind-weight="1">
<summary><code>sourcesnapshot_referenceTargets</code></summary>

```ts generated
readonly sourcesnapshot_referenceTargets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-n-cols" data-pagefind-weight="1">
<summary><code>windowview_nCols</code></summary>

```ts generated
readonly windowview_nCols: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-windowview-n-rows" data-pagefind-weight="1">
<summary><code>windowview_nRows</code></summary>

```ts generated
readonly windowview_nRows: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-windowview-take-cond-matches" data-pagefind-weight="1">
<summary><code>windowview_takeCondMatches</code></summary>

```ts generated
readonly windowview_takeCondMatches: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-string-ids" data-pagefind-weight="1">
<summary><code>windowview_takeStringIds</code></summary>

```ts generated
readonly windowview_takeStringIds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-string-index" data-pagefind-weight="1">
<summary><code>windowview_takeStringIndex</code></summary>

```ts generated
readonly windowview_takeStringIndex: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-strings" data-pagefind-weight="1">
<summary><code>windowview_takeStrings</code></summary>

```ts generated
readonly windowview_takeStrings: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-style-dict" data-pagefind-weight="1">
<summary><code>windowview_takeStyleDict</code></summary>

```ts generated
readonly windowview_takeStyleDict: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-style-index" data-pagefind-weight="1">
<summary><code>windowview_takeStyleIndex</code></summary>

```ts generated
readonly windowview_takeStyleIndex: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-kinds" data-pagefind-weight="1">
<summary><code>windowview_takeKinds</code></summary>

```ts generated
readonly windowview_takeKinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-numbers" data-pagefind-weight="1">
<summary><code>windowview_takeNumbers</code></summary>

```ts generated
readonly windowview_takeNumbers: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-wbindgen-malloc" data-pagefind-weight="1">
<summary><code>__wbindgen_malloc</code></summary>

```ts generated
readonly __wbindgen_malloc: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-realloc" data-pagefind-weight="1">
<summary><code>__wbindgen_realloc</code></summary>

```ts generated
readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-externrefs" data-pagefind-weight="1">
<summary><code>__wbindgen_externrefs</code></summary>

```ts generated
readonly __wbindgen_externrefs: WebAssembly.Table;
```

</details>

<details class="api-member" id="init-output-wbindgen-free" data-pagefind-weight="1">
<summary><code>__wbindgen_free</code></summary>

```ts generated
readonly __wbindgen_free: (a: number, b: number, c: number) => void;
```

</details>

<details class="api-member" id="init-output-externref-table-alloc" data-pagefind-weight="1">
<summary><code>__externref_table_alloc</code></summary>

```ts generated
readonly __externref_table_alloc: () => number;
```

</details>

<details class="api-member" id="init-output-externref-drop-slice" data-pagefind-weight="1">
<summary><code>__externref_drop_slice</code></summary>

```ts generated
readonly __externref_drop_slice: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbindgen-start" data-pagefind-weight="1">
<summary><code>__wbindgen_start</code></summary>

```ts generated
readonly __wbindgen_start: () => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_cellout_free: (a: number, b: number) => void;
  readonly __wbg_cellstore_free: (a: number, b: number) => void;
  readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
  readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
  readonly __wbg_sourcesnapshot_free: (a: number, b: number) => void;
  readonly __wbg_windowview_free: (a: number, b: number) => void;
  readonly cellout_kind: (a: number) => number;
  readonly cellout_num: (a: number) => number;
  readonly cellout_string: (a: number) => [number, number];
  readonly cellout_style: (a: number) => number;
  readonly cellstore_acknowledgeRevision: (a: number, b: bigint) => void;
  readonly cellstore_addPagedSheet: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_addRows: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_addSheet: (a: number, b: number, c: number) => number;
  readonly cellstore_aggregate: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_beginMutation: (a: number) => bigint;
  readonly cellstore_beginPageLoad: (a: number) => void;
  readonly cellstore_canDirtyCell: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_captureRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_captureReferences: (
    a: number,
    b: number,
    c: number,
  ) => number;
  readonly cellstore_captureSources: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_captureSourcesForRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_cellState: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_clearCell: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => void;
  readonly cellstore_clearRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => number;
  readonly cellstore_colCount: (a: number, b: number) => number;
  readonly cellstore_columnsFullyLoaded: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_compactStringStorage: (a: number) => void;
  readonly cellstore_dataEdge: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_dataEdgeOrdered: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => number;
  readonly cellstore_dirtyRevision: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => bigint;
  readonly cellstore_distinctValues: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_endMutation: (a: number) => void;
  readonly cellstore_endPageLoad: (a: number) => void;
  readonly cellstore_filterRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => [number, number];
  readonly cellstore_filterRowsMulti: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
  ) => [number, number];
  readonly cellstore_formulaMatrixResourceStats: (
    a: number,
  ) => [number, number];
  readonly cellstore_formulaSource: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number];
  readonly cellstore_getCell: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_getWindow: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_getWindowRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_hydratePageNumbers: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => void;
  readonly cellstore_hydratePageStringsPacked: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
  ) => void;
  readonly cellstore_insertCols: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_isFullyLoaded: (a: number, b: number) => number;
  readonly cellstore_isPaged: (a: number, b: number) => number;
  readonly cellstore_isSheetAlive: (a: number, b: number) => number;
  readonly cellstore_markCellCleanRevision: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: bigint,
  ) => number;
  readonly cellstore_markRangeClean: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_memoryStats: (a: number) => [number, number];
  readonly cellstore_new: () => number;
  readonly cellstore_pagedDirtyCoordinates: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_pagedStats: (a: number, b: number) => [number, number];
  readonly cellstore_persistedCellData: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_pinRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_poolStrings: (
    a: number,
    b: number,
    c: number,
  ) => [number, number];
  readonly cellstore_queryResourceStats: (a: number) => [number, number];
  readonly cellstore_rangeFullyLoaded: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_rangeStyleIds: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_recompute: (a: number, b: number) => void;
  readonly cellstore_recomputeChanged: (a: number) => void;
  readonly cellstore_recomputeVolatile: (a: number, b: number) => number;
  readonly cellstore_referenceTarget: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number];
  readonly cellstore_referencesTargeting: (
    a: number,
    b: number,
    c: number,
  ) => [number, number];
  readonly cellstore_remapRangeStyles: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
  ) => number;
  readonly cellstore_removeCols: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_removeNamedRange: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_removeRows: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_removeSheet: (a: number, b: number) => number;
  readonly cellstore_removeTable: (a: number, b: number, c: number) => number;
  readonly cellstore_renameSheet: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_resetFormulaMatrixResourceStats: (a: number) => void;
  readonly cellstore_resetQueryResourceStats: (a: number) => void;
  readonly cellstore_restoreRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => number;
  readonly cellstore_rowCount: (a: number, b: number) => number;
  readonly cellstore_search: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => [number, number];
  readonly cellstore_setBlock: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
  ) => number;
  readonly cellstore_setBool: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_setColumnNumbers: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly cellstore_setColumnStrings: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly cellstore_setColumnStringsPacked: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => void;
  readonly cellstore_setConditionalRules: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
  ) => void;
  readonly cellstore_setFormula: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => number;
  readonly cellstore_setNamedRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => number;
  readonly cellstore_setNumber: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_setSheetName: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_setSparseBlock: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
  ) => number;
  readonly cellstore_setSpillBlockers: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_setString: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly cellstore_setTable: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
  ) => number;
  readonly cellstore_snapshotNumbers: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_snapshotTexts: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_sortRows: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number];
  readonly cellstore_sortRowsMulti: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => [number, number];
  readonly cellstore_spillAnchorCol: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_spillAnchorRow: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_spillDerivedMask: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_spillDerivedMaskForRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_spillOwnerCoordinates: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_styleIdAt: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_wasmCommittedBytes: (a: number) => number;
  readonly distinctcolumn_takeKinds: (a: number) => [number, number];
  readonly distinctcolumn_takeNumbers: (a: number) => [number, number];
  readonly distinctcolumn_takeTexts: (a: number) => [number, number];
  readonly rangesnapshot_byteLength: (a: number) => number;
  readonly rangesnapshot_formulaOffsets: (a: number) => [number, number];
  readonly rangesnapshot_formulaSources: (a: number) => [number, number];
  readonly rangesnapshot_kinds: (a: number) => [number, number];
  readonly rangesnapshot_referenceOffsets: (a: number) => [number, number];
  readonly rangesnapshot_referenceTargets: (a: number) => [number, number];
  readonly rangesnapshot_styleIds: (a: number) => [number, number];
  readonly sourcesnapshot_byteLength: (a: number) => number;
  readonly sourcesnapshot_formulaOffsets: (a: number) => [number, number];
  readonly sourcesnapshot_formulaSources: (a: number) => [number, number];
  readonly sourcesnapshot_referenceOffsets: (a: number) => [number, number];
  readonly sourcesnapshot_referenceTargets: (a: number) => [number, number];
  readonly windowview_nCols: (a: number) => number;
  readonly windowview_nRows: (a: number) => number;
  readonly windowview_takeCondMatches: (a: number) => [number, number];
  readonly windowview_takeStringIds: (a: number) => [number, number];
  readonly windowview_takeStringIndex: (a: number) => [number, number];
  readonly windowview_takeStrings: (a: number) => [number, number];
  readonly windowview_takeStyleDict: (a: number) => [number, number];
  readonly windowview_takeStyleIndex: (a: number) => [number, number];
  readonly windowview_takeKinds: (a: number) => [number, number];
  readonly windowview_takeNumbers: (a: number) => [number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_start: () => void;
}
```

</details>
