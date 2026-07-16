---
title: "SyncStateSnapshot | @sheetwrite/core"
description: "Immutable observable synchronization state."
---
<!-- api-export:@sheetwrite/core|.|SyncStateSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable observable synchronization state.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L33</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

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
<summary><code>pendingCount</code></summary>

```ts generated
pendingCount: number;
```

</details>

<details class="api-member" id="sync-state-snapshot-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncStateSnapshot {
  connection: SyncConnectionState;
  activity: SyncActivityState;
  pendingCount: number;
  serverVersion: number;
}
```

</details>
