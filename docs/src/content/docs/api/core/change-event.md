---
title: "ChangeEvent | @sheetwrite/core"
description: "Payload of the change event; flows OUT for API submission/reconcile."
---
<!-- api-export:@sheetwrite/core|.|ChangeEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Payload of the `change` event; flows OUT for API submission/reconcile.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L156</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="change-event-transaction" data-pagefind-weight="1">
<summary><code>transaction</code> <span class="api-member-summary">Operations that actually committed after policy and bounds filtering.</span></summary>

```ts generated
transaction: Transaction;
```

</details>

<details class="api-member" id="change-event-changes" data-pagefind-weight="1">
<summary><code>changes</code> <span class="api-member-summary">Cell-level before/after effects; empty for commits that only change metadata.</span></summary>

```ts generated
changes: CellChange[];
```

</details>

<details class="api-member" id="change-event-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code> <span class="api-member-summary">What produced this commit — see <code>CommitReason</code>.</span></summary>

```ts generated
commitReason: CommitReason;
```

</details>

<details class="api-member" id="change-event-source" data-pagefind-weight="1">
<summary><code>source</code> <span class="api-member-summary">Remote input is observable but never belongs in outgoing local persistence.</span></summary>

```ts generated
source: OperationSource;
```

</details>

<details class="api-member" id="change-event-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Store epoch after the commit; emitted store and grid changes include it.</span></summary>

```ts generated
epoch?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChangeEvent {
  transaction: Transaction;
  changes: CellChange[];
  commitReason: CommitReason;
  source: OperationSource;
  epoch?: number;
}
```

</details>
