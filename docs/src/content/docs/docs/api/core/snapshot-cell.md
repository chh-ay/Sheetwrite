---
title: "SnapshotCell | @sheetwrite/core"
description: "Serializable cell value and optional style inside a snapshot block."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SnapshotCell -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Serializable cell value and optional style inside a snapshot block.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L191</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-cell-row-offset" data-pagefind-weight="1">
<summary><code>rowOffset</code></summary>
<pre><code>rowOffset: number;</code></pre>
</details>

<details class="api-member" id="snapshot-cell-col-offset" data-pagefind-weight="1">
<summary><code>colOffset</code></summary>
<pre><code>colOffset: number;</code></pre>
</details>

<details class="api-member" id="snapshot-cell-value" data-pagefind-weight="1">
<summary><code>value</code></summary>
<pre><code>value: CellValue;</code></pre>
</details>

<details class="api-member" id="snapshot-cell-style" data-pagefind-weight="1">
<summary><code>style</code></summary>
<pre><code>style?: CellStyle;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SnapshotCell {
    rowOffset: number;
    colOffset: number;
    value: CellValue;
    style?: CellStyle;
}
```

</details>
