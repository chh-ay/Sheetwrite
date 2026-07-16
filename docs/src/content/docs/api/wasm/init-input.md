---
title: "InitInput | @sheetwrite/wasm"
description: "Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/wasm|.|InitInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="type">type</span></div>

Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled `WebAssembly.Module`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L295</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>RequestInfo</code></div>
<div class="api-variant"><code>URL</code></div>
<div class="api-variant"><code>Response</code></div>
<div class="api-variant"><code>BufferSource</code></div>
<div class="api-variant"><code>WebAssembly.Module</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
```

</details>
