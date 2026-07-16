---
title: "parseCellInput | @sheetwrite/core"
description: "Coerce raw text input into a CellValue, following spreadsheet input-bar conventions: - blank (after trimming) clears the cell to a null literal; - text longer than one character beginning with = becomes a formula; -…"
---
<!-- api-export:@sheetwrite/core|.|parseCellInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Coerce raw text input into a [`CellValue`](/docs/api/core/cell-value/), following spreadsheet
input-bar conventions:

- blank (after trimming) clears the cell to a `null` literal;
- text longer than one character beginning with `=` becomes a formula;
- in a `number` column a finite numeric string becomes a number literal;
- in a `date` column a recognized date string ([`parseDateInput`](/docs/api/core/parse-date-input/)) becomes
  its serial-number literal;
- in a `currency` column a currency string ([`parseCurrencyInput`](/docs/api/core/parse-currency-input/)) becomes
  a plain number literal;
- anything else is stored verbatim as a text literal (the untrimmed `raw`).

Shared by the grid's inline editor and any host-built formula bar, so input
parsing is identical everywhere instead of re-derived per consumer.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/cell-input.ts#L28</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCellInput(raw: string, type: CellFormat): CellValue
```

</div>
