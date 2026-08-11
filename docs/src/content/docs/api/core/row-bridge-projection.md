---
title: "RowBridgeProjection | @sheetwrite/core"
description: "Result of projection or reconciliation."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeProjection -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Result of projection or reconciliation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L191</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-projection-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
readonly status: RowBridgeReconciliationStatus;
```

</details>

<details class="api-member" id="row-bridge-projection-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-projection-deltas" data-pagefind-weight="1">
<summary><code>deltas</code></summary>

```ts generated
readonly deltas: readonly RowBridgeDelta<Id>[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeProjection<Id extends RowBridgeId = RowBridgeId> {
  readonly status: RowBridgeReconciliationStatus;
  readonly transaction: RowBridgeTransaction;
  readonly deltas: readonly RowBridgeDelta<Id>[];
}
```

</details>
