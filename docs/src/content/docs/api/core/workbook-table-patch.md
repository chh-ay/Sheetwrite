---
title: "WorkbookTablePatch | @sheetwrite/core"
description: "Mutable table fields accepted by the explicit update operation."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTablePatch -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Mutable table fields accepted by the explicit update operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/table.ts#L55</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-patch-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="workbook-table-patch-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range?: Range;
```

</details>

<details class="api-member" id="workbook-table-patch-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns?: WorkbookTableColumn[];
```

</details>

<details class="api-member" id="workbook-table-patch-header-row" data-pagefind-weight="1">
<summary><code>headerRow</code></summary>

```ts generated
headerRow?: boolean;
```

</details>

<details class="api-member" id="workbook-table-patch-totals-row" data-pagefind-weight="1">
<summary><code>totalsRow</code></summary>

```ts generated
totalsRow?: boolean;
```

</details>

<details class="api-member" id="workbook-table-patch-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: WorkbookTableStyle | null;
```

</details>

<details class="api-member" id="workbook-table-patch-unsupported-features" data-pagefind-weight="1">
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
export interface WorkbookTablePatch {
  name?: string;
  range?: Range;
  columns?: WorkbookTableColumn[];
  headerRow?: boolean;
  totalsRow?: boolean;
  style?: WorkbookTableStyle | null;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}
```

</details>
