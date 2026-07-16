---
title: "CellAddress | @sheetwrite/core"
description: "Zero-based address of one cell on a stable sheet ID."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellAddress -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Zero-based address of one cell on a stable sheet ID.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L8</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="cell-address-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>
<pre><code>sheet: SheetId;</code></pre>
</details>

<details class="api-member" id="cell-address-row" data-pagefind-weight="1">
<summary><code>row</code></summary>
<pre><code>row: number;</code></pre>
</details>

<details class="api-member" id="cell-address-col" data-pagefind-weight="1">
<summary><code>col</code></summary>
<pre><code>col: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellAddress {
    sheet: SheetId;
    row: number;
    col: number;
}
```

</details>
