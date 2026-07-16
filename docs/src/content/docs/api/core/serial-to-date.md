---
title: "serialToDate | @sheetwrite/core"
description: "Convert a date serial back to a Date."
---
<!-- api-export:@sheetwrite/core|.|serialToDate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Convert a date serial back to a `Date`. Read the result with the UTC accessors
(`getUTCFullYear`, `getUTCMonth`, …) — which is what the renderer does — so the
calendar fields are stable regardless of the host time zone.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/date-serial.ts#L40</code></dd></div>
</dl>

## Signature

```ts generated
function serialToDate(serial: number): Date;
```
