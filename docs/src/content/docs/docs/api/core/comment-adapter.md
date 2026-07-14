---
title: "CommentAdapter | @sheetwrite/core"
description: "Host persistence contract for versioned comment threads."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentAdapter -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host persistence contract for versioned comment threads.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L431</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="comment-adapter-list-comments" data-pagefind-weight="1">
<summary><code>listComments</code></summary>
<pre><code>listComments(documentId: string, signal?: AbortSignal): Promise&lt;CommentListResult&gt;;</code></pre>
</details>

<details class="api-member" id="comment-adapter-mutate-comment" data-pagefind-weight="1">
<summary><code>mutateComment</code></summary>
<pre><code>mutateComment(request: CommentMutationRequest): Promise&lt;CommentMutationResponse&gt;;</code></pre>
</details>

<details class="api-member" id="comment-adapter-subscribe-comments" data-pagefind-weight="1">
<summary><code>subscribeComments</code></summary>
<pre><code>subscribeComments?( documentId: string, listener: (event: VersionedCommentEvent) =&gt; void, signal?: AbortSignal, ): undefined | (() =&gt; void);</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface CommentAdapter {
    listComments(documentId: string, signal?: AbortSignal): Promise<CommentListResult>;
    mutateComment(request: CommentMutationRequest): Promise<CommentMutationResponse>;
    subscribeComments?(documentId: string, listener: (event: VersionedCommentEvent) => void, signal?: AbortSignal): undefined | (() => void);
}
```

</details>
