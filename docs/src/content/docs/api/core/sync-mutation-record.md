---
title: "SyncMutationRecord | @sheetwrite/core"
description: "Pending commit paired with its current synchronization status."
---
<!-- api-export:@sheetwrite/core|.|SyncMutationRecord -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pending commit paired with its current synchronization status.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L88</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="sync-mutation-record-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
status: SyncMutationStatus;
```

</details>

<details class="api-member" id="sync-mutation-record-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-mutation-record-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="sync-mutation-record-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="sync-mutation-record-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncMutationRecord {
  status: SyncMutationStatus;
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  readonly operations: readonly DocumentOp[];
}
```

</details>
