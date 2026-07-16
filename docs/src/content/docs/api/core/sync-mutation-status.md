---
title: "SyncMutationStatus | @sheetwrite/core"
description: "Lifecycle state of one local mutation in the synchronization queue."
---
<!-- api-export:@sheetwrite/core|.|SyncMutationStatus -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Lifecycle state of one local mutation in the synchronization queue.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L68</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SyncMutationStatus =
  "persisting" | "pending" | "sending" | "conflicted" | "storage-error";
```

</div>
