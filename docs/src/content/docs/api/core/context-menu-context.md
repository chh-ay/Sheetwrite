---
title: "ContextMenuContext | @sheetwrite/core"
description: "Cell and viewport coordinates resolved for one bundled context-menu opening."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cell and viewport coordinates resolved for one bundled context-menu opening.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L172</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-context-cell" data-pagefind-weight="1">
<summary><code>cell</code> <span class="api-member-summary">Right-clicked cell, or null when the pointer is outside the cell body.</span></summary>

```ts generated
readonly cell: CellAddress | null;
```

</details>

<details class="api-member" id="context-menu-context-client-x" data-pagefind-weight="1">
<summary><code>clientX</code> <span class="api-member-summary">Viewport-relative browser pointer coordinate.</span></summary>

```ts generated
readonly clientX: number;
```

</details>

<details class="api-member" id="context-menu-context-client-y" data-pagefind-weight="1">
<summary><code>clientY</code> <span class="api-member-summary">Viewport-relative browser pointer coordinate.</span></summary>

```ts generated
readonly clientY: number;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ContextMenuContext {
  readonly cell: CellAddress | null;
  readonly clientX: number;
  readonly clientY: number;
}
```

</details>
