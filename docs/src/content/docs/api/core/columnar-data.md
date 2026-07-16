---
title: "ColumnarData | @sheetwrite/core"
description: "Eager column-oriented values used to initialize a sheet."
---
<!-- api-export:@sheetwrite/core|.|ColumnarData -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Eager column-oriented values used to initialize a sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L17</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ColumnarData {
  rowCount: number;
  columns: Record<string, ArrayLike<CellScalar | CellValue>>;
}
```

</details>
