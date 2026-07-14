---
title: "ToolbarItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback item in the grid toolbar."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ToolbarItem -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Built-in, separator, or custom callback item in the grid toolbar.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L132</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="toolbar-item-action" data-pagefind-weight="1">
<summary><code>action</code></summary>
<pre><code>action?: ToolbarActionName;</code></pre>
</details>

<details class="api-member" id="toolbar-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code></summary>
<pre><code>onClick?: (grid: Grid) =&gt; void;</code></pre>
</details>

<details class="api-member" id="toolbar-item-icon" data-pagefind-weight="1">
<summary><code>icon</code></summary>
<pre><code>icon?: ToolbarIcon;</code></pre>
</details>

<details class="api-member" id="toolbar-item-title" data-pagefind-weight="1">
<summary><code>title</code></summary>
<pre><code>title?: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ToolbarItem {
    action?: ToolbarActionName;
    onClick?: (grid: Grid) => void;
    icon?: ToolbarIcon;
    title?: string;
}
```

</details>
