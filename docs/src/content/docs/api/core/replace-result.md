---
title: "ReplaceResult | @sheetwrite/core"
description: "Replacement count and refreshed search state returned by replace-all."
---
<!-- api-export:@sheetwrite/core|.|ReplaceResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Replacement count and refreshed search state returned by replace-all.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L350</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="replace-result-replaced" data-pagefind-weight="1">
<summary><code>replaced</code> <span class="api-member-summary">How many cells were rewritten.</span></summary>

```ts generated
replaced: number;
```

</details>

<details class="api-member" id="replace-result-result" data-pagefind-weight="1">
<summary><code>result</code> <span class="api-member-summary">Search state after the replacement (matches re-scanned against the new data).</span></summary>

```ts generated
result: SearchResult;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ReplaceResult {
  replaced: number;
  result: SearchResult;
}
```

</details>
