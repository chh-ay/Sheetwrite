---
title: "CommentThread | @sheetwrite/core"
description: "Versioned discussion anchored to a document location."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentThread -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Versioned discussion anchored to a document location.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L374</code></dd></div>
</dl>

## Members <span class="api-count">8</span>

<div class="api-member-list">

<details class="api-member" id="comment-thread-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="comment-thread-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="comment-thread-anchor" data-pagefind-weight="1">
<summary><code>anchor</code></summary>

```ts generated
anchor: CommentAnchor;
```

</details>

<details class="api-member" id="comment-thread-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="comment-thread-messages" data-pagefind-weight="1">
<summary><code>messages</code></summary>

```ts generated
messages: readonly CommentMessage[];
```

</details>

<details class="api-member" id="comment-thread-resolved" data-pagefind-weight="1">
<summary><code>resolved</code></summary>

```ts generated
resolved: boolean;
```

</details>

<details class="api-member" id="comment-thread-resolved-by" data-pagefind-weight="1">
<summary><code>resolvedBy</code></summary>

```ts generated
resolvedBy?: CommentAuthorRef;
```

</details>

<details class="api-member" id="comment-thread-resolved-at" data-pagefind-weight="1">
<summary><code>resolvedAt</code></summary>

```ts generated
resolvedAt?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommentThread {
    id: string;
    documentId: string;
    anchor: CommentAnchor;
    version: number;
    messages: readonly CommentMessage[];
    resolved: boolean;
    resolvedBy?: CommentAuthorRef;
    resolvedAt?: string;
}
```

</details>
