---
title: "RuntimeResourcePhase | @sheetwrite/core"
description: "Measurement point within one resource-accounted operation."
---
<!-- api-export:@sheetwrite/core|.|RuntimeResourcePhase -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Measurement point within one resource-accounted operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L47</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RuntimeResourcePhase =
  "before" | "peak" | "settled" | "after-destroy";
```

</div>
