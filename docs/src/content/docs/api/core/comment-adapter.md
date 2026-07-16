---
title: "CommentAdapter | @sheetwrite/core"
description: "Host persistence contract for versioned comment threads."
---
<!-- api-export:@sheetwrite/core|.|CommentAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host persistence contract for versioned comment threads.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L431</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="comment-adapter-list-comments" data-pagefind-weight="1">
<summary><code>listComments</code></summary>

```ts generated
listComments(documentId: string, signal?: AbortSignal): Promise<CommentListResult>;
```

</details>

<details class="api-member" id="comment-adapter-mutate-comment" data-pagefind-weight="1">
<summary><code>mutateComment</code></summary>

```ts generated
mutateComment(request: CommentMutationRequest): Promise<CommentMutationResponse>;
```

</details>

<details class="api-member" id="comment-adapter-subscribe-comments" data-pagefind-weight="1">
<summary><code>subscribeComments</code></summary>

```ts generated
subscribeComments?( documentId: string, listener: (event: VersionedCommentEvent) => void, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentAdapter {
  listComments(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<CommentListResult>;
  mutateComment(
    request: CommentMutationRequest,
  ): Promise<CommentMutationResponse>;
  subscribeComments?(
    documentId: string,
    listener: (event: VersionedCommentEvent) => void,
    signal?: AbortSignal,
  ): undefined | (() => void);
}
```

</details>
