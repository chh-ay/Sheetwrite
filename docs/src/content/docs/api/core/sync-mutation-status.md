---
title: "SyncMutationStatus | @sheetwrite/core"
description: "Lifecycle state of one local mutation in the synchronization queue."
---
<!-- api-export:@sheetwrite/core|.|SyncMutationStatus -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Lifecycle state of one local mutation in the synchronization queue.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L68</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;persisting&quot;</code></div>
<div class="api-variant"><code>&quot;pending&quot;</code></div>
<div class="api-variant"><code>&quot;sending&quot;</code></div>
<div class="api-variant"><code>&quot;conflicted&quot;</code></div>
<div class="api-variant"><code>&quot;storage-error&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type SyncMutationStatus = "persisting" | "pending" | "sending" | "conflicted" | "storage-error";
```

</details>
