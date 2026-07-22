---
title: "rowBridgeTransactionId | @sheetwrite/core/adapter"
description: "Compute a deterministic identity for a canonical transaction."
---
<!-- api-export:@sheetwrite/core|./adapter|rowBridgeTransactionId -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Compute a deterministic identity for a canonical transaction.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L867</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function rowBridgeTransactionId(
  transaction: Pick<Transaction, "patches" | "epoch">,
): string
```

</div>
