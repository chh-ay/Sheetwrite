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
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>
<pre><code>action?: ToolbarActionName;</code></pre>
<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="toolbar-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid handle.</span></summary>
<pre><code>onClick?: (grid: Grid) =&gt; void;</code></pre>
<p class="api-member-doc">Custom click handler; receives the grid handle. Overrides `action`.</p>
</details>

<details class="api-member" id="toolbar-item-icon" data-pagefind-weight="1">
<summary><code>icon</code> <span class="api-member-summary">Button icon/content. Strings render as plain text; pass a DOM Node or a factory returning one for SVG/HTML icons without using innerHTML.</span></summary>
<pre><code>icon?: ToolbarIcon;</code></pre>
<p class="api-member-doc">Button icon/content. Strings render as plain text; pass a DOM `Node` or a
factory returning one for SVG/HTML icons without using `innerHTML`.</p>
</details>

<details class="api-member" id="toolbar-item-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Accessible tooltip.</span></summary>
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
