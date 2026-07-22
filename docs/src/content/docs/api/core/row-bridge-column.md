---
title: "RowBridgeColumn | @sheetwrite/core"
description: "Semantic column key accepted by the row bridge."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Semantic column key accepted by the row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L10</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-column-key" data-pagefind-weight="1">
<summary><code>key</code></summary>

```ts generated
readonly key: keyof Row & string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeColumn<Row extends Record<string, CellScalar>> {
  readonly key: keyof Row & string;
}
```

</details>
