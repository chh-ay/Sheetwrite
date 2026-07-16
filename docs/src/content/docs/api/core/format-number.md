---
title: "formatNumber | @sheetwrite/core"
description: "Deterministic Excel-style number/date formatter."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|formatNumber -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Deterministic Excel-style number/date formatter. Supports explicit locale
separators, percent/scientific notation, UTC date/time tokens, four-section
positive/negative/zero/text codes, quoted literals, and backslash escapes.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/number-format.ts#L455</code></dd></div>
</dl>

## Signature

```ts generated
function formatNumber(value: number | string, code?: string, locale?: string): string;
```
