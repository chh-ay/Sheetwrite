---
title: "CommentMutation | @sheetwrite/core"
description: "Serializable operation that creates or updates comment state."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentMutation -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Serializable operation that creates or updates comment state.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L386</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;create&quot;; threadId: string; messageId: string; anchor: CommentAnchor; body: string; }</code></div>
<div class="api-variant"><code>{ kind: &quot;reply&quot;; threadId: string; messageId: string; body: string }</code></div>
<div class="api-variant"><code>{ kind: &quot;resolve&quot;; threadId: string; resolved: boolean }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type CommentMutation = {
    kind: "create";
    threadId: string;
    messageId: string;
    anchor: CommentAnchor;
    body: string;
} | {
    kind: "reply";
    threadId: string;
    messageId: string;
    body: string;
} | {
    kind: "resolve";
    threadId: string;
    resolved: boolean;
};
```

</details>
