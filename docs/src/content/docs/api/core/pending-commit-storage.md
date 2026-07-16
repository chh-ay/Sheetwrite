---
title: "PendingCommitStorage | @sheetwrite/core"
description: "Host-owned durable queue."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PendingCommitStorage -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host-owned durable queue. Browser storage lives in the optional `./browser` entrypoint.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L13</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-storage-load" data-pagefind-weight="1">
<summary><code>load</code></summary>
<pre><code>load(documentId: string, signal?: AbortSignal): Promise&lt;readonly PendingCommit[]&gt;;</code></pre>
</details>

<details class="api-member" id="pending-commit-storage-put" data-pagefind-weight="1">
<summary><code>put</code></summary>
<pre><code>put(commit: PendingCommit, signal?: AbortSignal): Promise&lt;void&gt;;</code></pre>
</details>

<details class="api-member" id="pending-commit-storage-remove" data-pagefind-weight="1">
<summary><code>remove</code></summary>
<pre><code>remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise&lt;void&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PendingCommitStorage {
    load(documentId: string, signal?: AbortSignal): Promise<readonly PendingCommit[]>;
    put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
    remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void>;
}
```

</details>
