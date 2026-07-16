---
title: "CommentMutationRequest | @sheetwrite/core"
description: "Versioned comment mutation submitted to a host adapter."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentMutationRequest -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Versioned comment mutation submitted to a host adapter.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L398</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="comment-mutation-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="comment-mutation-request-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="comment-mutation-request-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="comment-mutation-request-mutation" data-pagefind-weight="1">
<summary><code>mutation</code></summary>

```ts generated
mutation: CommentMutation;
```

</details>

<details class="api-member" id="comment-mutation-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentMutationRequest {
    documentId: string;
    baseVersion: number;
    clientMutationId: string;
    mutation: CommentMutation;
    signal?: AbortSignal;
}
```

</details>
