---
title: "downloadBytes | @sheetwrite/core"
description: "Browser-only download helper; throws in non-DOM runtimes."
---
<!-- api-export:@sheetwrite/core|.|downloadBytes -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Browser-only download helper; throws in non-DOM runtimes.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L204</code></dd></div>
</dl>

## Signature

```ts generated
function downloadBytes(bytes: Uint8Array | string, filename: string, mime: string): void;
```
