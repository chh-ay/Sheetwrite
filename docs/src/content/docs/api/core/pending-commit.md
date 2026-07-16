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

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="pending-commit-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="pending-commit-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="pending-commit-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PendingCommit {
    documentId: string;
    baseVersion: number;
    clientMutationId: string;
    readonly operations: readonly DocumentOp[];
}
```

</details>
