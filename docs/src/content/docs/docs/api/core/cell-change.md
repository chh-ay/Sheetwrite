---
title: "CellChange | @sheetwrite/core"
description: "One committed cell edit, carrying enough to roll back."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellChange -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

One committed cell edit, carrying enough to roll back.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L132</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="cell-change-addr" data-pagefind-weight="1">
<summary><code>addr</code></summary>
<pre><code>addr: CellAddress;</code></pre>
</details>

<details class="api-member" id="cell-change-old-value" data-pagefind-weight="1">
<summary><code>oldValue</code></summary>
<pre><code>oldValue: CellValue;</code></pre>
</details>

<details class="api-member" id="cell-change-new-value" data-pagefind-weight="1">
<summary><code>newValue</code></summary>
<pre><code>newValue: CellValue;</code></pre>
</details>

<details class="api-member" id="cell-change-old-style" data-pagefind-weight="1">
<summary><code>oldStyle</code></summary>
<pre><code>oldStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="cell-change-new-style" data-pagefind-weight="1">
<summary><code>newStyle</code></summary>
<pre><code>newStyle?: CellStyle;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellChange {
    addr: CellAddress;
    oldValue: CellValue;
    newValue: CellValue;
    oldStyle?: CellStyle;
    newStyle?: CellStyle;
}
```

</details>
