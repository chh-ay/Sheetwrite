---
title: "SimpleColumn | @sheetwrite/core/adapter"
description: "Column definition accepted by the adapters’ simple row-object API."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Column definition accepted by the adapters’ simple row-object API.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L222</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="simple-column-key" data-pagefind-weight="1">
<summary><code>key</code> <span class="api-member-summary">Non-empty row-object key, unique within the column list.</span></summary>

```ts generated
key: keyof Row & string;
```

</details>

<details class="api-member" id="simple-column-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Semantic title painted in data-grid mode and written by table exports.</span></summary>

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
<summary><code>headerStyle</code> <span class="api-member-summary">Style applied to the painted column header.</span></summary>

```ts generated
headerStyle?: CellStyle;
```

</details>

<details class="api-member" id="simple-column-editor" data-pagefind-weight="1">
<summary><code>editor</code> <span class="api-member-summary">Name of a custom editor registered through GridOptions.editors.</span></summary>

```ts generated
editor?: string;
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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SimpleColumn<Row extends Record<string, CellScalar>> {
  key: keyof Row & string;
  title: string;
  width?: number;
  type?: CellFormat;
  numberFormat?: string;
  headerStyle?: CellStyle;
  editor?: string;
  cellStyle?: CellStyle;
  visible?: boolean;
}
```

</details>
