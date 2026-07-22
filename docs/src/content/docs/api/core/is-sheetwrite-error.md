---
title: "isSheetwriteError | @sheetwrite/core"
description: "Narrow same-realm errors, cross-realm errors, and serialized failure envelopes."
---
<!-- api-export:@sheetwrite/core|.|isSheetwriteError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Narrow same-realm errors, cross-realm errors, and serialized failure envelopes.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L182</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function isSheetwriteError(
  value: unknown,
): value is SheetwriteErrorEnvelope
```

</div>
