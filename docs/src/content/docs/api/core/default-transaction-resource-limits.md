---
title: "DEFAULT_TRANSACTION_RESOURCE_LIMITS | @sheetwrite/core"
description: "Inclusive defaults for every atomic document transaction accepted by a Store or Grid."
---
<!-- api-export:@sheetwrite/core|.|DEFAULT_TRANSACTION_RESOURCE_LIMITS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Inclusive defaults for every atomic document transaction accepted by a
Store or Grid. The count bounds object-heavy validation and dispatch; the
exact UTF-8 JSON size bounds hostile or accidentally oversized payloads.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L20</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const DEFAULT_TRANSACTION_RESOURCE_LIMITS: Readonly<TransactionResourceLimits>
```

</div>
