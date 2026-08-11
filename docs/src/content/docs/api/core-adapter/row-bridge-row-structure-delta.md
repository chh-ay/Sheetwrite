---
title: "RowBridgeRowStructureDelta | @sheetwrite/core/adapter"
description: "Stable row identity effects for insert, delete, and move operations."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeRowStructureDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Stable row identity effects for insert, delete, and move operations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L105</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>16</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-row-structure-delta-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: "row-structure";
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-action" data-pagefind-weight="1">
<summary><code>action</code></summary>

```ts generated
readonly action: "insert" | "delete" | "move";
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-at" data-pagefind-weight="1">
<summary><code>at</code></summary>

```ts generated
readonly at: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-count" data-pagefind-weight="1">
<summary><code>count</code></summary>

```ts generated
readonly count: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from?: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to?: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-inserted" data-pagefind-weight="1">
<summary><code>inserted</code></summary>

```ts generated
readonly inserted: readonly (Id | null)[];
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-removed" data-pagefind-weight="1">
<summary><code>removed</code></summary>

```ts generated
readonly removed: readonly (Id | null)[];
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-row-ids" data-pagefind-weight="1">
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
export interface RowBridgeRowStructureDelta<
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly kind: "row-structure";
  readonly action: "insert" | "delete" | "move";
  readonly sheet: SheetId;
  readonly at: number;
  readonly count: number;
  readonly from?: number;
  readonly to?: number;
  readonly inserted: readonly (Id | null)[];
  readonly removed: readonly (Id | null)[];
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
