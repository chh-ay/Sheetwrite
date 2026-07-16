---
title: "ColumnarData | @sheetwrite/core"
description: "Eager column-oriented values used to initialize a sheet."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ColumnarData -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Eager column-oriented values used to initialize a sheet.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L17</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="columnar-data-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="columnar-data-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns: Record<string, ArrayLike<CellScalar | CellValue>>;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ColumnarData {
    rowCount: number;
    columns: Record<string, ArrayLike<CellScalar | CellValue>>;
}
```

</details>
