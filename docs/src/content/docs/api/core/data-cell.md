---
title: "DataCell | @sheetwrite/core"
description: "Datasource cell value with optional cell-specific styling."
---
<!-- api-export:@sheetwrite/core|.|DataCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Datasource cell value with optional cell-specific styling.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L11</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>CellScalar</code></div>
<div class="api-variant"><code>CellValue</code></div>
<div class="api-variant"><code>{ value: CellValue; style?: CellStyle }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataCell = CellScalar | CellValue | {
    value: CellValue;
    style?: CellStyle;
};
```

</details>
