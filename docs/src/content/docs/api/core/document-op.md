---
title: "DocumentOp | @sheetwrite/core"
description: "Exhaustive serializable operation union for workbook mutations."
---
<!-- api-export:@sheetwrite/core|.|DocumentOp -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Exhaustive serializable operation union for workbook mutations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L339</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>28</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  op: "set";
  addr: CellAddress;
  value: CellValue;
  style?: CellStyle;
}
```

</div>
<div class="api-variant">

```ts generated
{ op: "setRange"; range: Range; cells: SnapshotCell[] }
```

</div>
<div class="api-variant">

```ts generated
{ op: "setBlock"; range: Range; block: PackedCellBlock }
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setRangeStyle";
  range: Range;
  style: Partial<CellStyle> | null;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "clearRange";
  range: Range;
  contents?: boolean;
  style?: boolean;
}
```

</div>
<div class="api-variant">

```ts generated
{ op: "addRows"; sheet: SheetId; at: number; count: number }
```

</div>
<div class="api-variant">

```ts generated
{
  op: "removeRows";
  sheet: SheetId;
  at: number;
  count: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "moveRows";
  sheet: SheetId;
  from: number;
  count: number;
  to: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "addColumns";
  sheet: SheetId;
  at: number;
  columns: Column[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "removeColumns";
  sheet: SheetId;
  at: number;
  count: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "moveColumns";
  sheet: SheetId;
  from: number;
  count: number;
  to: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setColumn";
  sheet: SheetId;
  col: number;
  patch: Partial<Column>;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setRowMeta";
  sheet: SheetId;
  row: number;
  meta: RowMetadata | null;
}
```

</div>
<div class="api-variant">

```ts generated
{ op: "addMerge"; sheet: SheetId; merge: MergeRange }
```

</div>
<div class="api-variant">

```ts generated
{ op: "removeMerge"; sheet: SheetId; merge: MergeRange }
```

</div>
<div class="api-variant">

```ts generated
{ op: "addSheet"; sheet: SheetSnapshot }
```

</div>
<div class="api-variant">

```ts generated
{ op: "removeSheet"; sheet: SheetId }
```

</div>
<div class="api-variant">

```ts generated
{ op: "renameSheet"; sheet: SheetId; name: string }
```

</div>
<div class="api-variant">

```ts generated
{ op: "moveSheet"; sheet: SheetId; to: number }
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setSheetVisibility";
  sheet: SheetId;
  visibility: SheetVisibility;
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setSheetMeta";
  sheet: SheetId;
  patch: {
    frozenRows?: number;
    frozenCols?: number;
    conditionalFormats?: ConditionalFormatRule[];
    rowGroups?: RowGroup[];
    sortKeys?: SortKey[];
    filters?: Array<[col: number, filter: ColumnFilter]>;
  };
}
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setValidationRule";
  sheet: SheetId;
  rule: DataValidationRule;
}
```

</div>
<div class="api-variant">

```ts generated
{ op: "removeValidationRule"; sheet: SheetId; id: string }
```

</div>
<div class="api-variant">

```ts generated
{
  op: "setProtectedRange";
  sheet: SheetId;
  protectedRange: ProtectedRange;
}
```

</div>
<div class="api-variant">

```ts generated
{ op: "removeProtectedRange"; sheet: SheetId; id: string }
```

</div>
<div class="api-variant">

```ts generated
{ op: "setNote"; addr: CellAddress; text: string | null }
```

</div>
<div class="api-variant">

```ts generated
{ op: "setNamedRange"; namedRange: NamedRangeSnapshot }
```

</div>
<div class="api-variant">

```ts generated
{ op: "removeNamedRange"; name: string; scope?: SheetId }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DocumentOp =
  | {
      op: "set";
      addr: CellAddress;
      value: CellValue;
      style?: CellStyle;
    }
  | {
      op: "setRange";
      range: Range;
      cells: SnapshotCell[];
    }
  | {
      op: "setBlock";
      range: Range;
      block: PackedCellBlock;
    }
  | {
      op: "setRangeStyle";
      range: Range;
      style: Partial<CellStyle> | null;
    }
  | {
      op: "clearRange";
      range: Range;
      contents?: boolean;
      style?: boolean;
    }
  | {
      op: "addRows";
      sheet: SheetId;
      at: number;
      count: number;
    }
  | {
      op: "removeRows";
      sheet: SheetId;
      at: number;
      count: number;
    }
  | {
      op: "moveRows";
      sheet: SheetId;
      from: number;
      count: number;
      to: number;
    }
  | {
      op: "addColumns";
      sheet: SheetId;
      at: number;
      columns: Column[];
    }
  | {
      op: "removeColumns";
      sheet: SheetId;
      at: number;
      count: number;
    }
  | {
      op: "moveColumns";
      sheet: SheetId;
      from: number;
      count: number;
      to: number;
    }
  | {
      op: "setColumn";
      sheet: SheetId;
      col: number;
      patch: Partial<Column>;
    }
  | {
      op: "setRowMeta";
      sheet: SheetId;
      row: number;
      meta: RowMetadata | null;
    }
  | {
      op: "addMerge";
      sheet: SheetId;
      merge: MergeRange;
    }
  | {
      op: "removeMerge";
      sheet: SheetId;
      merge: MergeRange;
    }
  | {
      op: "addSheet";
      sheet: SheetSnapshot;
    }
  | {
      op: "removeSheet";
      sheet: SheetId;
    }
  | {
      op: "renameSheet";
      sheet: SheetId;
      name: string;
    }
  | {
      op: "moveSheet";
      sheet: SheetId;
      to: number;
    }
  | {
      op: "setSheetVisibility";
      sheet: SheetId;
      visibility: SheetVisibility;
    }
  | {
      op: "setSheetMeta";
      sheet: SheetId;
      patch: {
        frozenRows?: number;
        frozenCols?: number;
        conditionalFormats?: ConditionalFormatRule[];
        rowGroups?: RowGroup[];
        sortKeys?: SortKey[];
        filters?: Array<[col: number, filter: ColumnFilter]>;
      };
    }
  | {
      op: "setValidationRule";
      sheet: SheetId;
      rule: DataValidationRule;
    }
  | {
      op: "removeValidationRule";
      sheet: SheetId;
      id: string;
    }
  | {
      op: "setProtectedRange";
      sheet: SheetId;
      protectedRange: ProtectedRange;
    }
  | {
      op: "removeProtectedRange";
      sheet: SheetId;
      id: string;
    }
  | {
      op: "setNote";
      addr: CellAddress;
      text: string | null;
    }
  | {
      op: "setNamedRange";
      namedRange: NamedRangeSnapshot;
    }
  | {
      op: "removeNamedRange";
      name: string;
      scope?: SheetId;
    };
```

</details>
