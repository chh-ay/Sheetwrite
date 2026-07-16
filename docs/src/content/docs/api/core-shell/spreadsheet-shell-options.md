---
title: "SpreadsheetShellOptions | @sheetwrite/core/shell"
description: "Host elements and feature options used to create a spreadsheet shell."
---
<!-- api-export:@sheetwrite/core|./shell|SpreadsheetShellOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Host elements and feature options used to create a spreadsheet shell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/spreadsheet-shell.ts#L22</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="spreadsheet-shell-options-grid" data-pagefind-weight="1">
<summary><code>grid</code> <span class="api-member-summary">Options for the single grid the shell owns.</span></summary>

```ts generated
grid: GridOptions;
```

<p class="api-member-doc">Options for the single grid the shell owns. `initSheetwrite` must already be awaited.</p>
</details>

<details class="api-member" id="spreadsheet-shell-options-toolbar" data-pagefind-weight="1">
<summary><code>toolbar</code> <span class="api-member-summary">Toolbar items (default: the full built-in action set).</span></summary>

```ts generated
toolbar?: readonly ToolbarItem[];
```

</details>

<details class="api-member" id="spreadsheet-shell-options-on-change" data-pagefind-weight="1">
<summary><code>onChange</code> <span class="api-member-summary">Event callbacks forwarded from the owned grid.</span></summary>

```ts generated
onChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="spreadsheet-shell-options-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code></summary>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="spreadsheet-shell-options-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code></summary>

```ts generated
onReady?: (grid: Grid) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SpreadsheetShellOptions {
  grid: GridOptions;
  toolbar?: readonly ToolbarItem[];
  onChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onReady?: (grid: Grid) => void;
}
```

</details>
