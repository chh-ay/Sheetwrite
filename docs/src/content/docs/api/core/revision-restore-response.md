---
title: "RevisionRestoreResponse | @sheetwrite/core"
description: "Applied or conflict acknowledgement for a revision restore."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RevisionRestoreResponse -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Applied or conflict acknowledgement for a revision restore.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L240</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ status: &quot;applied&quot;; version: number; clientMutationId: string; snapshot: WorkbookSnapshot; }</code></div>
<div class="api-variant"><code>{ status: &quot;duplicate&quot;; version: number; clientMutationId: string }</code></div>
<div class="api-variant"><code>{ status: &quot;conflict&quot;; currentVersion: number }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type RevisionRestoreResponse = {
    status: "applied";
    version: number;
    clientMutationId: string;
    snapshot: WorkbookSnapshot;
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
