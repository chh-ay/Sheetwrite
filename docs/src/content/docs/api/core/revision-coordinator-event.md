---
title: "RevisionCoordinatorEvent | @sheetwrite/core"
description: "State or restore transition emitted by revision coordination."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinatorEvent -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

State or restore transition emitted by revision coordination.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L266</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ type: &quot;restored&quot;; targetVersion: number; version: number }</code></div>
<div class="api-variant"><code>{ type: &quot;conflict&quot;; targetVersion: number; currentVersion: number }</code></div>
<div class="api-variant"><code>{ type: &quot;error&quot;; error: unknown }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type RevisionCoordinatorEvent = {
    type: "restored";
    targetVersion: number;
    version: number;
} | {
    type: "conflict";
    targetVersion: number;
    currentVersion: number;
} | {
    type: "error";
    error: unknown;
};
```

</details>
