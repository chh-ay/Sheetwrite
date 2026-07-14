---
title: "GridActions | @sheetwrite/core"
description: "Imperative operations the toolbar and context menu bind to; also exposed as Grid.actions."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|GridActions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Imperative operations the toolbar and context menu bind to; also exposed as `Grid.actions`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L64</code></dd></div>
</dl>

## Members <span class="api-count">34</span>

<div class="api-member-list">

<details class="api-member" id="grid-actions-toggle-bold" data-pagefind-weight="1">
<summary><code>toggleBold</code></summary>
<pre><code>toggleBold(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-toggle-italic" data-pagefind-weight="1">
<summary><code>toggleItalic</code></summary>
<pre><code>toggleItalic(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-toggle-underline" data-pagefind-weight="1">
<summary><code>toggleUnderline</code></summary>
<pre><code>toggleUnderline(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-toggle-strikethrough" data-pagefind-weight="1">
<summary><code>toggleStrikethrough</code></summary>
<pre><code>toggleStrikethrough(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-set-align" data-pagefind-weight="1">
<summary><code>setAlign</code></summary>
<pre><code>setAlign(align: CellAlign): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-set-text-color" data-pagefind-weight="1">
<summary><code>setTextColor</code></summary>
<pre><code>setTextColor(color: string): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-set-fill-color" data-pagefind-weight="1">
<summary><code>setFillColor</code></summary>
<pre><code>setFillColor(color: string): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-toggle-border" data-pagefind-weight="1">
<summary><code>toggleBorder</code></summary>
<pre><code>toggleBorder(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-clear-format" data-pagefind-weight="1">
<summary><code>clearFormat</code></summary>
<pre><code>clearFormat(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-merge" data-pagefind-weight="1">
<summary><code>merge</code></summary>
<pre><code>merge(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-unmerge" data-pagefind-weight="1">
<summary><code>unmerge</code></summary>
<pre><code>unmerge(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-sort" data-pagefind-weight="1">
<summary><code>sort</code></summary>
<pre><code>sort(ascending: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-insert-row-above" data-pagefind-weight="1">
<summary><code>insertRowAbove</code></summary>
<pre><code>insertRowAbove(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-insert-row-below" data-pagefind-weight="1">
<summary><code>insertRowBelow</code></summary>
<pre><code>insertRowBelow(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-delete-row" data-pagefind-weight="1">
<summary><code>deleteRow</code></summary>
<pre><code>deleteRow(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-insert-column-left" data-pagefind-weight="1">
<summary><code>insertColumnLeft</code></summary>
<pre><code>insertColumnLeft(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-insert-column-right" data-pagefind-weight="1">
<summary><code>insertColumnRight</code></summary>
<pre><code>insertColumnRight(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-delete-column" data-pagefind-weight="1">
<summary><code>deleteColumn</code></summary>
<pre><code>deleteColumn(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-hide-rows" data-pagefind-weight="1">
<summary><code>hideRows</code></summary>
<pre><code>hideRows(rows?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-show-rows" data-pagefind-weight="1">
<summary><code>showRows</code></summary>
<pre><code>showRows(rows?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-auto-fit-rows" data-pagefind-weight="1">
<summary><code>autoFitRows</code></summary>
<pre><code>autoFitRows(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-hide-columns" data-pagefind-weight="1">
<summary><code>hideColumns</code></summary>
<pre><code>hideColumns(cols?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-show-columns" data-pagefind-weight="1">
<summary><code>showColumns</code></summary>
<pre><code>showColumns(cols?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-auto-fit-columns" data-pagefind-weight="1">
<summary><code>autoFitColumns</code></summary>
<pre><code>autoFitColumns(cols?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-clear-filter" data-pagefind-weight="1">
<summary><code>clearFilter</code></summary>
<pre><code>clearFilter(col?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-copy" data-pagefind-weight="1">
<summary><code>copy</code></summary>
<pre><code>copy(): Promise&lt;ClipboardOutcome&gt;;</code></pre>
</details>

<details class="api-member" id="grid-actions-cut" data-pagefind-weight="1">
<summary><code>cut</code></summary>
<pre><code>cut(): Promise&lt;ClipboardOutcome&gt;;</code></pre>
</details>

<details class="api-member" id="grid-actions-paste" data-pagefind-weight="1">
<summary><code>paste</code></summary>
<pre><code>paste(): Promise&lt;ClipboardOutcome&gt;;</code></pre>
</details>

<details class="api-member" id="grid-actions-paste-values" data-pagefind-weight="1">
<summary><code>pasteValues</code></summary>
<pre><code>pasteValues(): Promise&lt;ClipboardOutcome&gt;;</code></pre>
</details>

<details class="api-member" id="grid-actions-clear-contents" data-pagefind-weight="1">
<summary><code>clearContents</code></summary>
<pre><code>clearContents(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-export-csv" data-pagefind-weight="1">
<summary><code>exportCsv</code></summary>
<pre><code>exportCsv(filename?: string): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-export-xlsx" data-pagefind-weight="1">
<summary><code>exportXlsx</code></summary>
<pre><code>exportXlsx(filename?: string): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-undo" data-pagefind-weight="1">
<summary><code>undo</code></summary>
<pre><code>undo(): void;</code></pre>
</details>

<details class="api-member" id="grid-actions-redo" data-pagefind-weight="1">
<summary><code>redo</code></summary>
<pre><code>redo(): void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridActions {
    toggleBold(): void;
    toggleItalic(): void;
    toggleUnderline(): void;
    toggleStrikethrough(): void;
    setAlign(align: CellAlign): void;
    setTextColor(color: string): void;
    setFillColor(color: string): void;
    toggleBorder(): void;
    clearFormat(): void;
    merge(): void;
    unmerge(): void;
    sort(ascending: boolean): void;
    insertRowAbove(): void;
    insertRowBelow(): void;
    deleteRow(): void;
    insertColumnLeft(): void;
    insertColumnRight(): void;
    deleteColumn(): void;
    hideRows(rows?: readonly number[]): void;
    showRows(rows?: readonly number[]): void;
    autoFitRows(): void;
    hideColumns(cols?: readonly number[]): void;
    showColumns(cols?: readonly number[]): void;
    autoFitColumns(cols?: readonly number[]): void;
    clearFilter(col?: number): void;
    copy(): Promise<ClipboardOutcome>;
    cut(): Promise<ClipboardOutcome>;
    paste(): Promise<ClipboardOutcome>;
    pasteValues(): Promise<ClipboardOutcome>;
    clearContents(): void;
    exportCsv(filename?: string): void;
    exportXlsx(filename?: string): void;
    undo(): void;
    redo(): void;
}
```

</details>
