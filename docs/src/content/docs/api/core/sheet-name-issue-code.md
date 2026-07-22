---
title: "SheetNameIssueCode | @sheetwrite/core"
description: "Stable reason codes returned by worksheet-name validation."
---
<!-- api-export:@sheetwrite/core|.|SheetNameIssueCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable reason codes returned by worksheet-name validation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sheet-name.ts#L5</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetNameIssueCode =
  | "blank"
  | "too-long"
  | "forbidden-character"
  | "edge-apostrophe"
  | "duplicate";
```

</div>
