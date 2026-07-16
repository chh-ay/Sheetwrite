---
title: "initSync | @sheetwrite/wasm"
description: "Instantiates the given module, which can either be bytes or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/wasm|.|initSync -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="function">function</span></div>

Instantiates the given `module`, which can either be bytes or
a precompiled `WebAssembly.Module`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L405</code></dd></div>
</dl>

## Signature

```ts generated
function initSync(module: {
    module: SyncInitInput;
} | SyncInitInput): InitOutput;
```
