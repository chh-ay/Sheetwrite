---
title: "RowBridgeCell | @sheetwrite/core/adapter"
description: "A cell effect with semantic column and host row identity."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

A cell effect with semantic column and host row identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L37</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-cell-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-cell-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
readonly row: number;
```

</details>

<details class="api-member" id="row-bridge-cell-row-id" data-pagefind-weight="1">
<summary><code>rowId</code></summary>

```ts generated
readonly rowId: Id | null;
```

</details>

<details class="api-member" id="row-bridge-cell-col" data-pagefind-weight="1">
<summary><code>col</code></summary>

```ts generated
readonly col: number;
```

</details>

<details class="api-member" id="row-bridge-cell-column-key" data-pagefind-weight="1">
<summary><code>columnKey</code></summary>

```ts generated
readonly columnKey: string | null;
```

</details>

<details class="api-member" id="row-bridge-cell-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: CellValue | undefined;
```

</details>

<details class="api-member" id="row-bridge-cell-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: CellValue | undefined;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeCell<Id extends RowBridgeId = RowBridgeId> {
  readonly sheet: SheetId;
  readonly row: number;
  readonly rowId: Id | null;
  readonly col: number;
  readonly columnKey: string | null;
  readonly previous: CellValue | undefined;
  readonly next: CellValue | undefined;
}
```

</details>
