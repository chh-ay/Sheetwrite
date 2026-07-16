---
title: "DataCell | @sheetwrite/core"
description: "Datasource cell value with optional cell-specific styling."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DataCell -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

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
