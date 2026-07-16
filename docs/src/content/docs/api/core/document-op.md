---
title: "DocumentOp | @sheetwrite/core"
description: "Exhaustive serializable operation union for workbook mutations."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DocumentOp -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Exhaustive serializable operation union for workbook mutations.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L262</code></dd></div>
</dl>

## Variants <span class="api-count">27</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ op: &quot;set&quot;; addr: CellAddress; value: CellValue; style?: CellStyle }</code></div>
<div class="api-variant"><code>{ op: &quot;setRange&quot;; range: Range; cells: SnapshotCell[] }</code></div>
<div class="api-variant"><code>{ op: &quot;setBlock&quot;; range: Range; block: PackedCellBlock }</code></div>
<div class="api-variant"><code>{ op: &quot;setRangeStyle&quot;; range: Range; style: Partial&lt;CellStyle&gt; | null }</code></div>
<div class="api-variant"><code>{ op: &quot;clearRange&quot;; range: Range; contents?: boolean; style?: boolean }</code></div>
<div class="api-variant"><code>{ op: &quot;addRows&quot;; sheet: SheetId; at: number; count: number }</code></div>
<div class="api-variant"><code>{ op: &quot;removeRows&quot;; sheet: SheetId; at: number; count: number }</code></div>
<div class="api-variant"><code>{ op: &quot;moveRows&quot;; sheet: SheetId; from: number; count: number; to: number }</code></div>
<div class="api-variant"><code>{ op: &quot;addColumns&quot;; sheet: SheetId; at: number; columns: Column[] }</code></div>
<div class="api-variant"><code>{ op: &quot;removeColumns&quot;; sheet: SheetId; at: number; count: number }</code></div>
<div class="api-variant"><code>{ op: &quot;moveColumns&quot;; sheet: SheetId; from: number; count: number; to: number }</code></div>
<div class="api-variant"><code>{ op: &quot;setColumn&quot;; sheet: SheetId; col: number; patch: Partial&lt;Column&gt; }</code></div>
<div class="api-variant"><code>{ op: &quot;setRowMeta&quot;; sheet: SheetId; row: number; meta: RowMetadata | null }</code></div>
<div class="api-variant"><code>{ op: &quot;addMerge&quot;; sheet: SheetId; merge: MergeRange }</code></div>
<div class="api-variant"><code>{ op: &quot;removeMerge&quot;; sheet: SheetId; merge: MergeRange }</code></div>
<div class="api-variant"><code>{ op: &quot;addSheet&quot;; sheet: SheetSnapshot }</code></div>
<div class="api-variant"><code>{ op: &quot;removeSheet&quot;; sheet: SheetId }</code></div>
<div class="api-variant"><code>{ op: &quot;renameSheet&quot;; sheet: SheetId; name: string }</code></div>
<div class="api-variant"><code>{ op: &quot;moveSheet&quot;; sheet: SheetId; to: number }</code></div>
<div class="api-variant"><code>{ op: &quot;setSheetMeta&quot;; sheet: SheetId; patch: { frozenRows?: number; frozenCols?: number; conditionalFormats?: ConditionalFormatRule[]; rowGroups?: RowGroup[]; sortKeys?: SortKey[]; filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;; }; }</code></div>
<div class="api-variant"><code>{ op: &quot;setValidationRule&quot;; sheet: SheetId; rule: DataValidationRule }</code></div>
<div class="api-variant"><code>{ op: &quot;removeValidationRule&quot;; sheet: SheetId; id: string }</code></div>
<div class="api-variant"><code>{ op: &quot;setProtectedRange&quot;; sheet: SheetId; protectedRange: ProtectedRange }</code></div>
<div class="api-variant"><code>{ op: &quot;removeProtectedRange&quot;; sheet: SheetId; id: string }</code></div>
<div class="api-variant"><code>{ op: &quot;setNote&quot;; addr: CellAddress; text: string | null }</code></div>
<div class="api-variant"><code>{ op: &quot;setNamedRange&quot;; namedRange: NamedRangeSnapshot }</code></div>
<div class="api-variant"><code>{ op: &quot;removeNamedRange&quot;; name: string; scope?: SheetId }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type DocumentOp = {
    op: "set";
    addr: CellAddress;
    value: CellValue;
    style?: CellStyle;
} | {
    op: "setRange";
    range: Range;
    cells: SnapshotCell[];
} | {
    op: "setBlock";
    range: Range;
    block: PackedCellBlock;
} | {
    op: "setRangeStyle";
    range: Range;
    style: Partial<CellStyle> | null;
} | {
    op: "clearRange";
    range: Range;
    contents?: boolean;
    style?: boolean;
} | {
    op: "addRows";
    sheet: SheetId;
    at: number;
    count: number;
} | {
    op: "removeRows";
    sheet: SheetId;
    at: number;
    count: number;
} | {
    op: "moveRows";
    sheet: SheetId;
    from: number;
    count: number;
    to: number;
} | {
    op: "addColumns";
    sheet: SheetId;
    at: number;
    columns: Column[];
} | {
    op: "removeColumns";
    sheet: SheetId;
    at: number;
    count: number;
} | {
    op: "moveColumns";
    sheet: SheetId;
    from: number;
    count: number;
    to: number;
} | {
    op: "setColumn";
    sheet: SheetId;
    col: number;
    patch: Partial<Column>;
} | {
    op: "setRowMeta";
    sheet: SheetId;
    row: number;
    meta: RowMetadata | null;
} | {
    op: "addMerge";
    sheet: SheetId;
    merge: MergeRange;
} | {
    op: "removeMerge";
    sheet: SheetId;
    merge: MergeRange;
} | {
    op: "addSheet";
    sheet: SheetSnapshot;
} | {
    op: "removeSheet";
    sheet: SheetId;
} | {
    op: "renameSheet";
    sheet: SheetId;
    name: string;
} | {
    op: "moveSheet";
    sheet: SheetId;
    to: number;
} | {
    op: "setSheetMeta";
    sheet: SheetId;
    patch: {
        frozenRows?: number;
        frozenCols?: number;
        conditionalFormats?: ConditionalFormatRule[];
        rowGroups?: RowGroup[];
        sortKeys?: SortKey[];
        filters?: Array<[
            col: number,
            filter: ColumnFilter
        ]>;
    };
} | {
    op: "setValidationRule";
    sheet: SheetId;
    rule: DataValidationRule;
} | {
    op: "removeValidationRule";
    sheet: SheetId;
    id: string;
} | {
    op: "setProtectedRange";
    sheet: SheetId;
    protectedRange: ProtectedRange;
} | {
    op: "removeProtectedRange";
    sheet: SheetId;
    id: string;
} | {
    op: "setNote";
    addr: CellAddress;
    text: string | null;
} | {
    op: "setNamedRange";
    namedRange: NamedRangeSnapshot;
} | {
    op: "removeNamedRange";
    name: string;
    scope?: SheetId;
};
```

</details>
