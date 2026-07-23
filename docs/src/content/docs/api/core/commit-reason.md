---
title: "CommitReason | @sheetwrite/core"
description: "The gesture/operation that produced a committed transaction."
---
<!-- api-export:@sheetwrite/core|.|CommitReason -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

The gesture/operation that produced a committed transaction. Consumers
switching on reasons MUST keep a default branch — the union grows with new
mutation features.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L207</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type CommitReason =
  | "edit-blur"
  | "edit-enter"
  | "edit-tab"
  | "edit-programmatic"
  | "paste"
  | "cut"
  | "clear"
  | "fill"
  | "structure"
  | "style"
  | "replace"
  | "undo"
  | "redo"
  | "api";
```

</div>
