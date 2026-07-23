---
title: "RowBridgeHandler | @sheetwrite/core"
description: "Callback accepted by imperative and framework adapters."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeHandler -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Callback accepted by imperative and framework adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L199</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RowBridgeHandler<Id extends RowBridgeId = RowBridgeId> = (
  projection: RowBridgeProjection<Id>,
) => void;
```

</div>
