---
title: "fromXlsxTable | @sheetwrite/core"
description: "Parse the first sheet of .xlsx bytes into ColumnarData."
---
<!-- api-export:@sheetwrite/core|.|fromXlsxTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
row is treated as the header and its cell text becomes each column's key.
Numbers stay numbers, date cells use the date-serial convention, strings are
verbatim, and empty cells become `null`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L281</code></dd></div>
</dl>

## Signature

```ts generated
function fromXlsxTable(data: ArrayBuffer | Uint8Array): Promise<ColumnarData>;
```
