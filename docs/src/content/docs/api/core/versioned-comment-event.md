---
title: "VersionedCommentEvent | @sheetwrite/core"
description: "Comment mutation paired with its assigned server version."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|VersionedCommentEvent -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Comment mutation paired with its assigned server version.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L424</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="versioned-comment-event-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="versioned-comment-event-thread" data-pagefind-weight="1">
<summary><code>thread</code></summary>

```ts generated
thread: CommentThread;
```

</details>

<details class="api-member" id="versioned-comment-event-client-mutation-id" data-pagefind-weight="1">
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
export interface VersionedCommentEvent {
    version: number;
    thread: CommentThread;
    clientMutationId?: string;
}
```

</details>
