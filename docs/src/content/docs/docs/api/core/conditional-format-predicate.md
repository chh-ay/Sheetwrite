---
title: "ConditionalFormatPredicate | @sheetwrite/core"
description: "Predicate used to decide whether a conditional format applies."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ConditionalFormatPredicate -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Predicate used to decide whether a conditional format applies.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L43</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;greaterThan&quot;; value: number }</code></div>
<div class="api-variant"><code>{ kind: &quot;lessThan&quot;; value: number }</code></div>
<div class="api-variant"><code>{ kind: &quot;equal&quot;; value: CellScalar }</code></div>
<div class="api-variant"><code>{ kind: &quot;contains&quot;; text: string; matchCase?: boolean }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type ConditionalFormatPredicate = {
    kind: "greaterThan";
    value: number;
} | {
    kind: "lessThan";
    value: number;
} | {
    kind: "equal";
    value: CellScalar;
} | {
    kind: "contains";
    text: string;
    matchCase?: boolean;
};
```

</details>
