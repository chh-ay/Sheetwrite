---
title: "PresenceCoordinatorEvent | @sheetwrite/core"
description: "Connection or actor transition emitted by presence coordination."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinatorEvent -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Connection or actor transition emitted by presence coordination.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L50</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ type: &quot;published&quot;; message: PresenceMessage }</code></div>
<div class="api-variant"><code>{ type: &quot;updated&quot;; actorId: string }</code></div>
<div class="api-variant"><code>{ type: &quot;expired&quot;; actorId: string }</code></div>
<div class="api-variant"><code>{ type: &quot;error&quot;; error: unknown }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type PresenceCoordinatorEvent = {
    type: "published";
    message: PresenceMessage;
} | {
    type: "updated";
    actorId: string;
} | {
    type: "expired";
    actorId: string;
} | {
    type: "error";
    error: unknown;
};
```

</details>
