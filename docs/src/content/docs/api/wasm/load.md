---
title: "load | @sheetwrite/wasm"
description: "Initialize the WASM module."
tableOfContents: false
---
<!-- api-export:@sheetwrite/wasm|.|load -->
[← @sheetwrite/wasm](/docs/api/wasm/)

<span class="api-status">function</span>

Initialize the WASM module. Idempotent and re-entrant: concurrent
same-source callers share one in-flight init; a concurrent different-source
call rejects; a different-source call after success warns and no-ops; a
rejected init is retryable. When `source` is omitted the loader picks the
right strategy for the runtime.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/loader.d.ts#L19</code></dd></div>
</dl>

## Signature

```ts generated
function load(source?: BufferSource | URL | string | Request | WebAssembly.Module): Promise<void>;
```
