---
title: "RowBridgeHandler | @sheetwrite/svelte"
description: "Callback accepted by imperative and framework adapters."
---
<!-- api-export:@sheetwrite/svelte|.|RowBridgeHandler -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="type">type</span></div>

Callback accepted by imperative and framework adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/row-bridge.d.ts#L136</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RowBridgeHandler<Id extends RowBridgeId = RowBridgeId> = (
  projection: RowBridgeProjection<Id>,
) => void;
```

</div>
