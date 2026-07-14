---
title: "SheetwriteProps | @sheetwrite/react"
description: "Simple framework adapter props for columns and default row objects."
tableOfContents: false
---
<!-- api-export:@sheetwrite/react|.|SheetwriteProps -->
[← @sheetwrite/react](/docs/api/react/)

<span class="api-status">type</span>

Simple framework adapter props for columns and default row objects.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L233</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<SheetwriteGridProps, "workbook" | "data" | "datasource" | "height" | "fill"> & GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
};
```

</details>
