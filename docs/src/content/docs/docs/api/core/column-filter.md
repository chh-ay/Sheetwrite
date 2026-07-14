---
title: "ColumnFilter | @sheetwrite/core"
description: "One column's filter predicate."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ColumnFilter -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

One column's filter predicate. All active column filters AND together;
matching is against the cell's resolved value (text or number).

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L52</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;values&quot;; values: readonly CellScalar[] }</code></div>
<div class="api-variant"><code>{ kind: &quot;contains&quot;; text: string; matchCase?: boolean }</code></div>
<div class="api-variant"><code>{ kind: &quot;compare&quot;; op: &quot;gt&quot; | &quot;gte&quot; | &quot;lt&quot; | &quot;lte&quot; | &quot;eq&quot; | &quot;neq&quot;; value: number }</code></div>
<div class="api-variant"><code>{ kind: &quot;empty&quot; }</code></div>
<div class="api-variant"><code>{ kind: &quot;nonEmpty&quot; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type ColumnFilter = {
    kind: "values";
    values: readonly CellScalar[];
} | {
    kind: "contains";
    text: string;
    matchCase?: boolean;
} | {
    kind: "compare";
    op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
    value: number;
} | {
    kind: "empty";
} | {
    kind: "nonEmpty";
};
```

</details>
