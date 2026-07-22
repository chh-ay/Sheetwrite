---
title: "SheetwriteProps | @sheetwrite/vue"
description: "Simple Vue adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Simple Vue adapter props for columns and default row objects.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L104</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-props-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Ordered schema used to derive the component-owned sheet.</span></summary>

```ts generated
columns: readonly SimpleColumn<Row>[];
```

</details>

<details class="api-member" id="sheetwrite-props-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code> <span class="api-member-summary">Rows converted to initial columnar data; missing keys become null.</span></summary>

```ts generated
defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="sheetwrite-props-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code> <span class="api-member-summary">Generated sheet name; defaults to Sheet 1.</span></summary>

```ts generated
sheetName?: string;
```

</details>

<details class="api-member" id="sheetwrite-props-get-row-id" data-pagefind-weight="1">
<summary><code>getRowId</code> <span class="api-member-summary">Opt-in stable identity for each host row.</span></summary>

```ts generated
getRowId?: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="sheetwrite-props-create-row-id" data-pagefind-weight="1">
<summary><code>createRowId</code> <span class="api-member-summary">Creates stable identities for Grid-inserted rows.</span></summary>

```ts generated
createRowId?: Parameters<typeof createSimpleRowBridge<Row, Id>>[0]["createRowId"];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteProps<
  Row extends Record<string, CellScalar> = Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> extends Omit<
  SheetwriteGridProps<Id>,
  "workbook" | "data" | "datasource" | "rowBridge"
> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
  getRowId?: (row: Row, index: number) => Id;
  createRowId?: Parameters<
    typeof createSimpleRowBridge<Row, Id>
  >[0]["createRowId"];
}
```

</details>
