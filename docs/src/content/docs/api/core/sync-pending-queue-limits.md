---
title: "SyncPendingQueueLimits | @sheetwrite/core"
description: "Aggregate ceilings for local commits retained until durable acknowledgement."
---
<!-- api-export:@sheetwrite/core|.|SyncPendingQueueLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Aggregate ceilings for local commits retained until durable acknowledgement.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L95</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="sync-pending-queue-limits-max-pending-commits" data-pagefind-weight="1">
<summary><code>maxPendingCommits</code> <span class="api-member-summary">Maximum number of pending local commits, including synchronous reservations.</span></summary>

```ts generated
maxPendingCommits: number;
```

</details>

<details class="api-member" id="sync-pending-queue-limits-max-pending-operations" data-pagefind-weight="1">
<summary><code>maxPendingOperations</code> <span class="api-member-summary">Maximum aggregate DocumentOp count across pending local commits.</span></summary>

```ts generated
maxPendingOperations: number;
```

</details>

<details class="api-member" id="sync-pending-queue-limits-max-pending-encoded-bytes" data-pagefind-weight="1">
<summary><code>maxPendingEncodedBytes</code> <span class="api-member-summary">Maximum aggregate UTF-8 bytes across JSON-encoded pending operation arrays.</span></summary>

```ts generated
maxPendingEncodedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncPendingQueueLimits {
  maxPendingCommits: number;
  maxPendingOperations: number;
  maxPendingEncodedBytes: number;
}
```

</details>
