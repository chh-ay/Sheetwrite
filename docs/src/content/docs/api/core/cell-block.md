---
title: "CellBlock | @sheetwrite/core"
description: "Sparse row-major cells bounded by one rectangular block."
---
<!-- api-export:@sheetwrite/core|.|CellBlock -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Sparse row-major cells bounded by one rectangular block.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L219</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-block-start-row" data-pagefind-weight="1">
<summary><code>startRow</code></summary>

```ts generated
startRow: number;
```

</details>

<details class="api-member" id="cell-block-start-col" data-pagefind-weight="1">
<summary><code>startCol</code></summary>

```ts generated
startCol: number;
```

</details>

<details class="api-member" id="cell-block-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="cell-block-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>

```ts generated
colCount: number;
```

</details>

<details class="api-member" id="cell-block-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>

```ts generated
cells: SnapshotCell[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellBlock {
  startRow: number;
  startCol: number;
  rowCount: number;
  colCount: number;
  cells: SnapshotCell[];
}
```

</details>
