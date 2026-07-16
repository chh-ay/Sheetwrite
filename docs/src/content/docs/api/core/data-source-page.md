---
title: "DataSourcePage | @sheetwrite/core"
description: "One resolved row page returned by a DataSource."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DataSourcePage -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

One resolved row page returned by a DataSource.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L32</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="data-source-page-start" data-pagefind-weight="1">
<summary><code>start</code></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-page-rows" data-pagefind-weight="1">
<summary><code>rows</code></summary>

```ts generated
rows: RowData[];
```

</details>

<details class="api-member" id="data-source-page-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>

```ts generated
revision?: string | number;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourcePage {
    start: number;
    rows: RowData[];
    revision?: string | number;
}
```

</details>
