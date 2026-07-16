---
title: "PendingCommit | @sheetwrite/core"
description: "Immutable local operation batch awaiting a host acknowledgement."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PendingCommit -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Immutable local operation batch awaiting a host acknowledgement.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L60</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>
<pre><code>documentId: string;</code></pre>
</details>

<details class="api-member" id="pending-commit-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>
<pre><code>baseVersion: number;</code></pre>
</details>

<details class="api-member" id="pending-commit-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>
<pre><code>clientMutationId: string;</code></pre>
</details>

<details class="api-member" id="pending-commit-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>
<pre><code>readonly operations: readonly DocumentOp[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PendingCommit {
    documentId: string;
    baseVersion: number;
    clientMutationId: string;
    readonly operations: readonly DocumentOp[];
}
```

</details>
