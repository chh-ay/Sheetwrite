---
title: "initSheetwrite | @sheetwrite/core"
description: "Load the WASM data engine once."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|initSheetwrite -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Load the WASM data engine once. Must be awaited before `createGrid`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid.ts#L122</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(source?: BufferSource | URL | string | Request | WebAssembly.Module): Promise<void> => ;
```
