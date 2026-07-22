---
title: "SearchResult | @sheetwrite/core"
description: "Ordered matches and active index produced by a grid search."
---
<!-- api-export:@sheetwrite/core|.|SearchResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Ordered matches and active index produced by a grid search.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L351</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="search-result-query" data-pagefind-weight="1">
<summary><code>query</code> <span class="api-member-summary">Query string retained for navigation and subsequent replacement.</span></summary>

```ts generated
query: string;
```

</details>

<details class="api-member" id="search-result-matches" data-pagefind-weight="1">
<summary><code>matches</code> <span class="api-member-summary">Matching cells in row-major order.</span></summary>

```ts generated
matches: CellAddress[];
```

</details>

<details class="api-member" id="search-result-active" data-pagefind-weight="1">
<summary><code>active</code> <span class="api-member-summary">Index of the active match within matches, or -1 when there are none.</span></summary>

```ts generated
active: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SearchResult {
  query: string;
  matches: CellAddress[];
  active: number;
}
```

</details>
