---
title: "CellPaintContext | @sheetwrite/core"
description: "Read-only cell and canvas geometry supplied to a custom renderer."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellPaintContext -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Read-only cell and canvas geometry supplied to a custom renderer.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L40</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="cell-paint-context-value" data-pagefind-weight="1">
<summary><code>value</code></summary>
<pre><code>value: CellScalar;</code></pre>
</details>

<details class="api-member" id="cell-paint-context-x" data-pagefind-weight="1">
<summary><code>x</code></summary>
<pre><code>x: number;</code></pre>
</details>

<details class="api-member" id="cell-paint-context-y" data-pagefind-weight="1">
<summary><code>y</code></summary>
<pre><code>y: number;</code></pre>
</details>

<details class="api-member" id="cell-paint-context-w" data-pagefind-weight="1">
<summary><code>w</code></summary>
<pre><code>w: number;</code></pre>
</details>

<details class="api-member" id="cell-paint-context-h" data-pagefind-weight="1">
<summary><code>h</code></summary>
<pre><code>h: number;</code></pre>
</details>

<details class="api-member" id="cell-paint-context-theme" data-pagefind-weight="1">
<summary><code>theme</code></summary>
<pre><code>theme: Theme;</code></pre>
</details>

<details class="api-member" id="cell-paint-context-style" data-pagefind-weight="1">
<summary><code>style</code></summary>
<pre><code>style: CellStyle;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CellPaintContext {
    value: CellScalar;
    x: number;
    y: number;
    w: number;
    h: number;
    theme: Theme;
    style: CellStyle;
}
```

</details>
