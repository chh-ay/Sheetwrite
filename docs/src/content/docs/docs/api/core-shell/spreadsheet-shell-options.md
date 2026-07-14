---
title: "SpreadsheetShellOptions | @sheetwrite/core/shell"
description: "Host elements and feature options used to create a spreadsheet shell."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|SpreadsheetShellOptions -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">interface</span>

Host elements and feature options used to create a spreadsheet shell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/spreadsheet-shell.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="spreadsheet-shell-options-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>
<pre><code>grid: GridOptions;</code></pre>
</details>

<details class="api-member" id="spreadsheet-shell-options-toolbar" data-pagefind-weight="1">
<summary><code>toolbar</code></summary>
<pre><code>toolbar?: readonly ToolbarItem[];</code></pre>
</details>

<details class="api-member" id="spreadsheet-shell-options-on-change" data-pagefind-weight="1">
<summary><code>onChange</code></summary>
<pre><code>onChange?: (event: ChangeEvent) =&gt; void;</code></pre>
</details>

<details class="api-member" id="spreadsheet-shell-options-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code></summary>
<pre><code>onSelectionChange?: (selection: Selection | null) =&gt; void;</code></pre>
</details>

<details class="api-member" id="spreadsheet-shell-options-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code></summary>
<pre><code>onReady?: (grid: Grid) =&gt; void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SpreadsheetShellOptions {
    grid: GridOptions;
    toolbar?: readonly ToolbarItem[];
    onChange?: (event: ChangeEvent) => void;
    onSelectionChange?: (selection: Selection | null) => void;
    onReady?: (grid: Grid) => void;
}
```

</details>
