---
title: "CellStyle | @sheetwrite/core"
description: "Serializable formatting applied to a cell or used as a column default."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellStyle -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Serializable formatting applied to a cell or used as a column default.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L27</code></dd></div>
</dl>

## Members <span class="api-count">10</span>

<div class="api-member-list">

<details class="api-member" id="cell-style-bold" data-pagefind-weight="1">
<summary><code>bold</code> <span class="api-member-summary">Uses the bold variant of the theme font.</span></summary>
<pre><code>bold?: boolean;</code></pre>
</details>

<details class="api-member" id="cell-style-italic" data-pagefind-weight="1">
<summary><code>italic</code> <span class="api-member-summary">Uses the italic variant of the theme font.</span></summary>
<pre><code>italic?: boolean;</code></pre>
</details>

<details class="api-member" id="cell-style-underline" data-pagefind-weight="1">
<summary><code>underline</code> <span class="api-member-summary">Draws a line beneath each rendered text run.</span></summary>
<pre><code>underline?: boolean;</code></pre>
</details>

<details class="api-member" id="cell-style-strikethrough" data-pagefind-weight="1">
<summary><code>strikethrough</code> <span class="api-member-summary">Draws a line through each rendered text run.</span></summary>
<pre><code>strikethrough?: boolean;</code></pre>
</details>

<details class="api-member" id="cell-style-font-size" data-pagefind-weight="1">
<summary><code>fontSize</code> <span class="api-member-summary">Font size in unzoomed CSS pixels; zoom is applied during painting.</span></summary>
<pre><code>fontSize?: number;</code></pre>
</details>

<details class="api-member" id="cell-style-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">hex color, e.g. &quot;#111111&quot;</span></summary>
<pre><code>color?: string;</code></pre>
</details>

<details class="api-member" id="cell-style-background-color" data-pagefind-weight="1">
<summary><code>backgroundColor</code> <span class="api-member-summary">hex color, e.g. &quot;#ffffff&quot;</span></summary>
<pre><code>backgroundColor?: string;</code></pre>
</details>

<details class="api-member" id="cell-style-align" data-pagefind-weight="1">
<summary><code>align</code> <span class="api-member-summary">Horizontal placement of cell text within its column.</span></summary>
<pre><code>align?: CellAlign;</code></pre>
</details>

<details class="api-member" id="cell-style-wrap" data-pagefind-weight="1">
<summary><code>wrap</code> <span class="api-member-summary">Wraps text within the cell width; row auto-fit accounts for the resulting line count.</span></summary>
<pre><code>wrap?: boolean;</code></pre>
</details>

<details class="api-member" id="cell-style-border" data-pagefind-weight="1">
<summary><code>border</code> <span class="api-member-summary">Border overrides for the cell's individual sides.</span></summary>
<pre><code>border?: CellBorders;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellStyle {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    align?: CellAlign;
    wrap?: boolean;
    border?: CellBorders;
}
```

</details>
