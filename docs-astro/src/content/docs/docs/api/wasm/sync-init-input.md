---
title: "SyncInitInput | @sheetwrite/wasm"
description: "Sources accepted by synchronous initialization: raw module bytes or a precompiled WebAssembly.Module."
tableOfContents: false
---
<!-- api-export:@sheetwrite/wasm|.|SyncInitInput -->
[← @sheetwrite/wasm](/docs/api/wasm/)

<span class="api-status">type</span>

Sources accepted by synchronous initialization: raw module bytes or a precompiled `WebAssembly.Module`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L395</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>BufferSource</code></div>
<div class="api-variant"><code>WebAssembly.Module</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type SyncInitInput = BufferSource | WebAssembly.Module;
```

</details>
