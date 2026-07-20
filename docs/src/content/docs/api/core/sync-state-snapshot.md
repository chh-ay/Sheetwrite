---
title: "SyncStateSnapshot | @sheetwrite/core"
description: "Immutable observable synchronization state."
---
<!-- api-export:@sheetwrite/core|.|SyncStateSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable observable synchronization state.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L71</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sync-state-snapshot-connection" data-pagefind-weight="1">
<summary><code>connection</code></summary>

```ts generated
connection: SyncConnectionState;
```

</details>

<details class="api-member" id="sync-state-snapshot-activity" data-pagefind-weight="1">
<summary><code>activity</code></summary>

```ts generated
activity: SyncActivityState;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-count" data-pagefind-weight="1">
<summary><code>pendingCount</code> <span class="api-member-summary">Pending local commits, including synchronous pre-commit reservations.</span></summary>

```ts generated
pendingCount: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-operations" data-pagefind-weight="1">
<summary><code>pendingOperations</code> <span class="api-member-summary">Aggregate DocumentOp count, including synchronous pre-commit reservations.</span></summary>

```ts generated
pendingOperations: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-encoded-bytes" data-pagefind-weight="1">
<summary><code>pendingEncodedBytes</code> <span class="api-member-summary">Aggregate UTF-8 bytes of pending JSON-encoded operation arrays.</span></summary>

```ts generated
pendingEncodedBytes: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-pending-capacity" data-pagefind-weight="1">
<summary><code>pendingCapacity</code> <span class="api-member-summary">Current local transaction admission state.</span></summary>

```ts generated
pendingCapacity: SyncPendingCapacityState;
```

</details>

<details class="api-member" id="sync-state-snapshot-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code> <span class="api-member-summary">Last accepted contiguous remote server version.</span></summary>

```ts generated
serverVersion: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncStateSnapshot {
  connection: SyncConnectionState;
  activity: SyncActivityState;
  pendingCount: number;
  pendingOperations: number;
  pendingEncodedBytes: number;
  pendingCapacity: SyncPendingCapacityState;
  serverVersion: number;
}
```

</details>
