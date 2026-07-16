---
title: "SimpleSheetwriteOptions | @sheetwrite/core/adapter"
description: "Framework-neutral simple columns, rows, sizing, and grid options."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleSheetwriteOptions -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">interface</span>

Framework-neutral simple columns, rows, sizing, and grid options.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L180</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="simple-sheetwrite-options-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>
<pre><code>columns: readonly SimpleColumn&lt;Row&gt;[];</code></pre>
</details>

<details class="api-member" id="simple-sheetwrite-options-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code></summary>
<pre><code>defaultRows: readonly Row[];</code></pre>
</details>

<details class="api-member" id="simple-sheetwrite-options-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code></summary>
<pre><code>sheetName?: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SimpleSheetwriteOptions<Row extends Record<string, CellScalar>> {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
}
```

</details>
