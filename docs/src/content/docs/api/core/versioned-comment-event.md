---
title: "VersionedCommentEvent | @sheetwrite/core"
description: "Comment mutation paired with its assigned server version."
---
<!-- api-export:@sheetwrite/core|.|VersionedCommentEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Comment mutation paired with its assigned server version.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L424</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface VersionedCommentEvent {
  version: number;
  thread: CommentThread;
  clientMutationId?: string;
}
```

</details>
