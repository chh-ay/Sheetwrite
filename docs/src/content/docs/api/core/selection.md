---
title: "Selection | @sheetwrite/core"
description: "Current cell, range, row, column, or multi-range selection."
---
<!-- api-export:@sheetwrite/core|.|Selection -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Current cell, range, row, column, or multi-range selection.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/coordinates.ts#L48</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ kind: "cell"; addr: CellAddress }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "range"; range: Range }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "row"; sheet: SheetId; row: number }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "column"; sheet: SheetId; col: number }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "multi"; ranges: Range[] }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type Selection =
  | {
      kind: "cell";
      addr: CellAddress;
    }
  | {
      kind: "range";
      range: Range;
    }
  | {
      kind: "row";
      sheet: SheetId;
      row: number;
    }
  | {
      kind: "column";
      sheet: SheetId;
      col: number;
    }
  | {
      kind: "multi";
      ranges: Range[];
    };
```

</details>
