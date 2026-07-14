---
title: "SimpleColumn | @sheetwrite/svelte"
description: "Column definition accepted by the adapters’ simple row-object API."
tableOfContents: false
---
<!-- api-export:@sheetwrite/svelte|.|SimpleColumn -->
[← @sheetwrite/svelte](/docs/api/svelte/)

<span class="api-status">interface</span>

Column definition accepted by the adapters’ simple row-object API.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/adapter.d.ts#L72</code></dd></div>
</dl>

## Members <span class="api-count">8</span>

<div class="api-member-list">

<details class="api-member" id="simple-column-key" data-pagefind-weight="1">
<summary><code>key</code></summary>
<pre><code>key: keyof Row &amp; string;</code></pre>
</details>

<details class="api-member" id="simple-column-title" data-pagefind-weight="1">
<summary><code>title</code></summary>
<pre><code>title: string;</code></pre>
</details>

<details class="api-member" id="simple-column-width" data-pagefind-weight="1">
<summary><code>width</code></summary>
<pre><code>width?: number;</code></pre>
</details>

<details class="api-member" id="simple-column-type" data-pagefind-weight="1">
<summary><code>type</code></summary>
<pre><code>type?: CellFormat;</code></pre>
</details>

<details class="api-member" id="simple-column-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code></summary>
<pre><code>numberFormat?: string;</code></pre>
</details>

<details class="api-member" id="simple-column-header-style" data-pagefind-weight="1">
<summary><code>headerStyle</code></summary>
<pre><code>headerStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="simple-column-cell-style" data-pagefind-weight="1">
<summary><code>cellStyle</code></summary>
<pre><code>cellStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="simple-column-visible" data-pagefind-weight="1">
<summary><code>visible</code></summary>
<pre><code>visible?: boolean;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SimpleColumn<Row extends Record<string, CellScalar>> {
    key: keyof Row & string;
    title: string;
    width?: number;
    type?: CellFormat;
    numberFormat?: string;
    headerStyle?: CellStyle;
    cellStyle?: CellStyle;
    visible?: boolean;
}
```

</details>
