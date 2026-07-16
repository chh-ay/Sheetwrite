---
title: "SheetSnapshot | @sheetwrite/core"
description: "Serializable complete state for one workbook sheet."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SheetSnapshot -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Serializable complete state for one workbook sheet.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L228</code></dd></div>
</dl>

## Members <span class="api-count">17</span>

<div class="api-member-list">

<details class="api-member" id="sheet-snapshot-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: SheetId;
```

</details>

<details class="api-member" id="sheet-snapshot-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheet-snapshot-order" data-pagefind-weight="1">
<summary><code>order</code></summary>

```ts generated
order: number;
```

</details>

<details class="api-member" id="sheet-snapshot-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="sheet-snapshot-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Keys are stable, unique document column identities as well as datasource keys.</span></summary>

```ts generated
columns: Column[];
```

</details>

<details class="api-member" id="sheet-snapshot-frozen-rows" data-pagefind-weight="1">
<summary><code>frozenRows</code></summary>

```ts generated
frozenRows?: number;
```

</details>

<details class="api-member" id="sheet-snapshot-frozen-cols" data-pagefind-weight="1">
<summary><code>frozenCols</code></summary>

```ts generated
frozenCols?: number;
```

</details>

<details class="api-member" id="sheet-snapshot-row-meta" data-pagefind-weight="1">
<summary><code>rowMeta</code></summary>

```ts generated
rowMeta?: Array<[row: number, meta: RowMetadata]>;
```

</details>

<details class="api-member" id="sheet-snapshot-merges" data-pagefind-weight="1">
<summary><code>merges</code></summary>

```ts generated
merges?: MergeRange[];
```

</details>

<details class="api-member" id="sheet-snapshot-conditional-formats" data-pagefind-weight="1">
<summary><code>conditionalFormats</code></summary>

```ts generated
conditionalFormats?: ConditionalFormatRule[];
```

</details>

<details class="api-member" id="sheet-snapshot-validation-rules" data-pagefind-weight="1">
<summary><code>validationRules</code></summary>

```ts generated
validationRules?: DataValidationRule[];
```

</details>

<details class="api-member" id="sheet-snapshot-protected-ranges" data-pagefind-weight="1">
<summary><code>protectedRanges</code></summary>

```ts generated
protectedRanges?: ProtectedRange[];
```

</details>

<details class="api-member" id="sheet-snapshot-notes" data-pagefind-weight="1">
<summary><code>notes</code></summary>

```ts generated
notes?: CellNote[];
```

</details>

<details class="api-member" id="sheet-snapshot-sort-keys" data-pagefind-weight="1">
<summary><code>sortKeys</code></summary>

```ts generated
sortKeys?: SortKey[];
```

</details>

<details class="api-member" id="sheet-snapshot-filters" data-pagefind-weight="1">
<summary><code>filters</code></summary>

```ts generated
filters?: Array<[col: number, filter: ColumnFilter]>;
```

</details>

<details class="api-member" id="sheet-snapshot-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code></summary>

```ts generated
rowGroups?: RowGroup[];
```

</details>

<details class="api-member" id="sheet-snapshot-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>

```ts generated
cells: CellBlock[];
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetSnapshot {
    id: SheetId;
    name: string;
    order: number;
    rowCount: number;
    columns: Column[];
    frozenRows?: number;
    frozenCols?: number;
    rowMeta?: Array<[
        row: number,
        meta: RowMetadata
    ]>;
    merges?: MergeRange[];
    conditionalFormats?: ConditionalFormatRule[];
    validationRules?: DataValidationRule[];
    protectedRanges?: ProtectedRange[];
    notes?: CellNote[];
    sortKeys?: SortKey[];
    filters?: Array<[
        col: number,
        filter: ColumnFilter
    ]>;
    rowGroups?: RowGroup[];
    cells: CellBlock[];
}
```

</details>
