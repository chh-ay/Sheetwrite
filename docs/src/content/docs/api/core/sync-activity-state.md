---
title: "SyncActivityState | @sheetwrite/core"
description: "Current persistence activity reported by a sync coordinator."
---
<!-- api-export:@sheetwrite/core|.|SyncActivityState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Current persistence activity reported by a sync coordinator.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L22</code></dd></div>
</dl>

## Declaration

```ts generated
export type SyncActivityState =
  | "hydrating"
  | "idle"
  | "persisting"
  | "pending"
  | "sending"
  | "conflict"
  | "error"
  | "destroyed";
```
