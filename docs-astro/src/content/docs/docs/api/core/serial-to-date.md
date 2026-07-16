---
title: "serialToDate | @sheetwrite/core"
description: "Convert a date serial back to a Date."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|serialToDate -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Convert a date serial back to a `Date`. Read the result with the UTC accessors
(`getUTCFullYear`, `getUTCMonth`, …) — which is what the renderer does — so the
calendar fields are stable regardless of the host time zone.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/date-serial.ts#L40</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(serial: number): Date => ;
```
