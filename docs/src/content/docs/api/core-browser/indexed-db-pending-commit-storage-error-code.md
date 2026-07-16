---
title: "IndexedDbPendingCommitStorageErrorCode | @sheetwrite/core/browser"
description: "Stable category for an IndexedDB pending-storage failure."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageErrorCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="type">type</span></div>

Stable category for an IndexedDB pending-storage failure.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L10</code></dd></div>
</dl>

## Declaration

```ts generated
export type IndexedDbPendingCommitStorageErrorCode =
  | "unavailable"
  | "blocked"
  | "aborted"
  | "quota"
  | "unsupported-schema"
  | "transaction";
```
