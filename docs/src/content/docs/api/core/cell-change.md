---
title: "CellChange | @sheetwrite/core"
description: "One committed cell edit, carrying enough to roll back."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellChange -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

One committed cell edit, carrying enough to roll back.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L134</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="cell-change-addr" data-pagefind-weight="1">
<summary><code>addr</code></summary>

```ts generated
addr: CellAddress;
```

</details>

<details class="api-member" id="cell-change-old-value" data-pagefind-weight="1">
<summary><code>oldValue</code></summary>

```ts generated
oldValue: CellValue;
```

</details>

<details class="api-member" id="cell-change-new-value" data-pagefind-weight="1">
<summary><code>newValue</code></summary>

```ts generated
newValue: CellValue;
```

</details>

<details class="api-member" id="cell-change-old-style" data-pagefind-weight="1">
<summary><code>oldStyle</code></summary>

```ts generated
oldStyle?: CellStyle;
```

</details>

<details class="api-member" id="cell-change-new-style" data-pagefind-weight="1">
<summary><code>newStyle</code></summary>

```ts generated
newStyle?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellChange {
    addr: CellAddress;
    oldValue: CellValue;
    newValue: CellValue;
    oldStyle?: CellStyle;
    newStyle?: CellStyle;
}
```

</details>
