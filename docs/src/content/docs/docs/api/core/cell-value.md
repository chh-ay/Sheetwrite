---
title: "CellValue | @sheetwrite/core"
description: "A cell's persisted input: a literal, a cross-reference, or a formula."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellValue -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

A cell's persisted input: a literal, a cross-reference, or a formula.
References resolve through the store's reference graph; formulas resolve in
the WASM calculation engine.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L72</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;literal&quot;; value: CellScalar }</code></div>
<div class="api-variant"><code>{ kind: &quot;ref&quot;; target: CellAddress }</code></div>
<div class="api-variant"><code>{ kind: &quot;formula&quot;; src: string }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type CellValue = {
    kind: "literal";
    value: CellScalar;
} | {
    kind: "ref";
    target: CellAddress;
} | {
    kind: "formula";
    src: string;
};
```

</details>
