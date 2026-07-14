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
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L222</code></dd></div>
</dl>

## Members <span class="api-count">17</span>

<div class="api-member-list">

<details class="api-member" id="sheet-snapshot-id" data-pagefind-weight="1">
<summary><code>id</code></summary>
<pre><code>id: SheetId;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-name" data-pagefind-weight="1">
<summary><code>name</code></summary>
<pre><code>name: string;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-order" data-pagefind-weight="1">
<summary><code>order</code></summary>
<pre><code>order: number;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>
<pre><code>rowCount: number;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>
<pre><code>columns: Column[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-frozen-rows" data-pagefind-weight="1">
<summary><code>frozenRows</code></summary>
<pre><code>frozenRows?: number;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-frozen-cols" data-pagefind-weight="1">
<summary><code>frozenCols</code></summary>
<pre><code>frozenCols?: number;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-row-meta" data-pagefind-weight="1">
<summary><code>rowMeta</code></summary>
<pre><code>rowMeta?: Array&lt;[row: number, meta: RowMetadata]&gt;;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-merges" data-pagefind-weight="1">
<summary><code>merges</code></summary>
<pre><code>merges?: MergeRange[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-conditional-formats" data-pagefind-weight="1">
<summary><code>conditionalFormats</code></summary>
<pre><code>conditionalFormats?: ConditionalFormatRule[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-validation-rules" data-pagefind-weight="1">
<summary><code>validationRules</code></summary>
<pre><code>validationRules?: DataValidationRule[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-protected-ranges" data-pagefind-weight="1">
<summary><code>protectedRanges</code></summary>
<pre><code>protectedRanges?: ProtectedRange[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-notes" data-pagefind-weight="1">
<summary><code>notes</code></summary>
<pre><code>notes?: CellNote[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-sort-keys" data-pagefind-weight="1">
<summary><code>sortKeys</code></summary>
<pre><code>sortKeys?: SortKey[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-filters" data-pagefind-weight="1">
<summary><code>filters</code></summary>
<pre><code>filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code></summary>
<pre><code>rowGroups?: RowGroup[];</code></pre>
</details>

<details class="api-member" id="sheet-snapshot-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>
<pre><code>cells: CellBlock[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
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
