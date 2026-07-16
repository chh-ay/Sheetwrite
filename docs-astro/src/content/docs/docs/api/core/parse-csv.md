---
title: "parseCsv | @sheetwrite/core"
description: "Parse RFC-4180-style CSV into a grid of raw strings: comma-delimited, with \"-quoted fields that may embed commas, newlines, and doubled quotes, plus CR / LF / CRLF row breaks."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|parseCsv -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Parse RFC-4180-style CSV into a grid of raw strings: comma-delimited, with
`"`-quoted fields that may embed commas, newlines, and doubled quotes, plus
CR / LF / CRLF row breaks. A leading UTF-8 BOM is stripped. This mirrors
`parseTsv` from clipboard.ts exactly, but splits on commas instead of tabs.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L93</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(text: string): string[][] => ;
```
