---
title: "parseCurrencyInput | @sheetwrite/core"
description: "Parse a currency-formatted string into a plain number, or null when the remaining text is not numeric."
---
<!-- api-export:@sheetwrite/core|.|parseCurrencyInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse a currency-formatted string into a plain number, or `null` when the
remaining text is not numeric. Strips currency symbols (`$ € £ ¥ ¤`), thousands
grouping (`,`), and whitespace, and reads accounting-style parentheses
(`(1,234.50)`) as a negative amount. Grouping/decimals follow the US locale the
renderer uses.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/cell-input.ts#L74</code></dd></div>
</dl>

## Signature

```ts generated
function parseCurrencyInput(raw: string): number | null;
```
