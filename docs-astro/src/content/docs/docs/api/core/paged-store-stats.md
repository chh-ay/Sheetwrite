---
title: "PagedStoreStats | @sheetwrite/core"
description: "Allocation and load statistics for one paged datasource sheet."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PagedStoreStats -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Allocation and load statistics for one paged datasource sheet.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L94</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="paged-store-stats-chunks" data-pagefind-weight="1">
<summary><code>chunks</code></summary>
<pre><code>chunks: number;</code></pre>
</details>

<details class="api-member" id="paged-store-stats-loaded-cells" data-pagefind-weight="1">
<summary><code>loadedCells</code></summary>
<pre><code>loadedCells: number;</code></pre>
</details>

<details class="api-member" id="paged-store-stats-dirty-cells" data-pagefind-weight="1">
<summary><code>dirtyCells</code></summary>
<pre><code>dirtyCells: number;</code></pre>
</details>

<details class="api-member" id="paged-store-stats-allocated-bytes" data-pagefind-weight="1">
<summary><code>allocatedBytes</code></summary>
<pre><code>allocatedBytes: number;</code></pre>
</details>

<details class="api-member" id="paged-store-stats-fully-loaded" data-pagefind-weight="1">
<summary><code>fullyLoaded</code></summary>
<pre><code>fullyLoaded: boolean;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PagedStoreStats {
    chunks: number;
    loadedCells: number;
    dirtyCells: number;
    allocatedBytes: number;
    fullyLoaded: boolean;
}
```

</details>
