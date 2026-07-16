---
title: "DataValidationCondition | @sheetwrite/core"
description: "Serializable condition enforced by a data-validation rule."
---
<!-- api-export:@sheetwrite/core|.|DataValidationCondition -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Serializable condition enforced by a data-validation rule.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L97</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ kind: &quot;list&quot;; values: readonly CellScalar[]; allowCustom?: boolean }</code></div>
<div class="api-variant"><code>{ kind: &quot;number&quot;; min?: number; max?: number }</code></div>
<div class="api-variant"><code>{ kind: &quot;date&quot;; min?: number; max?: number }</code></div>
<div class="api-variant"><code>{ kind: &quot;textLength&quot;; min?: number; max?: number }</code></div>
<div class="api-variant"><code>{ kind: &quot;checkbox&quot;; checkedValue?: CellScalar; uncheckedValue?: CellScalar; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataValidationCondition = {
    kind: "list";
    values: readonly CellScalar[];
    allowCustom?: boolean;
} | {
    kind: "number";
    min?: number;
    max?: number;
} | {
    kind: "date";
    min?: number;
    max?: number;
} | {
    kind: "textLength";
    min?: number;
    max?: number;
} | {
    kind: "checkbox";
    checkedValue?: CellScalar;
    uncheckedValue?: CellScalar;
};
```

</details>
