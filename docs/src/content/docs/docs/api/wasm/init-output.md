---
title: "InitOutput | @sheetwrite/wasm"
description: "Source summary unavailable; docs:check rejects this omission."
tableOfContents: false
---
<!-- api-export:@sheetwrite/wasm|.|InitOutput -->
[← @sheetwrite/wasm](/docs/api/wasm/)

<span class="api-status">interface</span>

Source summary unavailable; docs:check rejects this omission.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L283</code></dd></div>
</dl>

## Members <span class="api-count">95</span>

<div class="api-member-list">

<details class="api-member" id="init-output-memory" data-pagefind-weight="1">
<summary><code>memory</code></summary>
<pre><code>readonly memory: WebAssembly.Memory;</code></pre>
</details>

<details class="api-member" id="init-output-wbg-cellout-free" data-pagefind-weight="1">
<summary><code>__wbg_cellout_free</code></summary>
<pre><code>readonly __wbg_cellout_free: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-wbg-cellstore-free" data-pagefind-weight="1">
<summary><code>__wbg_cellstore_free</code></summary>
<pre><code>readonly __wbg_cellstore_free: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-wbg-distinctcolumn-free" data-pagefind-weight="1">
<summary><code>__wbg_distinctcolumn_free</code></summary>
<pre><code>readonly __wbg_distinctcolumn_free: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-wbg-rangesnapshot-free" data-pagefind-weight="1">
<summary><code>__wbg_rangesnapshot_free</code></summary>
<pre><code>readonly __wbg_rangesnapshot_free: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-wbg-windowview-free" data-pagefind-weight="1">
<summary><code>__wbg_windowview_free</code></summary>
<pre><code>readonly __wbg_windowview_free: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellout-kind" data-pagefind-weight="1">
<summary><code>cellout_kind</code></summary>
<pre><code>readonly cellout_kind: (a: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellout-num" data-pagefind-weight="1">
<summary><code>cellout_num</code></summary>
<pre><code>readonly cellout_num: (a: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellout-string" data-pagefind-weight="1">
<summary><code>cellout_string</code></summary>
<pre><code>readonly cellout_string: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellout-style" data-pagefind-weight="1">
<summary><code>cellout_style</code></summary>
<pre><code>readonly cellout_style: (a: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-add-paged-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addPagedSheet</code></summary>
<pre><code>readonly cellstore_addPagedSheet: (a: number, b: number, c: number, d: number, e: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-add-rows" data-pagefind-weight="1">
<summary><code>cellstore_addRows</code></summary>
<pre><code>readonly cellstore_addRows: (a: number, b: number, c: number, d: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-add-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addSheet</code></summary>
<pre><code>readonly cellstore_addSheet: (a: number, b: number, c: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-aggregate" data-pagefind-weight="1">
<summary><code>cellstore_aggregate</code></summary>
<pre><code>readonly cellstore_aggregate: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-begin-page-load" data-pagefind-weight="1">
<summary><code>cellstore_beginPageLoad</code></summary>
<pre><code>readonly cellstore_beginPageLoad: (a: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-capture-range" data-pagefind-weight="1">
<summary><code>cellstore_captureRange</code></summary>
<pre><code>readonly cellstore_captureRange: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-cell-state" data-pagefind-weight="1">
<summary><code>cellstore_cellState</code></summary>
<pre><code>readonly cellstore_cellState: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-clear-cell" data-pagefind-weight="1">
<summary><code>cellstore_clearCell</code></summary>
<pre><code>readonly cellstore_clearCell: (a: number, b: number, c: number, d: number, e: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-clear-range" data-pagefind-weight="1">
<summary><code>cellstore_clearRange</code></summary>
<pre><code>readonly cellstore_clearRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-col-count" data-pagefind-weight="1">
<summary><code>cellstore_colCount</code></summary>
<pre><code>readonly cellstore_colCount: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-data-edge" data-pagefind-weight="1">
<summary><code>cellstore_dataEdge</code></summary>
<pre><code>readonly cellstore_dataEdge: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-data-edge-ordered" data-pagefind-weight="1">
<summary><code>cellstore_dataEdgeOrdered</code></summary>
<pre><code>readonly cellstore_dataEdgeOrdered: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-distinct-values" data-pagefind-weight="1">
<summary><code>cellstore_distinctValues</code></summary>
<pre><code>readonly cellstore_distinctValues: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-end-page-load" data-pagefind-weight="1">
<summary><code>cellstore_endPageLoad</code></summary>
<pre><code>readonly cellstore_endPageLoad: (a: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-filter-rows" data-pagefind-weight="1">
<summary><code>cellstore_filterRows</code></summary>
<pre><code>readonly cellstore_filterRows: (a: number, b: number, c: number, d: number, e: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-filter-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_filterRowsMulti</code></summary>
<pre><code>readonly cellstore_filterRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-formula-source" data-pagefind-weight="1">
<summary><code>cellstore_formulaSource</code></summary>
<pre><code>readonly cellstore_formulaSource: (a: number, b: number, c: number, d: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-get-cell" data-pagefind-weight="1">
<summary><code>cellstore_getCell</code></summary>
<pre><code>readonly cellstore_getCell: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-get-window" data-pagefind-weight="1">
<summary><code>cellstore_getWindow</code></summary>
<pre><code>readonly cellstore_getWindow: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-get-window-rows" data-pagefind-weight="1">
<summary><code>cellstore_getWindowRows</code></summary>
<pre><code>readonly cellstore_getWindowRows: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-insert-cols" data-pagefind-weight="1">
<summary><code>cellstore_insertCols</code></summary>
<pre><code>readonly cellstore_insertCols: (a: number, b: number, c: number, d: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-is-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_isFullyLoaded</code></summary>
<pre><code>readonly cellstore_isFullyLoaded: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-is-paged" data-pagefind-weight="1">
<summary><code>cellstore_isPaged</code></summary>
<pre><code>readonly cellstore_isPaged: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-is-sheet-alive" data-pagefind-weight="1">
<summary><code>cellstore_isSheetAlive</code></summary>
<pre><code>readonly cellstore_isSheetAlive: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-mark-range-clean" data-pagefind-weight="1">
<summary><code>cellstore_markRangeClean</code></summary>
<pre><code>readonly cellstore_markRangeClean: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-new" data-pagefind-weight="1">
<summary><code>cellstore_new</code></summary>
<pre><code>readonly cellstore_new: () =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-paged-stats" data-pagefind-weight="1">
<summary><code>cellstore_pagedStats</code></summary>
<pre><code>readonly cellstore_pagedStats: (a: number, b: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-pin-range" data-pagefind-weight="1">
<summary><code>cellstore_pinRange</code></summary>
<pre><code>readonly cellstore_pinRange: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-pool-strings" data-pagefind-weight="1">
<summary><code>cellstore_poolStrings</code></summary>
<pre><code>readonly cellstore_poolStrings: (a: number, b: number, c: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-query-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_queryResourceStats</code></summary>
<pre><code>readonly cellstore_queryResourceStats: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-range-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_rangeFullyLoaded</code></summary>
<pre><code>readonly cellstore_rangeFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-range-style-ids" data-pagefind-weight="1">
<summary><code>cellstore_rangeStyleIds</code></summary>
<pre><code>readonly cellstore_rangeStyleIds: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-recompute" data-pagefind-weight="1">
<summary><code>cellstore_recompute</code></summary>
<pre><code>readonly cellstore_recompute: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-recompute-volatile" data-pagefind-weight="1">
<summary><code>cellstore_recomputeVolatile</code></summary>
<pre><code>readonly cellstore_recomputeVolatile: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-remap-range-styles" data-pagefind-weight="1">
<summary><code>cellstore_remapRangeStyles</code></summary>
<pre><code>readonly cellstore_remapRangeStyles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-remove-cols" data-pagefind-weight="1">
<summary><code>cellstore_removeCols</code></summary>
<pre><code>readonly cellstore_removeCols: (a: number, b: number, c: number, d: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-remove-named-range" data-pagefind-weight="1">
<summary><code>cellstore_removeNamedRange</code></summary>
<pre><code>readonly cellstore_removeNamedRange: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-remove-rows" data-pagefind-weight="1">
<summary><code>cellstore_removeRows</code></summary>
<pre><code>readonly cellstore_removeRows: (a: number, b: number, c: number, d: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-remove-sheet" data-pagefind-weight="1">
<summary><code>cellstore_removeSheet</code></summary>
<pre><code>readonly cellstore_removeSheet: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-rename-sheet" data-pagefind-weight="1">
<summary><code>cellstore_renameSheet</code></summary>
<pre><code>readonly cellstore_renameSheet: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-reset-query-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_resetQueryResourceStats</code></summary>
<pre><code>readonly cellstore_resetQueryResourceStats: (a: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-restore-range" data-pagefind-weight="1">
<summary><code>cellstore_restoreRange</code></summary>
<pre><code>readonly cellstore_restoreRange: (a: number, b: number, c: number, d: number, e: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-row-count" data-pagefind-weight="1">
<summary><code>cellstore_rowCount</code></summary>
<pre><code>readonly cellstore_rowCount: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-search" data-pagefind-weight="1">
<summary><code>cellstore_search</code></summary>
<pre><code>readonly cellstore_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-block" data-pagefind-weight="1">
<summary><code>cellstore_setBlock</code></summary>
<pre><code>readonly cellstore_setBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-bool" data-pagefind-weight="1">
<summary><code>cellstore_setBool</code></summary>
<pre><code>readonly cellstore_setBool: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-column-numbers" data-pagefind-weight="1">
<summary><code>cellstore_setColumnNumbers</code></summary>
<pre><code>readonly cellstore_setColumnNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-column-strings" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStrings</code></summary>
<pre><code>readonly cellstore_setColumnStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStringsPacked</code></summary>
<pre><code>readonly cellstore_setColumnStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-conditional-rules" data-pagefind-weight="1">
<summary><code>cellstore_setConditionalRules</code></summary>
<pre><code>readonly cellstore_setConditionalRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-formula" data-pagefind-weight="1">
<summary><code>cellstore_setFormula</code></summary>
<pre><code>readonly cellstore_setFormula: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-named-range" data-pagefind-weight="1">
<summary><code>cellstore_setNamedRange</code></summary>
<pre><code>readonly cellstore_setNamedRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-number" data-pagefind-weight="1">
<summary><code>cellstore_setNumber</code></summary>
<pre><code>readonly cellstore_setNumber: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-sheet-name" data-pagefind-weight="1">
<summary><code>cellstore_setSheetName</code></summary>
<pre><code>readonly cellstore_setSheetName: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-set-string" data-pagefind-weight="1">
<summary><code>cellstore_setString</code></summary>
<pre><code>readonly cellstore_setString: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-snapshot-numbers" data-pagefind-weight="1">
<summary><code>cellstore_snapshotNumbers</code></summary>
<pre><code>readonly cellstore_snapshotNumbers: (a: number, b: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-snapshot-texts" data-pagefind-weight="1">
<summary><code>cellstore_snapshotTexts</code></summary>
<pre><code>readonly cellstore_snapshotTexts: (a: number, b: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-sort-rows" data-pagefind-weight="1">
<summary><code>cellstore_sortRows</code></summary>
<pre><code>readonly cellstore_sortRows: (a: number, b: number, c: number, d: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-sort-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_sortRowsMulti</code></summary>
<pre><code>readonly cellstore_sortRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-cellstore-style-id-at" data-pagefind-weight="1">
<summary><code>cellstore_styleIdAt</code></summary>
<pre><code>readonly cellstore_styleIdAt: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-distinctcolumn-take-kinds" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeKinds</code></summary>
<pre><code>readonly distinctcolumn_takeKinds: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-distinctcolumn-take-numbers" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeNumbers</code></summary>
<pre><code>readonly distinctcolumn_takeNumbers: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-distinctcolumn-take-texts" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeTexts</code></summary>
<pre><code>readonly distinctcolumn_takeTexts: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-rangesnapshot-byte-length" data-pagefind-weight="1">
<summary><code>rangesnapshot_byteLength</code></summary>
<pre><code>readonly rangesnapshot_byteLength: (a: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-rangesnapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>rangesnapshot_formulaOffsets</code></summary>
<pre><code>readonly rangesnapshot_formulaOffsets: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-rangesnapshot-formula-sources" data-pagefind-weight="1">
<summary><code>rangesnapshot_formulaSources</code></summary>
<pre><code>readonly rangesnapshot_formulaSources: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-rangesnapshot-kinds" data-pagefind-weight="1">
<summary><code>rangesnapshot_kinds</code></summary>
<pre><code>readonly rangesnapshot_kinds: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-rangesnapshot-style-ids" data-pagefind-weight="1">
<summary><code>rangesnapshot_styleIds</code></summary>
<pre><code>readonly rangesnapshot_styleIds: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-n-cols" data-pagefind-weight="1">
<summary><code>windowview_nCols</code></summary>
<pre><code>readonly windowview_nCols: (a: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-windowview-n-rows" data-pagefind-weight="1">
<summary><code>windowview_nRows</code></summary>
<pre><code>readonly windowview_nRows: (a: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-cond-matches" data-pagefind-weight="1">
<summary><code>windowview_takeCondMatches</code></summary>
<pre><code>readonly windowview_takeCondMatches: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-string-ids" data-pagefind-weight="1">
<summary><code>windowview_takeStringIds</code></summary>
<pre><code>readonly windowview_takeStringIds: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-string-index" data-pagefind-weight="1">
<summary><code>windowview_takeStringIndex</code></summary>
<pre><code>readonly windowview_takeStringIndex: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-strings" data-pagefind-weight="1">
<summary><code>windowview_takeStrings</code></summary>
<pre><code>readonly windowview_takeStrings: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-style-dict" data-pagefind-weight="1">
<summary><code>windowview_takeStyleDict</code></summary>
<pre><code>readonly windowview_takeStyleDict: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-style-index" data-pagefind-weight="1">
<summary><code>windowview_takeStyleIndex</code></summary>
<pre><code>readonly windowview_takeStyleIndex: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-kinds" data-pagefind-weight="1">
<summary><code>windowview_takeKinds</code></summary>
<pre><code>readonly windowview_takeKinds: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-windowview-take-numbers" data-pagefind-weight="1">
<summary><code>windowview_takeNumbers</code></summary>
<pre><code>readonly windowview_takeNumbers: (a: number) =&gt; [number, number];</code></pre>
</details>

<details class="api-member" id="init-output-wbindgen-malloc" data-pagefind-weight="1">
<summary><code>__wbindgen_malloc</code></summary>
<pre><code>readonly __wbindgen_malloc: (a: number, b: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-wbindgen-realloc" data-pagefind-weight="1">
<summary><code>__wbindgen_realloc</code></summary>
<pre><code>readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-wbindgen-externrefs" data-pagefind-weight="1">
<summary><code>__wbindgen_externrefs</code></summary>
<pre><code>readonly __wbindgen_externrefs: WebAssembly.Table;</code></pre>
</details>

<details class="api-member" id="init-output-wbindgen-free" data-pagefind-weight="1">
<summary><code>__wbindgen_free</code></summary>
<pre><code>readonly __wbindgen_free: (a: number, b: number, c: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-externref-table-alloc" data-pagefind-weight="1">
<summary><code>__externref_table_alloc</code></summary>
<pre><code>readonly __externref_table_alloc: () =&gt; number;</code></pre>
</details>

<details class="api-member" id="init-output-externref-drop-slice" data-pagefind-weight="1">
<summary><code>__externref_drop_slice</code></summary>
<pre><code>readonly __externref_drop_slice: (a: number, b: number) =&gt; void;</code></pre>
</details>

<details class="api-member" id="init-output-wbindgen-start" data-pagefind-weight="1">
<summary><code>__wbindgen_start</code></summary>
<pre><code>readonly __wbindgen_start: () =&gt; void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_cellout_free: (a: number, b: number) => void;
    readonly __wbg_cellstore_free: (a: number, b: number) => void;
    readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
    readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
    readonly __wbg_windowview_free: (a: number, b: number) => void;
    readonly cellout_kind: (a: number) => number;
    readonly cellout_num: (a: number) => number;
    readonly cellout_string: (a: number) => [
        number,
        number
    ];
    readonly cellout_style: (a: number) => number;
    readonly cellstore_addPagedSheet: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly cellstore_addRows: (a: number, b: number, c: number, d: number) => void;
    readonly cellstore_addSheet: (a: number, b: number, c: number) => number;
    readonly cellstore_aggregate: (a: number, b: number, c: number, d: number) => number;
    readonly cellstore_beginPageLoad: (a: number) => void;
    readonly cellstore_captureRange: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly cellstore_cellState: (a: number, b: number, c: number, d: number) => number;
    readonly cellstore_clearCell: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly cellstore_clearRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly cellstore_colCount: (a: number, b: number) => number;
    readonly cellstore_dataEdge: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly cellstore_dataEdgeOrdered: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly cellstore_distinctValues: (a: number, b: number, c: number, d: number) => number;
    readonly cellstore_endPageLoad: (a: number) => void;
    readonly cellstore_filterRows: (a: number, b: number, c: number, d: number, e: number) => [
        number,
        number
    ];
    readonly cellstore_filterRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) => [
        number,
        number
    ];
    readonly cellstore_formulaSource: (a: number, b: number, c: number, d: number) => [
        number,
        number
    ];
    readonly cellstore_getCell: (a: number, b: number, c: number, d: number) => number;
    readonly cellstore_getWindow: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly cellstore_getWindowRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly cellstore_insertCols: (a: number, b: number, c: number, d: number) => void;
    readonly cellstore_isFullyLoaded: (a: number, b: number) => number;
    readonly cellstore_isPaged: (a: number, b: number) => number;
    readonly cellstore_isSheetAlive: (a: number, b: number) => number;
    readonly cellstore_markRangeClean: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cellstore_new: () => number;
    readonly cellstore_pagedStats: (a: number, b: number) => [
        number,
        number
    ];
    readonly cellstore_pinRange: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cellstore_poolStrings: (a: number, b: number, c: number) => [
        number,
        number
    ];
    readonly cellstore_queryResourceStats: (a: number) => [
        number,
        number
    ];
    readonly cellstore_rangeFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly cellstore_rangeStyleIds: (a: number, b: number, c: number, d: number, e: number, f: number) => [
        number,
        number
    ];
    readonly cellstore_recompute: (a: number, b: number) => void;
    readonly cellstore_recomputeVolatile: (a: number, b: number) => number;
    readonly cellstore_remapRangeStyles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
    readonly cellstore_removeCols: (a: number, b: number, c: number, d: number) => void;
    readonly cellstore_removeNamedRange: (a: number, b: number, c: number, d: number) => number;
    readonly cellstore_removeRows: (a: number, b: number, c: number, d: number) => void;
    readonly cellstore_removeSheet: (a: number, b: number) => number;
    readonly cellstore_renameSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly cellstore_resetQueryResourceStats: (a: number) => void;
    readonly cellstore_restoreRange: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly cellstore_rowCount: (a: number, b: number) => number;
    readonly cellstore_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [
        number,
        number
    ];
    readonly cellstore_setBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => number;
    readonly cellstore_setBool: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cellstore_setColumnNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly cellstore_setColumnStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly cellstore_setColumnStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly cellstore_setConditionalRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly cellstore_setFormula: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly cellstore_setNamedRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly cellstore_setNumber: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cellstore_setSheetName: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cellstore_setString: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly cellstore_snapshotNumbers: (a: number, b: number) => [
        number,
        number
    ];
    readonly cellstore_snapshotTexts: (a: number, b: number) => [
        number,
        number
    ];
    readonly cellstore_sortRows: (a: number, b: number, c: number, d: number) => [
        number,
        number
    ];
    readonly cellstore_sortRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [
        number,
        number
    ];
    readonly cellstore_styleIdAt: (a: number, b: number, c: number, d: number) => number;
    readonly distinctcolumn_takeKinds: (a: number) => [
        number,
        number
    ];
    readonly distinctcolumn_takeNumbers: (a: number) => [
        number,
        number
    ];
    readonly distinctcolumn_takeTexts: (a: number) => [
        number,
        number
    ];
    readonly rangesnapshot_byteLength: (a: number) => number;
    readonly rangesnapshot_formulaOffsets: (a: number) => [
        number,
        number
    ];
    readonly rangesnapshot_formulaSources: (a: number) => [
        number,
        number
    ];
    readonly rangesnapshot_kinds: (a: number) => [
        number,
        number
    ];
    readonly rangesnapshot_styleIds: (a: number) => [
        number,
        number
    ];
    readonly windowview_nCols: (a: number) => number;
    readonly windowview_nRows: (a: number) => number;
    readonly windowview_takeCondMatches: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeStringIds: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeStringIndex: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeStrings: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeStyleDict: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeStyleIndex: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeKinds: (a: number) => [
        number,
        number
    ];
    readonly windowview_takeNumbers: (a: number) => [
        number,
        number
    ];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}
```

</details>
