---
title: "RowBridgeFillDelta | @sheetwrite/core"
description: "A fill-series transaction effect."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeFillDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A fill-series transaction effect.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L98</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>10</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-fill-delta-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: "fill";
```

</details>

<details class="api-member" id="row-bridge-fill-delta-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
readonly range: Range | null;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>

```ts generated
readonly cells: readonly RowBridgeCell<Id>[];
```

</details>

<details class="api-member" id="row-bridge-fill-delta-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-fill-delta-row-ids" data-pagefind-weight="1">
<summary><code>rowIds</code></summary>

```ts generated
readonly rowIds: readonly (Id | null)[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeFillDelta<Id extends RowBridgeId = RowBridgeId> {
  readonly kind: "fill";
  readonly range: Range | null;
  readonly cells: readonly RowBridgeCell<Id>[];
  readonly transaction: RowBridgeTransaction;
  readonly transactionId: string;
  readonly source: OperationSource;
  readonly previous: unknown;
  readonly next: unknown;
  readonly operation: DocumentOp;
  readonly rowIds: readonly (Id | null)[];
}
```

</details>
