---
title: "PersistenceCommitRequest | @sheetwrite/core"
description: "Cancellable pending commit submitted to a persistence adapter."
---
<!-- api-export:@sheetwrite/core|.|PersistenceCommitRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cancellable pending commit submitted to a persistence adapter.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L88</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="persistence-commit-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PersistenceCommitRequest extends PendingCommit {
  signal?: AbortSignal;
}
```

</details>
