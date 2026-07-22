---
title: "WASM_MEMORY_OWNERS | @sheetwrite/core"
description: "Stable ordered owner list encoded by the WASM store-memory protocol."
---
<!-- api-export:@sheetwrite/core|.|WASM_MEMORY_OWNERS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Stable ordered owner list encoded by the WASM store-memory protocol.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L12</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const WASM_MEMORY_OWNERS: readonly [
  "wasm.dense.kinds",
  "wasm.dense.payloads",
  "wasm.dense.styles",
  "wasm.paged.kinds",
  "wasm.paged.payloads",
  "wasm.paged.styles",
  "wasm.paged.loaded-bitmaps",
  "wasm.paged.dirty-bitmaps",
  "wasm.paged.indexes",
  "wasm.string-pool.utf8",
  "wasm.string-pool.spans",
  "wasm.string-index",
  "wasm.formulas",
  "wasm.dependency-nodes",
  "wasm.dependency-edges",
  "wasm.sheet-indexes-metadata",
  "wasm.spill-ranges",
  "wasm.spill-owners",
  "wasm.spill-blockers",
]
```

</div>
