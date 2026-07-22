---
title: "DataSourcePage | @sheetwrite/core"
description: "One resolved rectangular page returned by a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourcePage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One resolved rectangular page returned by a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L48</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="data-source-page-protocol" data-pagefind-weight="1">
<summary><code>protocol</code> <span class="api-member-summary">Paging contract version.</span></summary>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-page-start" data-pagefind-weight="1">
<summary><code>start</code> <span class="api-member-summary">Inclusive row index of the first returned row.</span></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-page-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Exact column runs represented by every returned row.</span></summary>

```ts generated
columns: readonly DataSourceColumnBand[];
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
  protocol: 2;
  start: number;
  columns: readonly DataSourceColumnBand[];
  rows: RowData[];
  revision?: string | number;
}
```

</details>
