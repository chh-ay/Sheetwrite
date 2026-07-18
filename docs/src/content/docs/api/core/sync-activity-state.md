---
title: "SyncActivityState | @sheetwrite/core"
description: "Current persistence activity reported by a sync coordinator."
---
<!-- api-export:@sheetwrite/core|.|SyncActivityState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Current persistence activity reported by a sync coordinator.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L52</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

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

</div>
