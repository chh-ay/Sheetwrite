---
title: "SyncCoordinatorEvent | @sheetwrite/core"
description: "Queue, version, connection, or error transition emitted by synchronization."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorEvent -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Queue, version, connection, or error transition emitted by synchronization.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L65</code></dd></div>
</dl>

## Variants <span class="api-count">12</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ type: &quot;state&quot;; state: SyncStateSnapshot }</code></div>
<div class="api-variant"><code>{ type: &quot;restored&quot;; pending: readonly SyncMutationRecord[] }</code></div>
<div class="api-variant"><code>{ type: &quot;persisting&quot;; mutation: SyncMutationRecord }</code></div>
<div class="api-variant"><code>{ type: &quot;pending&quot;; mutation: SyncMutationRecord }</code></div>
<div class="api-variant"><code>{ type: &quot;sending&quot;; mutation: SyncMutationRecord }</code></div>
<div class="api-variant"><code>{ type: &quot;acknowledged&quot;; clientMutationId: string; version: number; duplicate: boolean; }</code></div>
<div class="api-variant"><code>{ type: &quot;conflict&quot;; mutation: SyncMutationRecord; response: Extract&lt;PersistenceCommitResponse, { status: &quot;conflict&quot; }&gt;; }</code></div>
<div class="api-variant"><code>{ type: &quot;remote-applied&quot;; operation: VersionedOperation }</code></div>
<div class="api-variant"><code>{ type: &quot;reload-required&quot;; expectedVersion: number; receivedVersion: number; snapshot?: WorkbookSnapshot; }</code></div>
<div class="api-variant"><code>{ type: &quot;reloaded&quot;; serverVersion: number; pending: readonly SyncMutationRecord[] }</code></div>
<div class="api-variant"><code>{ type: &quot;storage-error&quot;; error: unknown; clientMutationId?: string }</code></div>
<div class="api-variant"><code>{ type: &quot;error&quot;; error: unknown; clientMutationId?: string }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type SyncCoordinatorEvent = {
    type: "state";
    state: SyncStateSnapshot;
} | {
    type: "restored";
    pending: readonly SyncMutationRecord[];
} | {
    type: "persisting";
    mutation: SyncMutationRecord;
} | {
    type: "pending";
    mutation: SyncMutationRecord;
} | {
    type: "sending";
    mutation: SyncMutationRecord;
} | {
    type: "acknowledged";
    clientMutationId: string;
    version: number;
    duplicate: boolean;
} | {
    type: "conflict";
    mutation: SyncMutationRecord;
    response: Extract<PersistenceCommitResponse, {
        status: "conflict";
    }>;
} | {
    type: "remote-applied";
    operation: VersionedOperation;
} | {
    type: "reload-required";
    expectedVersion: number;
    receivedVersion: number;
    snapshot?: WorkbookSnapshot;
} | {
    type: "reloaded";
    serverVersion: number;
    pending: readonly SyncMutationRecord[];
} | {
    type: "storage-error";
    error: unknown;
    clientMutationId?: string;
} | {
    type: "error";
    error: unknown;
    clientMutationId?: string;
};
```

</details>
