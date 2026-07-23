---
title: "RowBridgeOptions | @sheetwrite/core/adapter"
description: "Options for the framework-neutral, opt-in row bridge."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Options for the framework-neutral, opt-in row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-options-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
readonly columns: readonly RowBridgeColumn<Row>[];
```

</details>

<details class="api-member" id="row-bridge-options-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code></summary>

```ts generated
readonly defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="row-bridge-options-get-row-id" data-pagefind-weight="1">
<summary><code>getRowId</code></summary>

```ts generated
readonly getRowId: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="row-bridge-options-sheet" data-pagefind-weight="1">
<summary><code>sheet</code> <span class="api-member-summary">Sheet identity used by the simple data-first adapter.</span></summary>

```ts generated
readonly sheet?: SheetId;
```

<p class="api-member-doc">Sheet identity used by the simple data-first adapter. Defaults to `sheet1`.</p>
</details>

<details class="api-member" id="row-bridge-options-create-row-id" data-pagefind-weight="1">
<summary><code>createRowId</code> <span class="api-member-summary">Optional identity factory for rows created by an addRows operation.</span></summary>

```ts generated
readonly createRowId?: (context: RowBridgeInsertContext) => Id;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly columns: readonly RowBridgeColumn<Row>[];
  readonly defaultRows: readonly Row[];
  readonly getRowId: (row: Row, index: number) => Id;
  readonly sheet?: SheetId;
  readonly createRowId?: (context: RowBridgeInsertContext) => Id;
}
```

</details>
