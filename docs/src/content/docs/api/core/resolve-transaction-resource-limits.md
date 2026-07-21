---
title: "resolveTransactionResourceLimits | @sheetwrite/core"
description: "Validate and merge transaction ceiling overrides without retaining the caller-owned object."
---
<!-- api-export:@sheetwrite/core|.|resolveTransactionResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate and merge transaction ceiling overrides without retaining the
caller-owned object. Every ceiling is an inclusive non-negative safe integer.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L47</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function resolveTransactionResourceLimits(
  overrides?: Partial<TransactionResourceLimits>,
): Readonly<TransactionResourceLimits>
```

</div>
