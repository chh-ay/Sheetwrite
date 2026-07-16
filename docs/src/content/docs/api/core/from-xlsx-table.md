---
title: "fromXlsxTable | @sheetwrite/core"
description: "Parse the first sheet of .xlsx bytes into ColumnarData."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|fromXlsxTable -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
row is treated as the header and its cell text becomes each column's key.
Numbers stay numbers, date cells use the date-serial convention, strings are
verbatim, and empty cells become `null`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L281</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(data: ArrayBuffer | Uint8Array): Promise<ColumnarData> => ;
```
