---
title: "PackedCellBlock | @sheetwrite/core"
description: "Dense row-major mutation payload."
---
<!-- api-export:@sheetwrite/core|.|PackedCellBlock -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Dense row-major mutation payload. Primitive arrays keep large paste/fill
operations JSON-safe without allocating one operation object per cell.
Formula/reference tuples are sparse exceptions keyed by row-major offset.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L257</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="packed-cell-block-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="packed-cell-block-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>

```ts generated
colCount: number;
```

</details>

<details class="api-member" id="packed-cell-block-values" data-pagefind-weight="1">
<summary><code>values</code></summary>

```ts generated
values: CellScalar[];
```

</details>

<details class="api-member" id="packed-cell-block-formulas" data-pagefind-weight="1">
<summary><code>formulas</code></summary>

```ts generated
formulas?: Array<[offset: number, source: string]>;
```

</details>

<details class="api-member" id="packed-cell-block-refs" data-pagefind-weight="1">
<summary><code>refs</code></summary>

```ts generated
refs?: Array<[offset: number, target: CellAddress]>;
```

</details>

<details class="api-member" id="packed-cell-block-style-table" data-pagefind-weight="1">
<summary><code>styleTable</code></summary>

```ts generated
styleTable?: CellStyle[];
```

</details>

<details class="api-member" id="packed-cell-block-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code></summary>

```ts generated
styleIds?: number[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PackedCellBlock {
  rowCount: number;
  colCount: number;
  values: CellScalar[];
  formulas?: Array<[offset: number, source: string]>;
  refs?: Array<[offset: number, target: CellAddress]>;
  styleTable?: CellStyle[];
  styleIds?: number[];
}
```

</details>
