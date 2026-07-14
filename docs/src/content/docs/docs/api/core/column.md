---
title: "Column | @sheetwrite/core"
description: "Schema and default presentation for one workbook column."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|Column -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Schema and default presentation for one workbook column.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L78</code></dd></div>
</dl>

## Members <span class="api-count">10</span>

<div class="api-member-list">

<details class="api-member" id="column-key" data-pagefind-weight="1">
<summary><code>key</code></summary>
<pre><code>key: string;</code></pre>
</details>

<details class="api-member" id="column-header" data-pagefind-weight="1">
<summary><code>header</code></summary>
<pre><code>header: string;</code></pre>
</details>

<details class="api-member" id="column-width" data-pagefind-weight="1">
<summary><code>width</code></summary>
<pre><code>width: number;</code></pre>
</details>

<details class="api-member" id="column-type" data-pagefind-weight="1">
<summary><code>type</code></summary>
<pre><code>type: CellFormat;</code></pre>
</details>

<details class="api-member" id="column-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code></summary>
<pre><code>numberFormat?: string;</code></pre>
</details>

<details class="api-member" id="column-number-locale" data-pagefind-weight="1">
<summary><code>numberLocale</code></summary>
<pre><code>numberLocale?: string;</code></pre>
</details>

<details class="api-member" id="column-header-style" data-pagefind-weight="1">
<summary><code>headerStyle</code></summary>
<pre><code>headerStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="column-cell-style" data-pagefind-weight="1">
<summary><code>cellStyle</code></summary>
<pre><code>cellStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="column-visible" data-pagefind-weight="1">
<summary><code>visible</code></summary>
<pre><code>visible?: boolean;</code></pre>
</details>

<details class="api-member" id="column-renderer" data-pagefind-weight="1">
<summary><code>renderer</code></summary>
<pre><code>renderer?: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface Column {
    key: string;
    header: string;
    width: number;
    type: CellFormat;
    numberFormat?: string;
    numberLocale?: string;
    headerStyle?: CellStyle;
    cellStyle?: CellStyle;
    visible?: boolean;
    renderer?: string;
}
```

</details>
