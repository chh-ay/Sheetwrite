---
title: "toCsv | @sheetwrite/core"
description: "CSV (UTF-8 BOM, CRLF). String values are injection-hardened (a leading = + - @ \\t \\r is prefixed with ')."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|toCsv -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

CSV (UTF-8 BOM, CRLF). String values are injection-hardened (a leading
`= + - @ \t \r` is prefixed with `'`). Reads the whole sheet as one bulk
window, not cell-by-cell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L46</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(sheet: Sheet, store: Store): string => ;
```
