---
title: "GridTransaction | @sheetwrite/core"
description: "An undoable transaction submitted through a Grid."
---
<!-- api-export:@sheetwrite/core|.|GridTransaction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

An undoable transaction submitted through a Grid.

Grid transactions deliberately have no epoch: optimistic reconciliation is
a low-level Store concern, while Grid commits are normal host-driven edits
that participate in read-only policy and undo/redo history.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L146</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="grid-transaction-patches" data-pagefind-weight="1">
<summary><code>patches</code></summary>

```ts generated
patches: DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridTransaction {
  patches: DocumentOp[];
}
```

</details>
