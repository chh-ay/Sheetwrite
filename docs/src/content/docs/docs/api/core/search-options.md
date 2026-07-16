---
title: "SearchOptions | @sheetwrite/core"
description: "Case, whole-cell, sheet, and column constraints for grid search."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SearchOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Case, whole-cell, sheet, and column constraints for grid search.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L298</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="search-options-match-case" data-pagefind-weight="1">
<summary><code>matchCase</code> <span class="api-member-summary">Case-sensitive match (default false).</span></summary>
<pre><code>matchCase?: boolean;</code></pre>
</details>

<details class="api-member" id="search-options-whole-cell" data-pagefind-weight="1">
<summary><code>wholeCell</code> <span class="api-member-summary">Match only when the whole cell text equals the query (default false: substring).</span></summary>
<pre><code>wholeCell?: boolean;</code></pre>
</details>

<details class="api-member" id="search-options-sheet" data-pagefind-weight="1">
<summary><code>sheet</code> <span class="api-member-summary">Restrict to a sheet (defaults to the active sheet).</span></summary>
<pre><code>sheet?: SheetId;</code></pre>
</details>

<details class="api-member" id="search-options-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Restrict to these column indices (defaults to all columns).</span></summary>
<pre><code>columns?: number[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SearchOptions {
    matchCase?: boolean;
    wholeCell?: boolean;
    sheet?: SheetId;
    columns?: number[];
}
```

</details>
