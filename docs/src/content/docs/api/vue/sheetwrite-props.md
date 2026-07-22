---
title: "SheetwriteProps | @sheetwrite/vue"
description: "Simple Vue adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Simple Vue adapter props for columns and default row objects.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L96</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-props-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Ordered schema used to derive the component-owned sheet.</span></summary>

```ts generated
columns: readonly SimpleColumn<Record<string, CellScalar>>[];
```

</details>

<details class="api-member" id="sheetwrite-props-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code> <span class="api-member-summary">Rows converted to initial columnar data; missing keys become null.</span></summary>

```ts generated
defaultRows: readonly Record<string, CellScalar>[];
```

</details>

<details class="api-member" id="sheetwrite-props-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code> <span class="api-member-summary">Generated sheet name; defaults to Sheet 1.</span></summary>

```ts generated
sheetName?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteProps extends Omit<
  SheetwriteGridProps,
  "workbook" | "data" | "datasource"
> {
  columns: readonly SimpleColumn<Record<string, CellScalar>>[];
  defaultRows: readonly Record<string, CellScalar>[];
  sheetName?: string;
}
```

</details>
