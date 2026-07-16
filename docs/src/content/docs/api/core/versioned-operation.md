---
title: "VersionedOperation | @sheetwrite/core"
description: "Remote document operations paired with a contiguous server version."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|VersionedOperation -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Remote document operations paired with a contiguous server version.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L81</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="versioned-operation-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="versioned-operation-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>

<details class="api-member" id="versioned-operation-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface VersionedOperation {
    version: number;
    readonly operations: readonly DocumentOp[];
    clientMutationId?: string;
}
```

</details>
