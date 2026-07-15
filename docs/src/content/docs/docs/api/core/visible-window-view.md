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
<summary><code>rows</code></summary>
<pre><code>rows: { start: number; end: number };</code></pre>
</details>

<details class="api-member" id="visible-window-view-cols" data-pagefind-weight="1">
<summary><code>cols</code></summary>
<pre><code>cols: readonly number[];</code></pre>
</details>

<details class="api-member" id="visible-window-view-values" data-pagefind-weight="1">
<summary><code>values</code></summary>
<pre><code>values: ArrayLike&lt;CellScalar&gt;;</code></pre>
</details>

<details class="api-member" id="visible-window-view-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code></summary>
<pre><code>styleIds: Uint32Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-styles" data-pagefind-weight="1">
<summary><code>styles</code></summary>
<pre><code>styles: readonly CellStyle[];</code></pre>
</details>

<details class="api-member" id="visible-window-view-value-kinds" data-pagefind-weight="1">
<summary><code>valueKinds</code></summary>
<pre><code>valueKinds?: Uint8Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-number-values" data-pagefind-weight="1">
<summary><code>numberValues</code></summary>
<pre><code>numberValues?: Float64Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-string-pool-ids" data-pagefind-weight="1">
<summary><code>stringPoolIds</code></summary>
<pre><code>stringPoolIds?: Uint32Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-string-local-ids" data-pagefind-weight="1">
<summary><code>stringLocalIds</code></summary>
<pre><code>stringLocalIds?: Int32Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-string-pool-update-ids" data-pagefind-weight="1">
<summary><code>stringPoolUpdateIds</code></summary>
<pre><code>stringPoolUpdateIds?: Uint32Array;</code></pre>
</details>

<details class="api-member" id="visible-window-view-string-pool-update-values" data-pagefind-weight="1">
<summary><code>stringPoolUpdateValues</code></summary>
<pre><code>stringPoolUpdateValues?: readonly string[];</code></pre>
</details>

<details class="api-member" id="visible-window-view-local-strings" data-pagefind-weight="1">
<summary><code>localStrings</code></summary>
<pre><code>localStrings?: readonly string[];</code></pre>
</details>

<details class="api-member" id="visible-window-view-ffi-calls" data-pagefind-weight="1">
<summary><code>ffiCalls</code></summary>
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
