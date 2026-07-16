---
title: "DataSourcePage | @sheetwrite/core"
description: "One resolved row page returned by a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourcePage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One resolved row page returned by a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L32</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourcePage {
  start: number;
  rows: RowData[];
  revision?: string | number;
}
```

</details>
