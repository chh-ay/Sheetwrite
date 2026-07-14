---
title: "ContextMenuItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback row in the right-click menu."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItem -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Built-in, separator, or custom callback row in the right-click menu.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L182</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-item-id" data-pagefind-weight="1">
<summary><code>id</code></summary>
<pre><code>id?: string;</code></pre>
</details>

<details class="api-member" id="context-menu-item-action" data-pagefind-weight="1">
<summary><code>action</code></summary>
<pre><code>action?: ContextMenuActionName;</code></pre>
</details>

<details class="api-member" id="context-menu-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code></summary>
<pre><code>onClick?: (grid: Grid, cell: CellAddress | null) =&gt; void;</code></pre>
</details>

<details class="api-member" id="context-menu-item-label" data-pagefind-weight="1">
<summary><code>label</code></summary>
<pre><code>label?: string;</code></pre>
</details>

<details class="api-member" id="context-menu-item-shortcut" data-pagefind-weight="1">
<summary><code>shortcut</code></summary>
<pre><code>shortcut?: string;</code></pre>
</details>

<details class="api-member" id="context-menu-item-visible" data-pagefind-weight="1">
<summary><code>visible</code></summary>
<pre><code>visible?: boolean | ((context: ContextMenuContext) =&gt; boolean);</code></pre>
</details>

<details class="api-member" id="context-menu-item-disabled" data-pagefind-weight="1">
<summary><code>disabled</code></summary>
<pre><code>disabled?: boolean | ((context: ContextMenuContext) =&gt; boolean);</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ContextMenuItem {
    id?: string;
    action?: ContextMenuActionName;
    onClick?: (grid: Grid, cell: CellAddress | null) => void;
    label?: string;
    shortcut?: string;
    visible?: boolean | ((context: ContextMenuContext) => boolean);
    disabled?: boolean | ((context: ContextMenuContext) => boolean);
}
```

</details>
