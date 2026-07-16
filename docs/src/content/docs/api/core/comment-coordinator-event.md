---
title: "CommentCoordinatorEvent | @sheetwrite/core"
description: "State transition emitted by the comment coordinator."
---
<!-- api-export:@sheetwrite/core|.|CommentCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

State transition emitted by the comment coordinator.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L448</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ type: &quot;loaded&quot;; version: number; threads: readonly CommentThread[] }</code></div>
<div class="api-variant"><code>{ type: &quot;changed&quot;; version: number; thread: CommentThread }</code></div>
<div class="api-variant"><code>{ type: &quot;conflict&quot;; currentVersion: number }</code></div>
<div class="api-variant"><code>{ type: &quot;gap&quot;; expectedVersion: number; receivedVersion: number }</code></div>
<div class="api-variant"><code>{ type: &quot;error&quot;; error: unknown }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentCoordinatorEvent = {
    type: "loaded";
    version: number;
    threads: readonly CommentThread[];
} | {
    type: "changed";
    version: number;
    thread: CommentThread;
} | {
    type: "conflict";
    currentVersion: number;
} | {
    type: "gap";
    expectedVersion: number;
    receivedVersion: number;
} | {
    type: "error";
    error: unknown;
};
```

</details>
