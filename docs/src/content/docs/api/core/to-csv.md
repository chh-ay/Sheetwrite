---
title: "toCsv | @sheetwrite/core"
description: "CSV (UTF-8 BOM, CRLF). String values are injection-hardened (a leading = + - @ \\t \\r is prefixed with ')."
---
<!-- api-export:@sheetwrite/core|.|toCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

CSV (UTF-8 BOM, CRLF). String values are injection-hardened (a leading
`= + - @ \t \r` is prefixed with `'`). Reads the whole sheet as one bulk
window, not cell-by-cell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L46</code></dd></div>
</dl>

## Declaration

```ts generated
function toCsv(sheet: Sheet, store: Store): string
```
