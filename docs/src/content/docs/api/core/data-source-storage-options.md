---
title: "DataSourceStorageOptions | @sheetwrite/core"
description: "Dense or allocation-lazy paged storage policy for datasource cells."
---
<!-- api-export:@sheetwrite/core|.|DataSourceStorageOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Dense or allocation-lazy paged storage policy for datasource cells.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L45</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="data-source-storage-options-mode" data-pagefind-weight="1">
<summary><code>mode</code> <span class="api-member-summary">Storage engine. Dense is the default.</span></summary>

```ts generated
mode?: "dense" | "paged";
```

</details>

<details class="api-member" id="data-source-storage-options-chunk-rows" data-pagefind-weight="1">
<summary><code>chunkRows</code> <span class="api-member-summary">Power-of-two row chunk size.</span></summary>

```ts generated
chunkRows?: number;
```

<p class="api-member-doc">Power-of-two row chunk size. Defaults to 4096.</p>
</details>

<details class="api-member" id="data-source-storage-options-cache-bytes" data-pagefind-weight="1">
<summary><code>cacheBytes</code> <span class="api-member-summary">Clean-chunk cache budget.</span></summary>

```ts generated
cacheBytes?: number;
```

<p class="api-member-doc">Clean-chunk cache budget. Dirty and visible chunks may exceed it.</p>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceStorageOptions {
  mode?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
}
```

</details>
