---
title: "CommentMutationResponse | @sheetwrite/core"
description: "Applied, duplicate, or conflict acknowledgement for a comment mutation."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CommentMutationResponse -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Applied, duplicate, or conflict acknowledgement for a comment mutation.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L407</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ status: &quot;applied&quot;; version: number; clientMutationId: string; thread: CommentThread; }</code></div>
<div class="api-variant"><code>{ status: &quot;duplicate&quot;; version: number; clientMutationId: string }</code></div>
<div class="api-variant"><code>{ status: &quot;conflict&quot;; currentVersion: number }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentMutationResponse = {
    status: "applied";
    version: number;
    clientMutationId: string;
    thread: CommentThread;
} | {
    status: "duplicate";
    version: number;
    clientMutationId: string;
} | {
    status: "conflict";
    currentVersion: number;
};
```

</details>
