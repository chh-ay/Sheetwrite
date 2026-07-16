---
title: "CellRenderer | @sheetwrite/core"
description: "Custom cell renderer hooks for the main-thread canvas or DOM overlay."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellRenderer -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Custom cell renderer hooks for the main-thread canvas or DOM overlay.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L51</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="cell-renderer-canvas" data-pagefind-weight="1">
<summary><code>canvas</code></summary>

```ts generated
canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
```

</details>

<details class="api-member" id="cell-renderer-dom" data-pagefind-weight="1">
<summary><code>dom</code></summary>

```ts generated
dom?(c: CellPaintContext): HTMLElement;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellRenderer {
    canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
    dom?(c: CellPaintContext): HTMLElement;
}
```

</details>
