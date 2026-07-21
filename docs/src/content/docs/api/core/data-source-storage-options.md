---
title: "DataSourceStorageOptions | @sheetwrite/core"
description: "Dense or allocation-lazy paged storage policy for datasource cells."
---
<!-- api-export:@sheetwrite/core|.|DataSourceStorageOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Dense or allocation-lazy paged storage policy for datasource cells.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L45</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="data-source-storage-options-mode" data-pagefind-weight="1">
<summary><code>mode</code> <span class="api-member-summary">Storage engine. Dense is the default.</span></summary>

```ts generated
mode?: "dense" | "paged";
```

</details>

<details class="api-member" id="data-source-storage-options-chunk-rows" data-pagefind-weight="1">
<summary><code>chunkRows</code> <span class="api-member-summary">Paged row chunk size; defaults to 4,096 and is normalized to a power of two.</span></summary>

```ts generated
chunkRows?: number;
```

</details>

<details class="api-member" id="data-source-storage-options-cache-bytes" data-pagefind-weight="1">
<summary><code>cacheBytes</code> <span class="api-member-summary">Per-sheet clean-chunk budget; defaults to 32 MiB.</span></summary>

```ts generated
cacheBytes?: number;
```

<p class="api-member-doc">Per-sheet clean-chunk budget; defaults to 32 MiB. Dirty and visible chunks may exceed it.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceStorageOptions {
  mode?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
}
```

</details>
