---
title: "SortKey | @sheetwrite/core"
description: "One key of a multi-column sort, applied in array order (first = primary)."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SortKey -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

One key of a multi-column sort, applied in array order (first = primary).

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L43</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="sort-key-col" data-pagefind-weight="1">
<summary><code>col</code></summary>
<pre><code>col: number;</code></pre>
</details>

<details class="api-member" id="sort-key-ascending" data-pagefind-weight="1">
<summary><code>ascending</code></summary>
<pre><code>ascending: boolean;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SortKey {
    col: number;
    ascending: boolean;
}
```

</details>
