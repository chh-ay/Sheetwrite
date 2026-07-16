---
title: "Transaction | @sheetwrite/core"
description: "Low-level Store transaction."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|Transaction -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Low-level Store transaction. `epoch` provides optional optimistic
concurrency at the storage boundary.

Calling `Store.applyTransaction` bypasses Grid read-only checks and Grid
undo/redo history. Host-driven edits should use `Grid.applyTransaction`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-patches" data-pagefind-weight="1">
<summary><code>patches</code> <span class="api-member-summary">Ordered document operations submitted as one store commit.</span></summary>
<pre><code>patches: DocumentOp[];</code></pre>
</details>

<details class="api-member" id="transaction-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Expected current store epoch; a mismatch returns a conflict without applying patches.</span></summary>
<pre><code>epoch?: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface Transaction {
    patches: DocumentOp[];
    epoch?: number;
}
```

</details>
