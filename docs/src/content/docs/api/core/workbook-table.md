---
title: "WorkbookTable | @sheetwrite/core"
description: "Serializable canonical workbook table."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable canonical workbook table. Its range includes header/totals rows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/table.ts#L38</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: WorkbookTableId;
```

</details>

<details class="api-member" id="workbook-table-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Workbook-global, case-insensitively unique structured-reference name.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="workbook-table-range" data-pagefind-weight="1">
<summary><code>range</code> <span class="api-member-summary">Inclusive table rectangle on one stable sheet ID.</span></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="workbook-table-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Ordered stable columns; length is exactly the table rectangle width.</span></summary>

```ts generated
columns: WorkbookTableColumn[];
```

</details>

<details class="api-member" id="workbook-table-header-row" data-pagefind-weight="1">
<summary><code>headerRow</code> <span class="api-member-summary">Whether the first range row is the structured-reference header row.</span></summary>

```ts generated
headerRow: boolean;
```

</details>

<details class="api-member" id="workbook-table-totals-row" data-pagefind-weight="1">
<summary><code>totalsRow</code> <span class="api-member-summary">Whether the last range row is the structured-reference totals row.</span></summary>

```ts generated
totalsRow: boolean;
```

</details>

<details class="api-member" id="workbook-table-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: WorkbookTableStyle;
```

</details>

<details class="api-member" id="workbook-table-unsupported-features" data-pagefind-weight="1">
<summary><code>unsupportedFeatures</code></summary>

```ts generated
unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookTable {
  id: WorkbookTableId;
  name: string;
  range: Range;
  columns: WorkbookTableColumn[];
  headerRow: boolean;
  totalsRow: boolean;
  style?: WorkbookTableStyle;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}
```

</details>
