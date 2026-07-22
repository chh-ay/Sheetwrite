---
title: "SheetLifecycleIssueCode | @sheetwrite/core"
description: "Stable lifecycle rejection codes suitable for inline sheet-management UI."
---
<!-- api-export:@sheetwrite/core|.|SheetLifecycleIssueCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable lifecycle rejection codes suitable for inline sheet-management UI.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L205</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetLifecycleIssueCode =
  | SheetNameIssueCode
  | "duplicate-sheet-id"
  | "sheet-not-found"
  | "invalid-sheet"
  | "invalid-position"
  | "last-visible-sheet";
```

</div>
