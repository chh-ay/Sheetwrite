---
title: "InitInput | @sheetwrite/wasm"
description: "Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/wasm|.|InitInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="type">type</span></div>

Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled `WebAssembly.Module`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L409</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type InitInput =
  RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
```

</div>
