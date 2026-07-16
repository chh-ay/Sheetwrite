---
title: "SyncMutationRecord | @sheetwrite/core"
description: "Pending commit paired with its current synchronization status."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncMutationRecord -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Pending commit paired with its current synchronization status.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L76</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="sync-mutation-record-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
status: SyncMutationStatus;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncMutationRecord extends PendingCommit {
    status: SyncMutationStatus;
}
```

</details>
