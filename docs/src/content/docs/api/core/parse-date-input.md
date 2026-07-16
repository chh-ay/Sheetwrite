---
title: "parseDateInput | @sheetwrite/core"
description: "Parse a user-typed date string into a serial, or null when it is not a date."
---
<!-- api-export:@sheetwrite/core|.|parseDateInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse a user-typed date string into a serial, or `null` when it is not a date.
Accepted forms:

- ISO `yyyy-mm-dd` (e.g. `2026-07-06`);
- ISO date-time `yyyy-mm-dd hh:mm` or `yyyy-mm-dd hh:mm:ss` (a `T` separator is
  also accepted); the fractional serial carries the time;
- slash `dd/mm/yyyy` and `mm/dd/yyyy`, disambiguated **conservatively**: if one
  component exceeds 12 it must be the day and the layout is unambiguous; when
  both are ≤ 12 the value is ambiguous (e.g. `04/05/2026`) and is read as
  **mm/dd** — Google Sheets' default (US) locale. Both > 12 is rejected.

Anything else (bare numbers, free text) returns `null` so callers can fall back
to a text literal.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/date-serial.ts#L95</code></dd></div>
</dl>

## Declaration

```ts generated
function parseDateInput(raw: string): number | null
```
