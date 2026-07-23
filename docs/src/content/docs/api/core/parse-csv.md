---
title: "parseCsv | @sheetwrite/core"
description: "Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes, bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional leading UTF-8 BOM."
---
<!-- api-export:@sheetwrite/core|.|parseCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes,
bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional
leading UTF-8 BOM. The synchronous API consumes an existing in-memory string
and returns an in-memory grid; it does not claim streaming. Scanning enforces
resource ceilings before materializing the next oversized field or record.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L139</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCsv(
  text: string,
  options?: DelimitedTextOptions,
): string[][]
```

</div>
