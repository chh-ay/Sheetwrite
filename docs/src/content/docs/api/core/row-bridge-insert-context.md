---
title: "RowBridgeInsertContext | @sheetwrite/core"
description: "Context supplied when a canonical row insertion needs a host identity."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeInsertContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Context supplied when a canonical row insertion needs a host identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-insert-context-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-insert-context-at" data-pagefind-weight="1">
<summary><code>at</code></summary>

```ts generated
readonly at: number;
```

</details>

<details class="api-member" id="row-bridge-insert-context-offset" data-pagefind-weight="1">
<summary><code>offset</code></summary>

```ts generated
readonly offset: number;
```

</details>

<details class="api-member" id="row-bridge-insert-context-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeInsertContext {
  readonly sheet: SheetId;
  readonly at: number;
  readonly offset: number;
  readonly transactionId: string;
}
```

</details>
