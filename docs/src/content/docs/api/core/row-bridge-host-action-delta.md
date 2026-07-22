---
title: "RowBridgeHostActionDelta | @sheetwrite/core"
description: "A document operation that needs a host-side action rather than row mutation."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeHostActionDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A document operation that needs a host-side action rather than row mutation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L137</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-host-action-delta-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: "host-action";
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-action" data-pagefind-weight="1">
<summary><code>action</code></summary>

```ts generated
readonly action: | "add-sheet" | "remove-sheet" | "rename-sheet" | "move-sheet" | "set-sheet-visibility";
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-row-ids" data-pagefind-weight="1">
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
export interface RowBridgeHostActionDelta<
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly kind: "host-action";
  readonly action:
    | "add-sheet"
    | "remove-sheet"
    | "rename-sheet"
    | "move-sheet"
    | "set-sheet-visibility";
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
