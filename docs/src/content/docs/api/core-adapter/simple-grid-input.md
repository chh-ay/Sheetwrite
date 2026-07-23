---
title: "SimpleGridInput | @sheetwrite/core/adapter"
description: "Normalized workbook and columnar data produced from simple adapter props."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleGridInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Normalized workbook and columnar data produced from simple adapter props.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L273</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="simple-grid-input-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="simple-grid-input-data" data-pagefind-weight="1">
<summary><code>data</code></summary>

```ts generated
data: ColumnarData;
```

</details>

<details class="api-member" id="simple-grid-input-presentation" data-pagefind-weight="1">
<summary><code>presentation</code> <span class="api-member-summary">Simple row-object input always opts into semantic data-grid presentation.</span></summary>

```ts generated
presentation: "data-grid";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SimpleGridInput {
  workbook: Workbook;
  data: ColumnarData;
  presentation: "data-grid";
}
```

</details>
