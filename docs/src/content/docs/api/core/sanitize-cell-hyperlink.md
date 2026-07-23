---
title: "sanitizeCellHyperlink | @sheetwrite/core"
description: "Sanitize one untrusted clipboard/snapshot value without cloning its object graph."
---
<!-- api-export:@sheetwrite/core|.|sanitizeCellHyperlink -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Sanitize one untrusted clipboard/snapshot value without cloning its object graph.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/hyperlink.ts#L232</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function sanitizeCellHyperlink(value: unknown): CellHyperlink | null
```

</div>
