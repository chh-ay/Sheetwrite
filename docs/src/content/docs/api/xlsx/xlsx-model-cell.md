---
title: "XlsxModelCell | @sheetwrite/xlsx"
description: "Implementation-neutral cell in the first-sheet table export model."
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModelCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="interface">interface</span></div>

Implementation-neutral cell in the first-sheet table export model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/xlsx</code></dd></div>
<div><dt>Source</dt><dd><code>packages/xlsx/src/table-export.ts#L14</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-cell-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="xlsx-model-cell-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: CellStyle;
```

</details>

<details class="api-member" id="xlsx-model-cell-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code></summary>

```ts generated
numberFormat?: string;
```

</details>

<details class="api-member" id="xlsx-model-cell-column-span" data-pagefind-weight="1">
<summary><code>columnSpan</code></summary>

```ts generated
columnSpan?: number;
```

</details>

<details class="api-member" id="xlsx-model-cell-row-span" data-pagefind-weight="1">
<summary><code>rowSpan</code></summary>

```ts generated
rowSpan?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxModelCell {
  value: CellScalar;
  style?: CellStyle;
  numberFormat?: string;
  columnSpan?: number;
  rowSpan?: number;
}
```

</details>
