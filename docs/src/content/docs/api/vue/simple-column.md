---
title: "SimpleColumn | @sheetwrite/vue"
description: "Column definition accepted by the adapters’ simple row-object API."
---
<!-- api-export:@sheetwrite/vue|.|SimpleColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Column definition accepted by the adapters’ simple row-object API.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/adapter.d.ts#L90</code></dd></div>
</dl>

## Members <span class="api-count">8</span>

<div class="api-member-list">

<details class="api-member" id="simple-column-key" data-pagefind-weight="1">
<summary><code>key</code> <span class="api-member-summary">Non-empty row-object key, unique within the column list.</span></summary>

```ts generated
key: keyof Row & string;
```

</details>

<details class="api-member" id="simple-column-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Schema header label used by exports.</span></summary>

```ts generated
title: string;
```

</details>

<details class="api-member" id="simple-column-width" data-pagefind-weight="1">
<summary><code>width</code> <span class="api-member-summary">Unzoomed width in CSS pixels; defaults to 120.</span></summary>

```ts generated
width?: number;
```

</details>

<details class="api-member" id="simple-column-type" data-pagefind-weight="1">
<summary><code>type</code> <span class="api-member-summary">Input and formatting type; defaults to text.</span></summary>

```ts generated
type?: CellFormat;
```

</details>

<details class="api-member" id="simple-column-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code> <span class="api-member-summary">Excel number-format code used for number, date, or currency display.</span></summary>

```ts generated
numberFormat?: string;
```

</details>

<details class="api-member" id="simple-column-header-style" data-pagefind-weight="1">
<summary><code>headerStyle</code> <span class="api-member-summary">Style applied to the painted column-letter header.</span></summary>

```ts generated
headerStyle?: CellStyle;
```

</details>

<details class="api-member" id="simple-column-cell-style" data-pagefind-weight="1">
<summary><code>cellStyle</code> <span class="api-member-summary">Base style merged beneath cell-specific styles.</span></summary>

```ts generated
cellStyle?: CellStyle;
```

</details>

<details class="api-member" id="simple-column-visible" data-pagefind-weight="1">
<summary><code>visible</code> <span class="api-member-summary">Set to false to exclude the column from the live view and table exports.</span></summary>

```ts generated
visible?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
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
