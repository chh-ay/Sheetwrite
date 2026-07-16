---
title: "VisibleWindowView | @sheetwrite/core"
description: "One rectangular window of resolved cells, returned by Store.getVisibleWindow in a single call."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|VisibleWindowView -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

One rectangular window of resolved cells, returned by `Store.getVisibleWindow`
in a single call. The renderer paints from this view and MUST NOT call
`Store.getCell` per cell. `styleIds` are view-local indices into this view's
compact `styles` dictionary; on the worker renderer path, `styleIds.buffer` is
transferred during paint, so main-thread code must not read it after `paint`.

Lifetime: valid until the next store mutation or window refresh.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L29</code></dd></div>
</dl>

## Members <span class="api-count">14</span>

<div class="api-member-list">

<details class="api-member" id="visible-window-view-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>
<pre><code>sheet: SheetId;</code></pre>
</details>

<details class="api-member" id="visible-window-view-rows" data-pagefind-weight="1">
<summary><code>rows</code> <span class="api-member-summary">end-exclusive row range</span></summary>
<pre><code>rows: { start: number; end: number };</code></pre>
</details>

<details class="api-member" id="visible-window-view-cols" data-pagefind-weight="1">
<summary><code>cols</code> <span class="api-member-summary">visible column indices, in paint order</span></summary>
<pre><code>cols: readonly number[];</code></pre>
</details>

<details class="api-member" id="visible-window-view-values" data-pagefind-weight="1">
<summary><code>values</code> <span class="api-member-summary">row-major resolved values, length (end-start) cols.length</span></summary>
<pre><code>values: ArrayLike&lt;CellScalar&gt;;</code></pre>
<p class="api-member-doc">row-major resolved values, length `(end-start) * cols.length`</p>
</details>

<details class="api-member" id="visible-window-view-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code> <span class="api-member-summary">row-major view-local style ids, same length as values</span></summary>
<pre><code>styleIds: Uint32Array;</code></pre>
<p class="api-member-doc">row-major view-local style ids, same length as `values`</p>
</details>

<details class="api-member" id="visible-window-view-styles" data-pagefind-weight="1">
<summary><code>styles</code> <span class="api-member-summary">compact window style dictionary indexed by styleIds</span></summary>
<pre><code>styles: readonly CellStyle[];</code></pre>
<p class="api-member-doc">compact window style dictionary indexed by `styleIds`</p>
</details>

<details class="api-member" id="visible-window-view-value-kinds" data-pagefind-weight="1">
<summary><code>valueKinds</code> <span class="api-member-summary">Raw cell tags for worker transfer; internal fast path.</span></summary>
<pre><code>valueKinds?: Uint8Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-number-values" data-pagefind-weight="1">
<summary><code>numberValues</code> <span class="api-member-summary">Raw numeric payloads for worker transfer; internal fast path.</span></summary>
<pre><code>numberValues?: Float64Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-string-pool-ids" data-pagefind-weight="1">
<summary><code>stringPoolIds</code> <span class="api-member-summary">Raw global string-pool ids for worker transfer; 0xffffffff means none.</span></summary>
<pre><code>stringPoolIds?: Uint32Array;</code></pre>
<p class="api-member-doc">Raw global string-pool ids for worker transfer; `0xffffffff` means none.</p>
</details>

<details class="api-member" id="visible-window-view-string-local-ids" data-pagefind-weight="1">
<summary><code>stringLocalIds</code> <span class="api-member-summary">Raw local-string indices for formula errors; -1 means none.</span></summary>
<pre><code>stringLocalIds?: Int32Array;</code></pre>
<p class="api-member-doc">Raw local-string indices for formula errors; `-1` means none.</p>
</details>

<details class="api-member" id="visible-window-view-string-pool-update-ids" data-pagefind-weight="1">
<summary><code>stringPoolUpdateIds</code> <span class="api-member-summary">String-pool ids resolved by this window and safe for worker cache updates.</span></summary>
<pre><code>stringPoolUpdateIds?: Uint32Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-string-pool-update-values" data-pagefind-weight="1">
<summary><code>stringPoolUpdateValues</code> <span class="api-member-summary">String values parallel to stringPoolUpdateIds.</span></summary>
<pre><code>stringPoolUpdateValues?: readonly string[];</code></pre>
<p class="api-member-doc">String values parallel to `stringPoolUpdateIds`.</p>
</details>

<details class="api-member" id="visible-window-view-local-strings" data-pagefind-weight="1">
<summary><code>localStrings</code> <span class="api-member-summary">Local non-pooled strings, currently formula error sentinels.</span></summary>
<pre><code>localStrings?: readonly string[];</code></pre>
</details>

<details class="api-member" id="visible-window-view-ffi-calls" data-pagefind-weight="1">
<summary><code>ffiCalls</code> <span class="api-member-summary">Internal count of WASM boundary calls used to produce this window.</span></summary>
<pre><code>ffiCalls?: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface VisibleWindowView {
    sheet: SheetId;
    rows: {
        start: number;
        end: number;
    };
    cols: readonly number[];
    values: ArrayLike<CellScalar>;
    styleIds: Uint32Array;
    styles: readonly CellStyle[];
    valueKinds?: Uint8Array;
    numberValues?: Float64Array;
    stringPoolIds?: Uint32Array;
    stringLocalIds?: Int32Array;
    stringPoolUpdateIds?: Uint32Array;
    stringPoolUpdateValues?: readonly string[];
    localStrings?: readonly string[];
    ffiCalls?: number;
}
```

</details>
