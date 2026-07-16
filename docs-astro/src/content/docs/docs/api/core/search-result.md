---
title: "SearchResult | @sheetwrite/core"
description: "Ordered matches and active index produced by a grid search."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SearchResult -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Ordered matches and active index produced by a grid search.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L310</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="search-result-query" data-pagefind-weight="1">
<summary><code>query</code> <span class="api-member-summary">Query string retained for navigation and subsequent replacement.</span></summary>
<pre><code>query: string;</code></pre>
</details>

<details class="api-member" id="search-result-matches" data-pagefind-weight="1">
<summary><code>matches</code> <span class="api-member-summary">Matching cells in row-major order.</span></summary>
<pre><code>matches: CellAddress[];</code></pre>
</details>

<details class="api-member" id="search-result-active" data-pagefind-weight="1">
<summary><code>active</code> <span class="api-member-summary">Index of the active match within matches, or -1 when there are none.</span></summary>
<pre><code>active: number;</code></pre>
<p class="api-member-doc">Index of the active match within `matches`, or -1 when there are none.</p>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SearchResult {
    query: string;
    matches: CellAddress[];
    active: number;
}
```

</details>
