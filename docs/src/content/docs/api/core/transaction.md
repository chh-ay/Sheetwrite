---
title: "Transaction | @sheetwrite/core"
description: "Low-level Store transaction."
---
<!-- api-export:@sheetwrite/core|.|Transaction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Low-level Store transaction. `epoch` provides optional optimistic
concurrency at the storage boundary.

Calling `Store.applyTransaction` bypasses Grid read-only checks and Grid
undo/redo history. Host-driven edits should use `Grid.applyTransaction`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-patches" data-pagefind-weight="1">
<summary><code>patches</code> <span class="api-member-summary">Ordered document operations submitted as one store commit.</span></summary>

```ts generated
patches: DocumentOp[];
```

</details>

<details class="api-member" id="transaction-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Expected current store epoch; a mismatch returns a conflict without applying patches.</span></summary>

```ts generated
epoch?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Transaction {
  patches: DocumentOp[];
  epoch?: number;
}
```

</details>
