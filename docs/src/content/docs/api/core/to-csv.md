---
title: "toCsv | @sheetwrite/core"
description: "Export the current visible CSV view (UTF-8 BOM, CRLF): visible columns and view-ordered rows surviving sort, filter, hidden-row, and group state."
---
<!-- api-export:@sheetwrite/core|.|toCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Export the current visible CSV view (UTF-8 BOM, CRLF): visible columns and
view-ordered rows surviving sort, filter, hidden-row, and group state. String
values beginning with `= + - @ \t \r` are prefixed with `'`. The synchronous
API returns one in-memory string, but fetches at most
`maxWriterWindowRows` view rows from the store per read.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L56</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toCsv(
  sheet: Sheet,
  store: Store,
  options?: DelimitedTextOptions,
): string
```

</div>
