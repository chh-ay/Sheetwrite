---
title: "PendingCommitStorage | @sheetwrite/core"
description: "Host-owned durable queue."
---
<!-- api-export:@sheetwrite/core|.|PendingCommitStorage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host-owned durable queue. Browser storage lives in the optional `./browser` entrypoint.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L13</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-storage-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load(documentId: string, signal?: AbortSignal): Promise<readonly PendingCommit[]>;
```

</details>

<details class="api-member" id="pending-commit-storage-put" data-pagefind-weight="1">
<summary><code>put</code></summary>

```ts generated
put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
```

</details>

<details class="api-member" id="pending-commit-storage-remove" data-pagefind-weight="1">
<summary><code>remove</code></summary>

```ts generated
remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PendingCommitStorage {
  load(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<readonly PendingCommit[]>;
  put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
  remove(
    documentId: string,
    clientMutationId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}
```

</details>
