---
title: "emptyStoreMemoryStats | @sheetwrite/core"
description: "Construct a zero-owner store report when no WASM store is available."
---
<!-- api-export:@sheetwrite/core|.|emptyStoreMemoryStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Construct a zero-owner store report when no WASM store is available.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L323</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function emptyStoreMemoryStats(
  wasmCommittedBytes: number | null,
): StoreMemoryBreakdown
```

</div>
