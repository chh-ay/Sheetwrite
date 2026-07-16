---
title: "SyncMutationRecord | @sheetwrite/core"
description: "Pending commit paired with its current synchronization status."
---
<!-- api-export:@sheetwrite/core|.|SyncMutationRecord -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pending commit paired with its current synchronization status.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L76</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="sync-mutation-record-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
status: SyncMutationStatus;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncMutationRecord extends PendingCommit {
  status: SyncMutationStatus;
}
```

</details>
