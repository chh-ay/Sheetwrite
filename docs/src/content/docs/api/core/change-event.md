---
title: "ChangeEvent | @sheetwrite/core"
description: "Payload of the change event; flows OUT for API submission/reconcile."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ChangeEvent -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Payload of the `change` event; flows OUT for API submission/reconcile.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L143</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="change-event-transaction" data-pagefind-weight="1">
<summary><code>transaction</code> <span class="api-member-summary">Operations that actually committed after policy and bounds filtering.</span></summary>
<pre><code>transaction: Transaction;</code></pre>
</details>

<details class="api-member" id="change-event-changes" data-pagefind-weight="1">
<summary><code>changes</code> <span class="api-member-summary">Cell-level before/after effects; empty for commits that only change metadata.</span></summary>
<pre><code>changes: CellChange[];</code></pre>
</details>

<details class="api-member" id="change-event-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code> <span class="api-member-summary">What produced this commit — see <code>CommitReason</code>.</span></summary>
<pre><code>commitReason: CommitReason;</code></pre>
</details>

<details class="api-member" id="change-event-source" data-pagefind-weight="1">
<summary><code>source</code> <span class="api-member-summary">Remote input is observable but never belongs in outgoing local persistence.</span></summary>
<pre><code>source: OperationSource;</code></pre>
</details>

<details class="api-member" id="change-event-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Store epoch after the commit; emitted store and grid changes include it.</span></summary>
<pre><code>epoch?: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ChangeEvent {
    transaction: Transaction;
    changes: CellChange[];
    commitReason: CommitReason;
    source: OperationSource;
    epoch?: number;
}
```

</details>
