---
title: "QueryCapability | @sheetwrite/core"
description: "Whether a query is complete for the currently loaded datasource pages."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|QueryCapability -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Whether a query is complete for the currently loaded datasource pages.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L103</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ status: &quot;complete&quot; }</code></div>
<div class="api-variant"><code>{ status: &quot;incomplete&quot;; loadedCells: number; totalCells: number }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type QueryCapability = {
    status: "complete";
} | {
    status: "incomplete";
    loadedCells: number;
    totalCells: number;
};
```

</details>
