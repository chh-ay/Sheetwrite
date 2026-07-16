---
title: "parseCsv | @sheetwrite/core"
description: "Parse RFC-4180-style CSV into a grid of raw strings: comma-delimited, with \"-quoted fields that may embed commas, newlines, and doubled quotes, plus CR / LF / CRLF row breaks."
---
<!-- api-export:@sheetwrite/core|.|parseCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse RFC-4180-style CSV into a grid of raw strings: comma-delimited, with
`"`-quoted fields that may embed commas, newlines, and doubled quotes, plus
CR / LF / CRLF row breaks. A leading UTF-8 BOM is stripped. This mirrors
`parseTsv` from clipboard.ts exactly, but splits on commas instead of tabs.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L93</code></dd></div>
</dl>

## Declaration

```ts generated
function parseCsv(text: string): string[][]
```
