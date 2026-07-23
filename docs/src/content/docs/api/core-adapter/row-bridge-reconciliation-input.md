---
title: "RowBridgeReconciliationInput | @sheetwrite/core/adapter"
description: "Input to RowBridge.reconcile."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeReconciliationInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Input to `RowBridge.reconcile`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L177</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-reconciliation-input-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
readonly status: RowBridgeReconciliationStatus;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId?: string;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source?: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
readonly version?: number;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-operations" data-pagefind-weight="1">
<summary><code>operations</code> <span class="api-member-summary">Canonical operations applied by the document engine.</span></summary>

```ts generated
readonly operations?: readonly DocumentOp[];
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-requested-operations" data-pagefind-weight="1">
<summary><code>requestedOperations</code> <span class="api-member-summary">Original host operations, used to identify a transformed acceptance.</span></summary>

```ts generated
readonly requestedOperations?: readonly DocumentOp[];
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-event" data-pagefind-weight="1">
<summary><code>event</code></summary>

```ts generated
readonly event?: ChangeEvent;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>

```ts generated
readonly commitReason?: CommitReason;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-type" data-pagefind-weight="1">
<summary><code>_type</code></summary>

```ts generated
readonly _type?: Id;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeReconciliationInput<
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly status: RowBridgeReconciliationStatus;
  readonly transactionId?: string;
  readonly source?: OperationSource;
  readonly version?: number;
  readonly operations?: readonly DocumentOp[];
  readonly requestedOperations?: readonly DocumentOp[];
  readonly event?: ChangeEvent;
  readonly commitReason?: CommitReason;
  readonly _type?: Id;
}
```

</details>
