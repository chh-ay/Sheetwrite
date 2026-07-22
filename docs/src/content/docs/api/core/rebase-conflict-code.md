---
title: "RebaseConflictCode | @sheetwrite/core"
description: "Stable conservative-rebase conflict category."
---
<!-- api-export:@sheetwrite/core|.|RebaseConflictCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable conservative-rebase conflict category.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L7</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RebaseConflictCode =
  | "overlapping-edit"
  | "sheet-removed"
  | "sheet-lifecycle"
  | "formula-structural"
  | "structural-overlap"
  | "unsupported-structural";
```

</div>
