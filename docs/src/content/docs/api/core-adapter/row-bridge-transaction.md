---
title: "RowBridgeTransaction | @sheetwrite/core/adapter"
description: "The canonical transaction identity carried by each projected delta."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeTransaction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

The canonical transaction identity carried by each projected delta.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L48</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-transaction-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
readonly id: string;
```

</details>

<details class="api-member" id="row-bridge-transaction-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-transaction-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>

```ts generated
readonly commitReason: CommitReason;
```

</details>

<details class="api-member" id="row-bridge-transaction-epoch" data-pagefind-weight="1">
<summary><code>epoch</code></summary>

```ts generated
readonly epoch: number | undefined;
```

</details>

<details class="api-member" id="row-bridge-transaction-patches" data-pagefind-weight="1">
<summary><code>patches</code></summary>

```ts generated
readonly patches: readonly DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeTransaction {
  readonly id: string;
  readonly source: OperationSource;
  readonly commitReason: CommitReason;
  readonly epoch: number | undefined;
  readonly patches: readonly DocumentOp[];
}
```

</details>
