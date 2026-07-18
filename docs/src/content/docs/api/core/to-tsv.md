---
title: "toTsv | @sheetwrite/core"
description: "Export a canonical data-space range as clipboard-compatible TSV (CRLF, no BOM)."
---
<!-- api-export:@sheetwrite/core|.|toTsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Export a canonical data-space range as clipboard-compatible TSV (CRLF, no
BOM). Reversed corners are normalized; active sort and filter views do not
remap the supplied row coordinates. Values are injection-hardened. The
synchronous API returns one in-memory string and fetches at most
`maxWriterWindowRows` canonical rows per packed store read.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L91</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toTsv(
  range: Range,
  store: Store,
  options?: DelimitedTextOptions,
): string
```

</div>
