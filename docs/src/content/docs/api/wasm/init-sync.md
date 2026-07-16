---
title: "initSync | @sheetwrite/wasm"
description: "Instantiates the given module, which can either be bytes or a precompiled WebAssembly.Module."
tableOfContents: false
---
<!-- api-export:@sheetwrite/wasm|.|initSync -->
[← @sheetwrite/wasm](/docs/api/wasm/)

<span class="api-status">function</span>

Instantiates the given `module`, which can either be bytes or
a precompiled `WebAssembly.Module`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L405</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(module: {
    module: SyncInitInput;
} | SyncInitInput): InitOutput => ;
```
