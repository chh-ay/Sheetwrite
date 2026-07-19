---
title: "SheetwriteProps | @sheetwrite/react"
description: "Simple framework adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="type">type</span></div>

Simple framework adapter props for columns and default row objects.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L249</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<
  SheetwriteGridProps,
  "workbook" | "data" | "datasource" | "height" | "fill"
> &
  GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
  };
```

</div>
