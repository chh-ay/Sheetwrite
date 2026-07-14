---
title: "GridTransaction | @sheetwrite/core"
description: "An undoable transaction submitted through a Grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|GridTransaction -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

An undoable transaction submitted through a Grid.

Grid transactions deliberately have no epoch: optimistic reconciliation is
a low-level Store concern, while Grid commits are normal host-driven edits
that participate in read-only policy and undo/redo history.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L127</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="grid-transaction-patches" data-pagefind-weight="1">
<summary><code>patches</code></summary>
<pre><code>patches: DocumentOp[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridTransaction {
    patches: DocumentOp[];
}
```

</details>
