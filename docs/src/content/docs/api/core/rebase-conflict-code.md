---
title: "RebaseConflictCode | @sheetwrite/core"
description: "Stable conservative-rebase conflict category."
---
<!-- api-export:@sheetwrite/core|.|RebaseConflictCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable conservative-rebase conflict category.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L6</code></dd></div>
</dl>

## Declaration

```ts generated
export type RebaseConflictCode =
  | "overlapping-edit"
  | "sheet-removed"
  | "sheet-lifecycle"
  | "formula-structural"
  | "structural-overlap"
  | "unsupported-structural";
```
