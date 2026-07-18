---
title: "DataValidationCondition | @sheetwrite/core"
description: "Serializable condition enforced by a data-validation rule."
---
<!-- api-export:@sheetwrite/core|.|DataValidationCondition -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Serializable condition enforced by a data-validation rule.

`min` and `max` remain inclusive legacy bounds. Use `comparison` when the
operator itself is significant; comparison and legacy bounds are mutually exclusive.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L124</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  kind: "list";
  values: readonly CellScalar[];
  allowCustom?: boolean;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  comparison?: DataValidationComparison;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "date";
  min?: number;
  max?: number;
  comparison?: DataValidationComparison;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "textLength";
  min?: number;
  max?: number;
  comparison?: DataValidationComparison;
}
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "checkbox";
  checkedValue?: CellScalar;
  uncheckedValue?: CellScalar;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataValidationCondition =
  | {
      kind: "list";
      values: readonly CellScalar[];
      allowCustom?: boolean;
    }
  | {
      kind: "number";
      min?: number;
      max?: number;
      integer?: boolean;
      comparison?: DataValidationComparison;
    }
  | {
      kind: "date";
      min?: number;
      max?: number;
      comparison?: DataValidationComparison;
    }
  | {
      kind: "textLength";
      min?: number;
      max?: number;
      comparison?: DataValidationComparison;
    }
  | {
      kind: "checkbox";
      checkedValue?: CellScalar;
      uncheckedValue?: CellScalar;
    };
```

</details>
