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
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L47</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-application-options-source" data-pagefind-weight="1">
<summary><code>source</code> <span class="api-member-summary">Distinguishes host persistence input from local user/API output.</span></summary>

```ts generated
source?: OperationSource;
```

</details>

<details class="api-member" id="transaction-application-options-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code> <span class="api-member-summary">Event classification; defaults to api.</span></summary>

```ts generated
commitReason?: CommitReason;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TransactionApplicationOptions {
    source?: OperationSource;
    commitReason?: CommitReason;
}
```

</details>
