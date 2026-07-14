---
title: "CellFormat | @sheetwrite/core"
description: "How a column's cells are typed, parsed, and rendered: text verbatim, number via its numberFormat, date as an Excel-style serial (see date-serial.ts) rendered by a date numberFormat, and currency as a plain number…"
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellFormat -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

How a column's cells are typed, parsed, and rendered: `text` verbatim, `number`
via its `numberFormat`, `date` as an Excel-style serial (see `date-serial.ts`)
rendered by a date `numberFormat`, and `currency` as a plain number rendered by
a currency `numberFormat` (e.g. `$#,##0.00`).

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L62</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;text&quot;</code></div>
<div class="api-variant"><code>&quot;number&quot;</code></div>
<div class="api-variant"><code>&quot;date&quot;</code></div>
<div class="api-variant"><code>&quot;currency&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type CellFormat = "text" | "number" | "date" | "currency";
```

</details>
