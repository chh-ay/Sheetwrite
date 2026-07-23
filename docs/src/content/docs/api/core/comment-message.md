---
title: "CommentMessage | @sheetwrite/core"
description: "One immutable author message in a comment thread."
---
<!-- api-export:@sheetwrite/core|.|CommentMessage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One immutable author message in a comment thread.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L407</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="comment-message-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="comment-message-author" data-pagefind-weight="1">
<summary><code>author</code></summary>

```ts generated
author: CommentAuthorRef;
```

</details>

<details class="api-member" id="comment-message-body" data-pagefind-weight="1">
<summary><code>body</code></summary>

```ts generated
body: string;
```

</details>

<details class="api-member" id="comment-message-created-at" data-pagefind-weight="1">
<summary><code>createdAt</code></summary>

```ts generated
createdAt: string;
```

</details>

<details class="api-member" id="comment-message-edited-at" data-pagefind-weight="1">
<summary><code>editedAt</code></summary>

```ts generated
editedAt?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentMessage {
  id: string;
  author: CommentAuthorRef;
  body: string;
  createdAt: string;
  editedAt?: string;
}
```

</details>
