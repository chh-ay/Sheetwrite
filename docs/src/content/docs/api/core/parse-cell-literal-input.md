---
title: "parseCellLiteralInput | @sheetwrite/core"
description: "Parse imported text as a literal using the same boolean, number, date, and currency rules as parseCellInput."
---
<!-- api-export:@sheetwrite/core|.|parseCellLiteralInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse imported text as a literal using the same boolean, number, date, and
currency rules as [`parseCellInput`](/docs/api/core/parse-cell-input/). Unlike interactive entry, a leading
`=` remains inert text. Declared date columns also accept an existing finite
date serial so delimited export/import preserves numeric dates.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/cell-input.ts#L73</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCellLiteralInput(
  raw: string,
  type: CellFormat,
): CellScalar
```

</div>
