---
title: "SyncCoordinatorOptions | @sheetwrite/core"
description: "Document, version, durability, and online options for synchronization."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Document, version, durability, and online options for synchronization.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L49</code></dd></div>
</dl>

## Members <span class="api-count">6</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-options-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>
<pre><code>documentId: string;</code></pre>
</details>

<details class="api-member" id="sync-coordinator-options-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>
<pre><code>serverVersion: number;</code></pre>
</details>

<details class="api-member" id="sync-coordinator-options-create-mutation-id" data-pagefind-weight="1">
<summary><code>createMutationId</code></summary>
<pre><code>createMutationId?: () =&gt; string;</code></pre>
</details>

<details class="api-member" id="sync-coordinator-options-pending-storage" data-pagefind-weight="1">
<summary><code>pendingStorage</code></summary>
<pre><code>pendingStorage?: PendingCommitStorage;</code></pre>
</details>

<details class="api-member" id="sync-coordinator-options-initial-connection" data-pagefind-weight="1">
<summary><code>initialConnection</code></summary>
<pre><code>initialConnection?: &quot;offline&quot; | &quot;online&quot;;</code></pre>
</details>

<details class="api-member" id="sync-coordinator-options-recover-version-gap" data-pagefind-weight="1">
<summary><code>recoverVersionGap</code> <span class="api-member-summary">Optional host recovery hook.</span></summary>
<pre><code>recoverVersionGap?: ( request: SyncVersionGapRequest, ) =&gt; Promise&lt;readonly VersionedOperation[] | WorkbookSnapshot&gt;;</code></pre>
<p class="api-member-doc">Optional host recovery hook. Return the missing ordered operations, or a
snapshot for the host to remount before calling `resumeAfterReload`.</p>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SyncCoordinatorOptions {
    documentId: string;
    serverVersion: number;
    createMutationId?: () => string;
    pendingStorage?: PendingCommitStorage;
    initialConnection?: "offline" | "online";
    recoverVersionGap?: (request: SyncVersionGapRequest) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
}
```

</details>
