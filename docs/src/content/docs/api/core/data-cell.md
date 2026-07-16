---
title: "DataCell | @sheetwrite/core"
description: "Datasource cell value with optional cell-specific styling."
---
<!-- api-export:@sheetwrite/core|.|DataCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Datasource cell value with optional cell-specific styling.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L11</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
CellScalar
```

</div>
<div class="api-variant">

```ts generated
CellValue
```

</div>
<div class="api-variant">

```ts generated
{ value: CellValue; style?: CellStyle }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataCell =
  | CellScalar
  | CellValue
  | {
      value: CellValue;
      style?: CellStyle;
    };
```

</details>
