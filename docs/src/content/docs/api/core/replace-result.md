---
title: "ReplaceResult | @sheetwrite/core"
description: "Replacement count and refreshed search state returned by replace-all."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ReplaceResult -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Replacement count and refreshed search state returned by replace-all.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L320</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="replace-result-replaced" data-pagefind-weight="1">
<summary><code>replaced</code> <span class="api-member-summary">How many cells were rewritten.</span></summary>
<pre><code>replaced: number;</code></pre>
</details>

<details class="api-member" id="replace-result-result" data-pagefind-weight="1">
<summary><code>result</code> <span class="api-member-summary">Search state after the replacement (matches re-scanned against the new data).</span></summary>
<pre><code>result: SearchResult;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ReplaceResult {
    replaced: number;
    result: SearchResult;
}
```

</details>
