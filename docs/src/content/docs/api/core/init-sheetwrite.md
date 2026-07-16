---
title: "initSheetwrite | @sheetwrite/core"
description: "Load the WASM data engine once."
---
<!-- api-export:@sheetwrite/core|.|initSheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Load the WASM data engine once. Must be awaited before `createGrid`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid.ts#L174</code></dd></div>
</dl>

## Declaration

```ts generated
function initSheetwrite(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>
```
