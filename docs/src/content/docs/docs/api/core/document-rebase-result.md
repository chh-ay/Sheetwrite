---
title: "DocumentRebaseResult | @sheetwrite/core"
description: "Successful rebased operations or a conservative rebase conflict."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DocumentRebaseResult -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Successful rebased operations or a conservative rebase conflict.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L23</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ status: &quot;rebased&quot;; operations: readonly DocumentOp[] }</code></div>
<div class="api-variant"><code>{ status: &quot;conflict&quot;; conflict: RebaseConflict }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type DocumentRebaseResult = {
    status: "rebased";
    operations: readonly DocumentOp[];
} | {
    status: "conflict";
    conflict: RebaseConflict;
};
```

</details>
