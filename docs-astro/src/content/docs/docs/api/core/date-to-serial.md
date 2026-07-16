---
title: "dateToSerial | @sheetwrite/core"
description: "Convert a real UTC Date to the Excel 1900-system serial."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|dateToSerial -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Convert a real UTC `Date` to the Excel 1900-system serial. It is the inverse
of [`serialToDate`](/docs/api/core/serial-to-date/) except for synthetic serial 60, which JavaScript
cannot represent as a Date. Construct calendar dates with `Date.UTC(...)`
(or via [`parseDateInput`](/docs/api/core/parse-date-input/)) to avoid host-timezone shifts.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/date-serial.ts#L29</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(date: Date): number => ;
```
