---
title: "ToolbarItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback item in the grid toolbar."
---
<!-- api-export:@sheetwrite/core|.|ToolbarItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Built-in, separator, or custom callback item in the grid toolbar.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L132</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="toolbar-item-action" data-pagefind-weight="1">
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>

```ts generated
action?: ToolbarActionName;
```

<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="toolbar-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid handle.</span></summary>

```ts generated
onClick?: (grid: Grid) => void;
```

<p class="api-member-doc">Custom click handler; receives the grid handle. Overrides `action`.</p>
</details>

<details class="api-member" id="toolbar-item-icon" data-pagefind-weight="1">
<summary><code>icon</code> <span class="api-member-summary">Button icon/content. Strings render as plain text; pass a DOM Node or a factory returning one for SVG/HTML icons without using innerHTML.</span></summary>

```ts generated
icon?: ToolbarIcon;
```

</details>

<details class="api-member" id="toolbar-item-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Accessible tooltip.</span></summary>

```ts generated
title?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ToolbarItem {
  action?: ToolbarActionName;
  onClick?: (grid: Grid) => void;
  icon?: ToolbarIcon;
  title?: string;
}
```

</details>
