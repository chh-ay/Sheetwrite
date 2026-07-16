---
title: "XlsxWorkbookOptions | @sheetwrite/core"
description: "Workbook XLSX conversion options passed to the registered backend."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Workbook XLSX conversion options passed to the registered backend.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L302</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-options-signal" data-pagefind-weight="1">
<summary><code>signal</code> <span class="api-member-summary">Abort before or between workbook model operations.</span></summary>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="xlsx-workbook-options-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code> <span class="api-member-summary">Maximum populated cells accepted by the in-memory ExcelJS document model.</span></summary>

```ts generated
maxCells?: number;
```

<p class="api-member-doc">Maximum populated cells accepted by the in-memory ExcelJS document model.
Defaults to 1,000,000. Use a lower host-specific bound for constrained
browsers; table APIs remain available for larger streaming interchange.</p>
</details>

<details class="api-member" id="xlsx-workbook-options-on-warning" data-pagefind-weight="1">
<summary><code>onWarning</code></summary>

```ts generated
onWarning?: (warning: XlsxWorkbookWarning) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookOptions {
    signal?: AbortSignal;
    maxCells?: number;
    onWarning?: (warning: XlsxWorkbookWarning) => void;
}
```

</details>
