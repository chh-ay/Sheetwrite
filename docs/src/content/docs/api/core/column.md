---
title: "Column | @sheetwrite/core"
description: "Schema and default presentation for one workbook column."
---
<!-- api-export:@sheetwrite/core|.|Column -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Schema and default presentation for one workbook column.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L86</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-member-list">

<details class="api-member" id="column-key" data-pagefind-weight="1">
<summary><code>key</code> <span class="api-member-summary">Non-empty key, unique within the sheet, used to map input and datasource values.</span></summary>

```ts generated
key: string;
```

</details>

<details class="api-member" id="column-header" data-pagefind-weight="1">
<summary><code>header</code> <span class="api-member-summary">Schema label used by table exports and data-grid presentation headers.</span></summary>

```ts generated
header: string;
```

</details>

<details class="api-member" id="column-width" data-pagefind-weight="1">
<summary><code>width</code> <span class="api-member-summary">Unzoomed column width in CSS pixels.</span></summary>

```ts generated
width: number;
```

</details>

<details class="api-member" id="column-type" data-pagefind-weight="1">
<summary><code>type</code> <span class="api-member-summary">Controls cell input parsing and default value formatting for this column.</span></summary>

```ts generated
type: CellFormat;
```

</details>

<details class="api-member" id="column-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code> <span class="api-member-summary">Excel number-format code, e.g.</span></summary>

```ts generated
numberFormat?: string;
```

<p class="api-member-doc">Excel number-format code, e.g. &quot;#,##0.00&quot;</p>
</details>

<details class="api-member" id="column-number-locale" data-pagefind-weight="1">
<summary><code>numberLocale</code> <span class="api-member-summary">Explicit BCP 47 locale for separators; omitted keeps the deterministic default.</span></summary>

```ts generated
numberLocale?: string;
```

</details>

<details class="api-member" id="column-header-style" data-pagefind-weight="1">
<summary><code>headerStyle</code> <span class="api-member-summary">Overrides theme styling for the painted column header.</span></summary>

```ts generated
headerStyle?: CellStyle;
```

</details>

<details class="api-member" id="column-cell-style" data-pagefind-weight="1">
<summary><code>cellStyle</code> <span class="api-member-summary">Base style merged beneath each cell's own style.</span></summary>

```ts generated
cellStyle?: CellStyle;
```

</details>

<details class="api-member" id="column-visible" data-pagefind-weight="1">
<summary><code>visible</code> <span class="api-member-summary">Set to false to exclude the column from the live view and table exports.</span></summary>

```ts generated
visible?: boolean;
```

</details>

<details class="api-member" id="column-renderer" data-pagefind-weight="1">
<summary><code>renderer</code> <span class="api-member-summary">Name of a registered custom cell renderer (see Grid.defineCellRenderer).</span></summary>

```ts generated
renderer?: string;
```

</details>

<details class="api-member" id="column-editor" data-pagefind-weight="1">
<summary><code>editor</code> <span class="api-member-summary">Name of a registered custom editor (see GridOptions.editors).</span></summary>

```ts generated
editor?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
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
  editor?: string;
}
```

</details>
