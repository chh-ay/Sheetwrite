---
title: "dateToSerial | @sheetwrite/core"
description: "Convert a real UTC Date to the Excel 1900-system serial."
---
<!-- api-export:@sheetwrite/core|.|dateToSerial -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Convert a real UTC `Date` to the Excel 1900-system serial. It is the inverse
of [`serialToDate`](/docs/api/core/serial-to-date/) except for synthetic serial 60, which JavaScript
cannot represent as a Date. Construct calendar dates with `Date.UTC(...)`
(or via [`parseDateInput`](/docs/api/core/parse-date-input/)) to avoid host-timezone shifts.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/date-serial.ts#L29</code></dd></div>
</dl>

## Signature

```ts generated
function dateToSerial(date: Date): number;
```
