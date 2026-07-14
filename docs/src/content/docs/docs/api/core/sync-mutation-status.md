---
title: "SyncMutationStatus | @sheetwrite/core"
description: "Lifecycle state of one local mutation in the synchronization queue."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncMutationStatus -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Lifecycle state of one local mutation in the synchronization queue.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L66</code></dd></div>
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

```ts generated title="TypeScript declaration"
export type SyncMutationStatus = "persisting" | "pending" | "sending" | "conflicted" | "storage-error";
```

</details>
