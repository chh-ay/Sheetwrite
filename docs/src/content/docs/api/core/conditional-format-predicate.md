---
title: "ConditionalFormatPredicate | @sheetwrite/core"
description: "Predicate used to decide whether a conditional format applies."
---
<!-- api-export:@sheetwrite/core|.|ConditionalFormatPredicate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Predicate used to decide whether a conditional format applies.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L51</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant">

```ts generated
{ kind: "greaterThan"; value: number }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "lessThan"; value: number }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "equal"; value: CellScalar }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "contains"; text: string; matchCase?: boolean }
```

</div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type ConditionalFormatPredicate =
  | {
      kind: "greaterThan";
      value: number;
    }
  | {
      kind: "lessThan";
      value: number;
    }
  | {
      kind: "equal";
      value: CellScalar;
    }
  | {
      kind: "contains";
      text: string;
      matchCase?: boolean;
    };
```

</details>
