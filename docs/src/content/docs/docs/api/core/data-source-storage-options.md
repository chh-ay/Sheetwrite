---
title: "DataSourceStorageOptions | @sheetwrite/core"
description: "Dense or allocation-lazy paged storage policy for datasource cells."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DataSourceStorageOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Dense or allocation-lazy paged storage policy for datasource cells.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L44</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="data-source-storage-options-mode" data-pagefind-weight="1">
<summary><code>mode</code></summary>
<pre><code>mode?: &quot;dense&quot; | &quot;paged&quot;;</code></pre>
</details>

<details class="api-member" id="data-source-storage-options-chunk-rows" data-pagefind-weight="1">
<summary><code>chunkRows</code></summary>
<pre><code>chunkRows?: number;</code></pre>
</details>

<details class="api-member" id="data-source-storage-options-cache-bytes" data-pagefind-weight="1">
<summary><code>cacheBytes</code></summary>
<pre><code>cacheBytes?: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface DataSourceStorageOptions {
    mode?: "dense" | "paged";
    chunkRows?: number;
    cacheBytes?: number;
}
```

</details>
