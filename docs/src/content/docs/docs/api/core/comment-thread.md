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
<pre><code>id: string;</code></pre>
</details>

<details class="api-member" id="comment-thread-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>
<pre><code>documentId: string;</code></pre>
</details>

<details class="api-member" id="comment-thread-anchor" data-pagefind-weight="1">
<summary><code>anchor</code></summary>
<pre><code>anchor: CommentAnchor;</code></pre>
</details>

<details class="api-member" id="comment-thread-version" data-pagefind-weight="1">
<summary><code>version</code></summary>
<pre><code>version: number;</code></pre>
</details>

<details class="api-member" id="comment-thread-messages" data-pagefind-weight="1">
<summary><code>messages</code></summary>
<pre><code>messages: readonly CommentMessage[];</code></pre>
</details>

<details class="api-member" id="comment-thread-resolved" data-pagefind-weight="1">
<summary><code>resolved</code></summary>
<pre><code>resolved: boolean;</code></pre>
</details>

<details class="api-member" id="comment-thread-resolved-by" data-pagefind-weight="1">
<summary><code>resolvedBy</code></summary>
<pre><code>resolvedBy?: CommentAuthorRef;</code></pre>
</details>

<details class="api-member" id="comment-thread-resolved-at" data-pagefind-weight="1">
<summary><code>resolvedAt</code></summary>
<pre><code>resolvedAt?: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
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
