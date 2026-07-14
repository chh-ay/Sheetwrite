---
title: "Sheet | @sheetwrite/core"
description: "Workbook sheet schema used when creating a live grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|Sheet -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Workbook sheet schema used when creating a live grid.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L8</code></dd></div>
</dl>

## Members <span class="api-count">16</span>

<div class="api-member-list">

<details class="api-member" id="sheet-id" data-pagefind-weight="1">
<summary><code>id</code></summary>
<pre><code>id: SheetId;</code></pre>
</details>

<details class="api-member" id="sheet-name" data-pagefind-weight="1">
<summary><code>name</code></summary>
<pre><code>name: string;</code></pre>
</details>

<details class="api-member" id="sheet-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>
<pre><code>columns: Column[];</code></pre>
</details>

<details class="api-member" id="sheet-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>
<pre><code>rowCount: number;</code></pre>
</details>

<details class="api-member" id="sheet-row-heights" data-pagefind-weight="1">
<summary><code>rowHeights</code></summary>
<pre><code>rowHeights?: Map&lt;number, number&gt;;</code></pre>
</details>

<details class="api-member" id="sheet-hidden-rows" data-pagefind-weight="1">
<summary><code>hiddenRows</code></summary>
<pre><code>hiddenRows?: Set&lt;number&gt;;</code></pre>
</details>

<details class="api-member" id="sheet-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code></summary>
<pre><code>rowGroups?: RowGroup[];</code></pre>
</details>

<details class="api-member" id="sheet-conditional-formats" data-pagefind-weight="1">
<summary><code>conditionalFormats</code></summary>
<pre><code>conditionalFormats?: ConditionalFormatRule[];</code></pre>
</details>

<details class="api-member" id="sheet-validation-rules" data-pagefind-weight="1">
<summary><code>validationRules</code></summary>
<pre><code>validationRules?: DataValidationRule[];</code></pre>
</details>

<details class="api-member" id="sheet-protected-ranges" data-pagefind-weight="1">
<summary><code>protectedRanges</code></summary>
<pre><code>protectedRanges?: ProtectedRange[];</code></pre>
</details>

<details class="api-member" id="sheet-notes" data-pagefind-weight="1">
<summary><code>notes</code></summary>
<pre><code>notes?: CellNote[];</code></pre>
</details>

<details class="api-member" id="sheet-sort-keys" data-pagefind-weight="1">
<summary><code>sortKeys</code></summary>
<pre><code>sortKeys?: SortKey[];</code></pre>
</details>

<details class="api-member" id="sheet-filters" data-pagefind-weight="1">
<summary><code>filters</code></summary>
<pre><code>filters?: Array&lt;[col: number, filter: ColumnFilter]&gt;;</code></pre>
</details>

<details class="api-member" id="sheet-merges" data-pagefind-weight="1">
<summary><code>merges</code></summary>
<pre><code>merges?: MergeRange[];</code></pre>
</details>

<details class="api-member" id="sheet-frozen-rows" data-pagefind-weight="1">
<summary><code>frozenRows</code></summary>
<pre><code>frozenRows?: number;</code></pre>
</details>

<details class="api-member" id="sheet-frozen-cols" data-pagefind-weight="1">
<summary><code>frozenCols</code></summary>
<pre><code>frozenCols?: number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface Sheet {
    id: SheetId;
    name: string;
    columns: Column[];
    rowCount: number;
    rowHeights?: Map<number, number>;
    hiddenRows?: Set<number>;
    rowGroups?: RowGroup[];
    conditionalFormats?: ConditionalFormatRule[];
    validationRules?: DataValidationRule[];
    protectedRanges?: ProtectedRange[];
    notes?: CellNote[];
    sortKeys?: SortKey[];
    filters?: Array<[
        col: number,
        filter: ColumnFilter
    ]>;
    merges?: MergeRange[];
    frozenRows?: number;
    frozenCols?: number;
}
```

</details>
