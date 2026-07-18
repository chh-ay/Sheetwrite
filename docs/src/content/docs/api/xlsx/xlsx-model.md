---
title: "XlsxModel | @sheetwrite/xlsx"
description: "Implementation-neutral first-sheet table export model."
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="interface">interface</span></div>

Implementation-neutral first-sheet table export model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/xlsx</code></dd></div>
<div><dt>Source</dt><dd><code>packages/xlsx/src/table-export.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code></summary>

```ts generated
sheetName: string;
```

</details>

<details class="api-member" id="xlsx-model-column-widths" data-pagefind-weight="1">
<summary><code>columnWidths</code></summary>

```ts generated
columnWidths: number[];
```

</details>

<details class="api-member" id="xlsx-model-row-heights" data-pagefind-weight="1">
<summary><code>rowHeights</code></summary>

```ts generated
rowHeights: (number | undefined)[];
```

</details>

<details class="api-member" id="xlsx-model-rows" data-pagefind-weight="1">
<summary><code>rows</code></summary>

```ts generated
rows: (XlsxModelCell | null)[][];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxModel {
  sheetName: string;
  columnWidths: number[];
  rowHeights: (number | undefined)[];
  rows: (XlsxModelCell | null)[][];
}
```

</details>
