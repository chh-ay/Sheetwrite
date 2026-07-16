---
title: "formatNumber | @sheetwrite/core"
description: "Deterministic Excel-style number/date formatter."
---
<!-- api-export:@sheetwrite/core|.|formatNumber -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Deterministic Excel-style number/date formatter. Supports explicit locale
separators, percent/scientific notation, UTC date/time tokens, four-section
positive/negative/zero/text codes, quoted literals, and backslash escapes.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/number-format.ts#L455</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function formatNumber(
  value: number | string,
  code?: string,
  locale?: string,
): string
```

</div>
