---
title: "RowBridgeReconciliationStatus | @sheetwrite/core/adapter"
description: "Reconciliation status for a canonical transaction response."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeReconciliationStatus -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="type">type</span></div>

Reconciliation status for a canonical transaction response.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L167</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RowBridgeReconciliationStatus =
  | "accepted"
  | "transformed"
  | "rejected"
  | "out-of-order"
  | "duplicate"
  | "remote";
```

</div>
