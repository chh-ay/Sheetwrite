---
title: "ContextMenuContext | @sheetwrite/core"
description: "Cell and viewport coordinates resolved for one bundled context-menu opening."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ContextMenuContext -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Cell and viewport coordinates resolved for one bundled context-menu opening.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L172</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-context-cell" data-pagefind-weight="1">
<summary><code>cell</code></summary>
<pre><code>readonly cell: CellAddress | null;</code></pre>
</details>

<details class="api-member" id="context-menu-context-client-x" data-pagefind-weight="1">
<summary><code>clientX</code></summary>
<pre><code>readonly clientX: number;</code></pre>
</details>

<details class="api-member" id="context-menu-context-client-y" data-pagefind-weight="1">
<summary><code>clientY</code></summary>
<pre><code>readonly clientY: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ContextMenuContext {
    readonly cell: CellAddress | null;
    readonly clientX: number;
    readonly clientY: number;
}
```

</details>
