---
title: "CellAddress | @sheetwrite/core"
description: "Zero-based address of one cell on a stable sheet ID."
---
<!-- api-export:@sheetwrite/core|.|CellAddress -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Zero-based address of one cell on a stable sheet ID.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L8</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="cell-address-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="cell-address-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
row: number;
```

</details>

<details class="api-member" id="cell-address-col" data-pagefind-weight="1">
<summary><code>col</code></summary>

```ts generated
col: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellAddress {
  sheet: SheetId;
  row: number;
  col: number;
}
```

</details>
