---
title: "ContextMenuItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback row in the right-click menu."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Built-in, separator, or custom callback row in the right-click menu.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L252</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-item-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable host identifier, exposed as data-context-menu-item.</span></summary>

```ts generated
id?: string;
```

</details>

<details class="api-member" id="context-menu-item-action" data-pagefind-weight="1">
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>

```ts generated
action?: ContextMenuActionName;
```

<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="context-menu-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid and the right-clicked cell (null if none).</span></summary>

```ts generated
onClick?: (grid: Grid, cell: CellAddress | null) => void;
```

</details>

<details class="api-member" id="context-menu-item-label" data-pagefind-weight="1">
<summary><code>label</code> <span class="api-member-summary">Menu row text. Defaults per action.</span></summary>

```ts generated
label?: string;
```

</details>

<details class="api-member" id="context-menu-item-shortcut" data-pagefind-weight="1">
<summary><code>shortcut</code> <span class="api-member-summary">Optional shortcut hint rendered beside the label.</span></summary>

```ts generated
shortcut?: string;
```

</details>

<details class="api-member" id="context-menu-item-visible" data-pagefind-weight="1">
<summary><code>visible</code> <span class="api-member-summary">Static or request-aware visibility.</span></summary>

```ts generated
visible?: boolean | ((context: ContextMenuContext) => boolean);
```

<p class="api-member-doc">Static or request-aware visibility. Hidden separators are normalized.</p>
</details>

<details class="api-member" id="context-menu-item-disabled" data-pagefind-weight="1">
<summary><code>disabled</code> <span class="api-member-summary">Static or context-aware disabled state.</span></summary>

```ts generated
disabled?: boolean | ((context: ContextMenuContext) => boolean);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
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
