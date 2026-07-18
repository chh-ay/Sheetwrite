---
title: "downloadBytes | @sheetwrite/core"
description: "Trigger a browser download from in-memory bytes."
---
<!-- api-export:@sheetwrite/core|.|downloadBytes -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Trigger a browser download from in-memory bytes. The temporary anchor is
removed and its object URL is scheduled for revocation even when DOM append or
click throws.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L182</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function downloadBytes(
  bytes: Uint8Array | string,
  filename: string,
  mime: string,
): void
```

</div>
