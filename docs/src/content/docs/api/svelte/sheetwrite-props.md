---
title: "SheetwriteProps | @sheetwrite/svelte"
description: "Simple framework adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="type">type</span></div>

Simple framework adapter props for columns and default row objects.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/props.ts#L55</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<SheetwriteGridProps, "workbook" | "data" | "datasource" | "height" | "fill"> & GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
};
```

</details>
