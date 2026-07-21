---
title: "validateTransactionResources | @sheetwrite/core"
description: "Incrementally validate the operation count and exact encoded payload size without constructing a JSON string."
---
<!-- api-export:@sheetwrite/core|.|validateTransactionResources -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Incrementally validate the operation count and exact encoded payload size
without constructing a JSON string. Compact operation ranges are measured by
their serialized fields; their logical cell area is deliberately irrelevant.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L69</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function validateTransactionResources(
  operations: readonly DocumentOp[],
  limits?: Readonly<TransactionResourceLimits>,
): TransactionResourceValidationResult
```

</div>
