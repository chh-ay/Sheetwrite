---
title: "fromCsv | @sheetwrite/core"
description: "Parse CSV text into ColumnarData keyed by columns[i].key — the symmetric counterpart to toCsv."
---
<!-- api-export:@sheetwrite/core|.|fromCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse CSV `text` into `ColumnarData` keyed by `columns[i].key` — the symmetric
counterpart to `toCsv`. The first parsed row is treated as the header and
consumed; each remaining row maps positionally onto `columns`. CSV columns
beyond `columns.length` are ignored, missing trailing cells become `null`, and
`number` columns coerce their fields to finite numbers.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L179</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function fromCsv(
  text: string,
  columns: readonly Column[],
): ColumnarData
```

</div>
