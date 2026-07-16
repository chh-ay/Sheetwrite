---
title: "CellBorder | @sheetwrite/core"
description: "Visual border applied to one or more sides of a cell."
---
<!-- api-export:@sheetwrite/core|.|CellBorder -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Visual border applied to one or more sides of a cell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L10</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="cell-border-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">hex color, e.g. &quot;#111111&quot;</span></summary>

```ts generated
color?: string;
```

</details>

<details class="api-member" id="cell-border-width" data-pagefind-weight="1">
<summary><code>width</code></summary>

```ts generated
width?: number;
```

</details>

<details class="api-member" id="cell-border-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: "solid" | "dashed" | "dotted";
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellBorder {
    color?: string;
    width?: number;
    style?: "solid" | "dashed" | "dotted";
}
```

</details>
