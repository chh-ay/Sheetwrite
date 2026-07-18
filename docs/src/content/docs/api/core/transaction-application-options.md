---
title: "TransactionApplicationOptions | @sheetwrite/core"
description: "Source and commit classification used when applying a transaction."
---
<!-- api-export:@sheetwrite/core|.|TransactionApplicationOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Source and commit classification used when applying a transaction.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L59</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TransactionApplicationOptions {
  source?: OperationSource;
  commitReason?: CommitReason;
}
```

</details>
