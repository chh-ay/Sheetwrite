---
title: "decodeStoreMemoryStats | @sheetwrite/core"
description: "Decode the flat Rust protocol and fail closed on version/order/total drift."
---
<!-- api-export:@sheetwrite/core|.|decodeStoreMemoryStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Decode the flat Rust protocol and fail closed on version/order/total drift.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L242</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function decodeStoreMemoryStats(
  encoded: ArrayLike<number>,
  wasmCommittedBytes: number | null,
): StoreMemoryBreakdown
```

</div>
