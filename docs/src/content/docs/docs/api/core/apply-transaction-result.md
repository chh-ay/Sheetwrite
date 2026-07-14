---
title: "ApplyTransactionResult | @sheetwrite/core"
description: "Outcome of applying a document transaction, including conflict, rejection, and no-op states."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ApplyTransactionResult -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Outcome of applying a document transaction, including conflict, rejection, and no-op states.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L21</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ status: &quot;applied&quot;; epoch: number; transaction: Transaction; warnings?: MutationIssue[]; rejections?: MutationIssue[]; }</code></div>
<div class="api-variant"><code>{ status: &quot;conflict&quot;; expectedEpoch: number; actualEpoch: number }</code></div>
<div class="api-variant"><code>{ status: &quot;rejected&quot;; epoch: number; issues: MutationIssue[]; }</code></div>
<div class="api-variant"><code>{ status: &quot;noop&quot;; epoch: number; reason: &quot;empty&quot; | &quot;out-of-bounds&quot; | &quot;incomplete-data&quot; | &quot;read-only&quot;; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type ApplyTransactionResult = {
    status: "applied";
    epoch: number;
    transaction: Transaction;
    warnings?: MutationIssue[];
    rejections?: MutationIssue[];
} | {
    status: "conflict";
    expectedEpoch: number;
    actualEpoch: number;
} | {
    status: "rejected";
    epoch: number;
    issues: MutationIssue[];
} | {
    status: "noop";
    epoch: number;
    reason: "empty" | "out-of-bounds" | "incomplete-data" | "read-only";
};
```

</details>
