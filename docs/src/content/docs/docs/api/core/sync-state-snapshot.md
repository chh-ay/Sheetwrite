---
title: "SyncStateSnapshot | @sheetwrite/core"
description: "Immutable observable synchronization state."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncStateSnapshot -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Immutable observable synchronization state.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L33</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="sync-state-snapshot-connection" data-pagefind-weight="1">
<summary><code>connection</code></summary>
<pre><code>connection: SyncConnectionState;</code></pre>
</details>

<details class="api-member" id="sync-state-snapshot-activity" data-pagefind-weight="1">
<summary><code>activity</code></summary>
<pre><code>activity: SyncActivityState;</code></pre>
</details>

<details class="api-member" id="sync-state-snapshot-pending-count" data-pagefind-weight="1">
<summary><code>pendingCount</code></summary>
<pre><code>pendingCount: number;</code></pre>
</details>

<details class="api-member" id="sync-state-snapshot-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>
<pre><code>serverVersion: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SyncStateSnapshot {
    connection: SyncConnectionState;
    activity: SyncActivityState;
    pendingCount: number;
    serverVersion: number;
}
```

</details>
