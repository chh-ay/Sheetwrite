---
title: "GridConfig | @sheetwrite/core"
description: "Toolbar / feature configuration."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|GridConfig -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Toolbar / feature configuration. When `config` is set the built-in toolbar is
shown; each flag toggles one control (all default to `true`).

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L208</code></dd></div>
</dl>

## Members <span class="api-count">17</span>

<div class="api-member-list">

<details class="api-member" id="grid-config-toolbar" data-pagefind-weight="1">
<summary><code>toolbar</code></summary>
<pre><code>toolbar?: boolean | ToolbarItem[];</code></pre>
</details>

<details class="api-member" id="grid-config-bold" data-pagefind-weight="1">
<summary><code>bold</code></summary>
<pre><code>bold?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-italic" data-pagefind-weight="1">
<summary><code>italic</code></summary>
<pre><code>italic?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-align" data-pagefind-weight="1">
<summary><code>align</code></summary>
<pre><code>align?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-text-color" data-pagefind-weight="1">
<summary><code>textColor</code></summary>
<pre><code>textColor?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-fill-color" data-pagefind-weight="1">
<summary><code>fillColor</code></summary>
<pre><code>fillColor?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-border" data-pagefind-weight="1">
<summary><code>border</code></summary>
<pre><code>border?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-clear-format" data-pagefind-weight="1">
<summary><code>clearFormat</code></summary>
<pre><code>clearFormat?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-merge" data-pagefind-weight="1">
<summary><code>merge</code></summary>
<pre><code>merge?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-sort" data-pagefind-weight="1">
<summary><code>sort</code></summary>
<pre><code>sort?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-export" data-pagefind-weight="1">
<summary><code>export</code></summary>
<pre><code>export?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-icons" data-pagefind-weight="1">
<summary><code>icons</code></summary>
<pre><code>icons?: Partial&lt;Record&lt;ToolbarActionName, ToolbarIcon&gt;&gt;;</code></pre>
</details>

<details class="api-member" id="grid-config-context-menu" data-pagefind-weight="1">
<summary><code>contextMenu</code></summary>
<pre><code>contextMenu?: boolean | ContextMenuItems;</code></pre>
</details>

<details class="api-member" id="grid-config-undo" data-pagefind-weight="1">
<summary><code>undo</code></summary>
<pre><code>undo?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-find" data-pagefind-weight="1">
<summary><code>find</code></summary>
<pre><code>find?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-tabs" data-pagefind-weight="1">
<summary><code>tabs</code></summary>
<pre><code>tabs?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-config-keyboard" data-pagefind-weight="1">
<summary><code>keyboard</code></summary>
<pre><code>keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) =&gt; boolean);</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridConfig {
    toolbar?: boolean | ToolbarItem[];
    bold?: boolean;
    italic?: boolean;
    align?: boolean;
    textColor?: boolean;
    fillColor?: boolean;
    border?: boolean;
    clearFormat?: boolean;
    merge?: boolean;
    sort?: boolean;
    export?: boolean;
    icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
    contextMenu?: boolean | ContextMenuItems;
    undo?: boolean;
    find?: boolean;
    tabs?: boolean;
    keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) => boolean);
}
```

</details>
