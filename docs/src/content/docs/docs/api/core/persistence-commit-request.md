---
title: "PersistenceCommitRequest | @sheetwrite/core"
description: "Cancellable pending commit submitted to a persistence adapter."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PersistenceCommitRequest -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Cancellable pending commit submitted to a persistence adapter.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L88</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="persistence-commit-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>
<pre><code>signal?: AbortSignal;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface PersistenceCommitRequest extends PendingCommit {
    signal?: AbortSignal;
}
```

</details>
