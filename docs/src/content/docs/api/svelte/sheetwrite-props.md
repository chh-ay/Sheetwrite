---
title: "SheetwriteProps | @sheetwrite/svelte"
description: "Simple framework adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="type">type</span></div>

Simple framework adapter props for columns and default row objects.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/props.ts#L68</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetwriteProps<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> = Omit<
  SheetwriteGridProps<Id>,
  "workbook" | "data" | "datasource" | "height" | "fill" | "rowBridge"
> &
  GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
    getRowId?: (row: Row, index: number) => Id;
    createRowId?: (context: RowBridgeInsertContext) => Id;
  };
```

</div>
