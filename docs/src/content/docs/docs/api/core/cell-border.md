---
title: "CellBorder | @sheetwrite/core"
description: "Visual border applied to one or more sides of a cell."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellBorder -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Visual border applied to one or more sides of a cell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L10</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="cell-border-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">hex color, e.g. &quot;#111111&quot;</span></summary>
<pre><code>color?: string;</code></pre>
</details>

<details class="api-member" id="cell-border-width" data-pagefind-weight="1">
<summary><code>width</code></summary>
<pre><code>width?: number;</code></pre>
</details>

<details class="api-member" id="cell-border-style" data-pagefind-weight="1">
<summary><code>style</code></summary>
<pre><code>style?: &quot;solid&quot; | &quot;dashed&quot; | &quot;dotted&quot;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellBorder {
    color?: string;
    width?: number;
    style?: "solid" | "dashed" | "dotted";
}
```

</details>
