---
title: "Selection | @sheetwrite/core"
description: "Current cell, range, row, column, or multi-range selection."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|Selection -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Current cell, range, row, column, or multi-range selection.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L48</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;cell&quot;; addr: CellAddress; }</code></div>
<div class="api-variant"><code>{ kind: &quot;range&quot;; range: Range; }</code></div>
<div class="api-variant"><code>{ kind: &quot;row&quot;; sheet: SheetId; row: number; }</code></div>
<div class="api-variant"><code>{ kind: &quot;column&quot;; sheet: SheetId; col: number; }</code></div>
<div class="api-variant"><code>{ kind: &quot;multi&quot;; ranges: Range[]; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type Selection = {
    kind: "cell";
    addr: CellAddress;
} | {
    kind: "range";
    range: Range;
} | {
    kind: "row";
    sheet: SheetId;
    row: number;
} | {
    kind: "column";
    sheet: SheetId;
    col: number;
} | {
    kind: "multi";
    ranges: Range[];
};
```

</details>
