---
title: "Theme | @sheetwrite/core"
description: "Resolved canvas colors, typography, and geometry used for painting."
---
<!-- api-export:@sheetwrite/core|.|Theme -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resolved canvas colors, typography, and geometry used for painting.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L8</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>14</span>

<div class="api-member-list">

<details class="api-member" id="theme-font" data-pagefind-weight="1">
<summary><code>font</code> <span class="api-member-summary">Canvas font shorthand used for unstyled cells.</span></summary>

```ts generated
font: string;
```

</details>

<details class="api-member" id="theme-bg" data-pagefind-weight="1">
<summary><code>bg</code> <span class="api-member-summary">CSS color painted behind body cells.</span></summary>

```ts generated
bg: string;
```

</details>

<details class="api-member" id="theme-fg" data-pagefind-weight="1">
<summary><code>fg</code> <span class="api-member-summary">CSS color used for unstyled cell text.</span></summary>

```ts generated
fg: string;
```

</details>

<details class="api-member" id="theme-grid-line" data-pagefind-weight="1">
<summary><code>gridLine</code> <span class="api-member-summary">CSS color used for cell grid lines.</span></summary>

```ts generated
gridLine: string;
```

</details>

<details class="api-member" id="theme-header-bg" data-pagefind-weight="1">
<summary><code>headerBg</code> <span class="api-member-summary">CSS color painted behind column and row headers.</span></summary>

```ts generated
headerBg: string;
```

</details>

<details class="api-member" id="theme-header-fg" data-pagefind-weight="1">
<summary><code>headerFg</code> <span class="api-member-summary">CSS color used for column letters and row numbers.</span></summary>

```ts generated
headerFg: string;
```

</details>

<details class="api-member" id="theme-selection" data-pagefind-weight="1">
<summary><code>selection</code> <span class="api-member-summary">CSS color painted over the selected region.</span></summary>

```ts generated
selection: string;
```

</details>

<details class="api-member" id="theme-selection-border" data-pagefind-weight="1">
<summary><code>selectionBorder</code> <span class="api-member-summary">CSS color used for the active selection outline.</span></summary>

```ts generated
selectionBorder: string;
```

</details>

<details class="api-member" id="theme-row-height" data-pagefind-weight="1">
<summary><code>rowHeight</code> <span class="api-member-summary">Default data-row height in unzoomed CSS pixels.</span></summary>

```ts generated
rowHeight: number;
```

</details>

<details class="api-member" id="theme-header-height" data-pagefind-weight="1">
<summary><code>headerHeight</code> <span class="api-member-summary">Column-header height in unzoomed CSS pixels.</span></summary>

```ts generated
headerHeight: number;
```

</details>

<details class="api-member" id="theme-row-header-width" data-pagefind-weight="1">
<summary><code>rowHeaderWidth</code> <span class="api-member-summary">Width of the left row-number gutter (0 hides it).</span></summary>

```ts generated
rowHeaderWidth: number;
```

</details>

<details class="api-member" id="theme-search-match" data-pagefind-weight="1">
<summary><code>searchMatch</code> <span class="api-member-summary">Fill behind a search match.</span></summary>

```ts generated
searchMatch: string;
```

</details>

<details class="api-member" id="theme-search-active-match" data-pagefind-weight="1">
<summary><code>searchActiveMatch</code> <span class="api-member-summary">Fill/outline for the active (current) search match.</span></summary>

```ts generated
searchActiveMatch: string;
```

</details>

<details class="api-member" id="theme-highlight" data-pagefind-weight="1">
<summary><code>highlight</code> <span class="api-member-summary">Fill for cells highlighted via Grid.highlightCells.</span></summary>

```ts generated
highlight: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Theme {
  font: string;
  bg: string;
  fg: string;
  gridLine: string;
  headerBg: string;
  headerFg: string;
  selection: string;
  selectionBorder: string;
  rowHeight: number;
  headerHeight: number;
  rowHeaderWidth: number;
  searchMatch: string;
  searchActiveMatch: string;
  highlight: string;
}
```

</details>
