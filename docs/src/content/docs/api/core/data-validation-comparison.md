---
title: "DataValidationComparison | @sheetwrite/core"
description: "Native comparison semantics for numeric, date-serial, and text-length validation."
---
<!-- api-export:@sheetwrite/core|.|DataValidationComparison -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Native comparison semantics for numeric, date-serial, and text-length validation.
Interval operands are inclusive; `notBetween` accepts values outside that interval.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L139</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  operator: "between" | "notBetween";
  min: number;
  max: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  operator:
    | "equal"
    | "notEqual"
    | "greaterThan"
    | "lessThan"
    | "greaterThanOrEqual"
    | "lessThanOrEqual";
  value: number;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataValidationComparison =
  | {
      operator: "between" | "notBetween";
      min: number;
      max: number;
    }
  | {
      operator:
        | "equal"
        | "notEqual"
        | "greaterThan"
        | "lessThan"
        | "greaterThanOrEqual"
        | "lessThanOrEqual";
      value: number;
    };
```

</details>
