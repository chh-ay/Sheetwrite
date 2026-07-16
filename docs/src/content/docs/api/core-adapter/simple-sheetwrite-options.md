---
title: "SimpleSheetwriteOptions | @sheetwrite/core/adapter"
description: "Framework-neutral simple columns, rows, sizing, and grid options."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleSheetwriteOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Framework-neutral simple columns, rows, sizing, and grid options.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L180</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="simple-sheetwrite-options-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns: readonly SimpleColumn<Row>[];
```

</details>

<details class="api-member" id="simple-sheetwrite-options-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code></summary>

```ts generated
defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="simple-sheetwrite-options-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code></summary>

```ts generated
sheetName?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SimpleSheetwriteOptions<
  Row extends Record<string, CellScalar>,
> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
}
```

</details>
