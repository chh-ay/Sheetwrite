---
title: "WasmMemoryOwner | @sheetwrite/core"
description: "One retained-memory owner reported by the WASM cell store."
---
<!-- api-export:@sheetwrite/core|.|WasmMemoryOwner -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

One retained-memory owner reported by the WASM cell store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L32</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type WasmMemoryOwner = (typeof WASM_MEMORY_OWNERS)[number];
```

</div>
