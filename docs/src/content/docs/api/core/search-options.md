---
title: "SearchOptions | @sheetwrite/core"
description: "Case, whole-cell, sheet, and column constraints for grid search."
---
<!-- api-export:@sheetwrite/core|.|SearchOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Case, whole-cell, sheet, and column constraints for grid search.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L337</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="search-options-match-case" data-pagefind-weight="1">
<summary><code>matchCase</code> <span class="api-member-summary">Case-sensitive match (default false).</span></summary>

```ts generated
matchCase?: boolean;
```

</details>

<details class="api-member" id="search-options-whole-cell" data-pagefind-weight="1">
<summary><code>wholeCell</code> <span class="api-member-summary">Match only when the whole cell text equals the query (default false: substring).</span></summary>

```ts generated
wholeCell?: boolean;
```

</details>

<details class="api-member" id="search-options-sheet" data-pagefind-weight="1">
<summary><code>sheet</code> <span class="api-member-summary">Restrict to a sheet (defaults to the active sheet).</span></summary>

```ts generated
sheet?: SheetId;
```

</details>

<details class="api-member" id="search-options-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Restrict to these column indices (defaults to all columns).</span></summary>

```ts generated
columns?: number[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SearchOptions {
  matchCase?: boolean;
  wholeCell?: boolean;
  sheet?: SheetId;
  columns?: number[];
}
```

</details>
