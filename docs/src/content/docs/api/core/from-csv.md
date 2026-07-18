---
title: "fromCsv | @sheetwrite/core"
description: "Parse CSV into ColumnarData."
---
<!-- api-export:@sheetwrite/core|.|fromCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse CSV into `ColumnarData`. The first record is consumed as a positional
header. Input fields project onto declared visible columns; hidden declared
columns are initialized to `null`, matching the visible-column CSV export.
Extra fields are ignored and missing fields become `null`. The returned
columnar table is fully materialized in memory.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L151</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function fromCsv(
  text: string,
  columns: readonly Column[],
  options?: DelimitedTextOptions,
): ColumnarData
```

</div>
