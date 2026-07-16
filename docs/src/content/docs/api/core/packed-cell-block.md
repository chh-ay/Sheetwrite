---
title: "PackedCellBlock | @sheetwrite/core"
description: "Dense row-major mutation payload."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PackedCellBlock -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Dense row-major mutation payload. Primitive arrays keep large paste/fill
operations JSON-safe without allocating one operation object per cell.
Formula/reference tuples are sparse exceptions keyed by row-major offset.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L208</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="packed-cell-block-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>
<pre><code>rowCount: number;</code></pre>
</details>

<details class="api-member" id="packed-cell-block-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>
<pre><code>colCount: number;</code></pre>
</details>

<details class="api-member" id="packed-cell-block-values" data-pagefind-weight="1">
<summary><code>values</code></summary>
<pre><code>values: CellScalar[];</code></pre>
</details>

<details class="api-member" id="packed-cell-block-formulas" data-pagefind-weight="1">
<summary><code>formulas</code></summary>
<pre><code>formulas?: Array&lt;[offset: number, source: string]&gt;;</code></pre>
</details>

<details class="api-member" id="packed-cell-block-refs" data-pagefind-weight="1">
<summary><code>refs</code></summary>
<pre><code>refs?: Array&lt;[offset: number, target: CellAddress]&gt;;</code></pre>
</details>

<details class="api-member" id="packed-cell-block-style-table" data-pagefind-weight="1">
<summary><code>styleTable</code></summary>
<pre><code>styleTable?: CellStyle[];</code></pre>
</details>

<details class="api-member" id="packed-cell-block-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code></summary>
<pre><code>styleIds?: number[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PackedCellBlock {
    rowCount: number;
    colCount: number;
    values: CellScalar[];
    formulas?: Array<[
        offset: number,
        source: string
    ]>;
    refs?: Array<[
        offset: number,
        target: CellAddress
    ]>;
    styleTable?: CellStyle[];
    styleIds?: number[];
}
```

</details>
