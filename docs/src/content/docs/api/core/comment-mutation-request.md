---
title: "CommentMutationRequest | @sheetwrite/core"
description: "Versioned comment mutation submitted to a host adapter."
---
<!-- api-export:@sheetwrite/core|.|CommentMutationRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Versioned comment mutation submitted to a host adapter.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L440</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

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

<details class="api-declaration" data-pagefind-ignore>
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
