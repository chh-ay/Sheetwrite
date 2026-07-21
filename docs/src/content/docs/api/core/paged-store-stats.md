---
title: "PagedStoreStats | @sheetwrite/core"
description: "Allocation and load statistics for one paged datasource sheet."
---
<!-- api-export:@sheetwrite/core|.|PagedStoreStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Allocation and load statistics for one paged datasource sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L104</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="paged-store-stats-chunks" data-pagefind-weight="1">
<summary><code>chunks</code></summary>

```ts generated
chunks: number;
```

</details>

<details class="api-member" id="paged-store-stats-loaded-cells" data-pagefind-weight="1">
<summary><code>loadedCells</code></summary>

```ts generated
loadedCells: number;
```

</details>

<details class="api-member" id="paged-store-stats-dirty-cells" data-pagefind-weight="1">
<summary><code>dirtyCells</code></summary>

```ts generated
dirtyCells: number;
```

</details>

<details class="api-member" id="paged-store-stats-allocated-bytes" data-pagefind-weight="1">
<summary><code>allocatedBytes</code></summary>

```ts generated
allocatedBytes: number;
```

</details>

<details class="api-member" id="paged-store-stats-dirty-allocated-bytes" data-pagefind-weight="1">
<summary><code>dirtyAllocatedBytes</code> <span class="api-member-summary">Sparse local-edit overlay bytes, excluded from the clean chunk cache budget.</span></summary>

```ts generated
dirtyAllocatedBytes: number;
```

</details>

<details class="api-member" id="paged-store-stats-fully-loaded" data-pagefind-weight="1">
<summary><code>fullyLoaded</code></summary>

```ts generated
fullyLoaded: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PagedStoreStats {
  chunks: number;
  loadedCells: number;
  dirtyCells: number;
  allocatedBytes: number;
  dirtyAllocatedBytes: number;
  fullyLoaded: boolean;
}
```

</details>
