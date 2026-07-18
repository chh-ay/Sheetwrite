---
title: "SyncPendingCapacityState | @sheetwrite/core"
description: "Whether the durable local queue can currently admit another transaction."
---
<!-- api-export:@sheetwrite/core|.|SyncPendingCapacityState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Whether the durable local queue can currently admit another transaction.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L62</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SyncPendingCapacityState =
  "hydrating" | "available" | "full" | "restore-error" | "destroyed";
```

</div>
