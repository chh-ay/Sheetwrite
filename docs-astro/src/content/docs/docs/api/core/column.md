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
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L86</code></dd></div>
</dl>

## Members <span class="api-count">10</span>

<div class="api-member-list">

<details class="api-member" id="column-key" data-pagefind-weight="1">
<summary><code>key</code> <span class="api-member-summary">Non-empty key, unique within the sheet, used to map input and datasource values.</span></summary>
<pre><code>key: string;</code></pre>
</details>

<details class="api-member" id="column-header" data-pagefind-weight="1">
<summary><code>header</code> <span class="api-member-summary">Schema label written by table exports; the canvas header displays positional column letters.</span></summary>
<pre><code>header: string;</code></pre>
</details>

<details class="api-member" id="column-width" data-pagefind-weight="1">
<summary><code>width</code> <span class="api-member-summary">Unzoomed column width in CSS pixels.</span></summary>
<pre><code>width: number;</code></pre>
</details>

<details class="api-member" id="column-type" data-pagefind-weight="1">
<summary><code>type</code> <span class="api-member-summary">Controls cell input parsing and default value formatting for this column.</span></summary>
<pre><code>type: CellFormat;</code></pre>
</details>

<details class="api-member" id="column-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code> <span class="api-member-summary">Excel number-format code, e.g.</span></summary>
<pre><code>numberFormat?: string;</code></pre>
<p class="api-member-doc">Excel number-format code, e.g. &quot;#,##0.00&quot;</p>
</details>

<details class="api-member" id="column-number-locale" data-pagefind-weight="1">
<summary><code>numberLocale</code> <span class="api-member-summary">Explicit BCP 47 locale for separators; omitted keeps the deterministic default.</span></summary>
<pre><code>numberLocale?: string;</code></pre>
</details>

<details class="api-member" id="column-header-style" data-pagefind-weight="1">
<summary><code>headerStyle</code> <span class="api-member-summary">Overrides theme styling for the painted column-letter header.</span></summary>
<pre><code>headerStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="column-cell-style" data-pagefind-weight="1">
<summary><code>cellStyle</code> <span class="api-member-summary">Base style merged beneath each cell's own style.</span></summary>
<pre><code>cellStyle?: CellStyle;</code></pre>
</details>

<details class="api-member" id="column-visible" data-pagefind-weight="1">
<summary><code>visible</code> <span class="api-member-summary">Set to false to exclude the column from the live view and table exports.</span></summary>
<pre><code>visible?: boolean;</code></pre>
<p class="api-member-doc">Set to `false` to exclude the column from the live view and table exports.</p>
</details>

<details class="api-member" id="column-renderer" data-pagefind-weight="1">
<summary><code>renderer</code> <span class="api-member-summary">Name of a registered custom cell renderer (see Grid.defineCellRenderer).</span></summary>
<pre><code>renderer?: string;</code></pre>
<p class="api-member-doc">Name of a registered custom cell renderer (see `Grid.defineCellRenderer`).</p>
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
