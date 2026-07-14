---
title: "CellBlock | @sheetwrite/core"
description: "Sparse row-major cells bounded by one rectangular block."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellBlock -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Sparse row-major cells bounded by one rectangular block.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L213</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="cell-block-start-row" data-pagefind-weight="1">
<summary><code>startRow</code></summary>
<pre><code>startRow: number;</code></pre>
</details>

<details class="api-member" id="cell-block-start-col" data-pagefind-weight="1">
<summary><code>startCol</code></summary>
<pre><code>startCol: number;</code></pre>
</details>

<details class="api-member" id="cell-block-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>
<pre><code>rowCount: number;</code></pre>
</details>

<details class="api-member" id="cell-block-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>
<pre><code>colCount: number;</code></pre>
</details>

<details class="api-member" id="cell-block-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>
<pre><code>cells: SnapshotCell[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellBlock {
    startRow: number;
    startCol: number;
    rowCount: number;
    colCount: number;
    cells: SnapshotCell[];
}
```

</details>
