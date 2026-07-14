---
title: "CellInputSnapshot | @sheetwrite/core"
description: "View-aware editable snapshot of one cell, for hosts building a detached formula bar or cell inspector."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellInputSnapshot -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

View-aware editable snapshot of one cell, for hosts building a detached
formula bar or cell inspector. `address` is the translated *data* address —
the correct target for `Grid.applyTransaction` even under an active
sort/filter view — while the `(row, col)` inputs of
`Grid.getCellInput` are active-sheet view coordinates.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L317</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="cell-input-snapshot-address" data-pagefind-weight="1">
<summary><code>address</code></summary>
<pre><code>readonly address: CellAddress;</code></pre>
</details>

<details class="api-member" id="cell-input-snapshot-text" data-pagefind-weight="1">
<summary><code>text</code></summary>
<pre><code>readonly text: string;</code></pre>
</details>

<details class="api-member" id="cell-input-snapshot-format" data-pagefind-weight="1">
<summary><code>format</code></summary>
<pre><code>readonly format: CellFormat;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellInputSnapshot {
    readonly address: CellAddress;
    readonly text: string;
    readonly format: CellFormat;
}
```

</details>
