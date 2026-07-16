---
title: "ColumnFilter | @sheetwrite/core"
description: "One column's filter predicate."
---
<!-- api-export:@sheetwrite/core|.|ColumnFilter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

One column's filter predicate. All active column filters AND together;
matching is against the cell's resolved value (text or number).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L55</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ kind: "values"; values: readonly CellScalar[] }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "contains"; text: string; matchCase?: boolean }
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "compare";
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number;
}
```

</div>
<div class="api-variant">

```ts generated
{ kind: "empty" }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "nonEmpty" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type ColumnFilter =
  | {
      kind: "values";
      values: readonly CellScalar[];
    }
  | {
      kind: "contains";
      text: string;
      matchCase?: boolean;
    }
  | {
      kind: "compare";
      op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
      value: number;
    }
  | {
      kind: "empty";
    }
  | {
      kind: "nonEmpty";
    };
```

</details>
