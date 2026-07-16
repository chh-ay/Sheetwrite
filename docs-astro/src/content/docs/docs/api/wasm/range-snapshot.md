---
title: "RangeSnapshot | @sheetwrite/wasm"
description: "Opaque, store-local history payload for one dense rectangular cell block."
tableOfContents: false
---
<!-- api-export:@sheetwrite/wasm|.|RangeSnapshot -->
[← @sheetwrite/wasm](/docs/api/wasm/)

<span class="api-status">class</span>

Opaque, store-local history payload for one dense rectangular cell block.

The host may retain this object in undo history, but it is deliberately not
part of the serialized document protocol. String payloads remain interned in
the owning `CellStore`, so snapshots must only be restored into that store.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L239</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
class RangeSnapshot {
}
```
