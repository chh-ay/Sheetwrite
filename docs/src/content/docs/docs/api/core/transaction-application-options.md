---
title: "TransactionApplicationOptions | @sheetwrite/core"
description: "Source and commit classification used when applying a transaction."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|TransactionApplicationOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Source and commit classification used when applying a transaction.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L45</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-application-options-source" data-pagefind-weight="1">
<summary><code>source</code></summary>
<pre><code>source?: OperationSource;</code></pre>
</details>

<details class="api-member" id="transaction-application-options-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>
<pre><code>commitReason?: CommitReason;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface TransactionApplicationOptions {
    source?: OperationSource;
    commitReason?: CommitReason;
}
```

</details>
