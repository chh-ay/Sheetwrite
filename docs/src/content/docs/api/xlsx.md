---
title: "@sheetwrite/xlsx"
description: "API reference for @sheetwrite/xlsx."
tableOfContents: false
---
<span class="api-status">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/xlsx`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>7</dd></div>
</dl>

Source entry: `packages/xlsx/src/index.ts`

## Exported symbols

### Functions <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/build-xlsx-model/"><code>buildXlsxModel</code><span>Build the default writer's complete active-sheet model without serializing it.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/register-xlsx-backends/"><code>registerXlsxBackends</code><span>Register all concrete XLSX backends with the backend-neutral core contracts.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/xlsx-style-of/"><code>xlsxStyleOf</code><span>Translate Sheetwrite's style model into write-excel-file cell properties.</span></a>
</div>

### Interfaces <span class="api-count">1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/xlsx-model/"><code>XlsxModel</code><span>Tabular workbook model exchanged with the optional XLSX table backend.</span></a>
</div>

### Variables <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/excel-js-workbook-backend/"><code>excelJsWorkbookBackend</code><span>ExcelJS is intentionally confined to the optional @sheetwrite/xlsx package.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/read-excel-file-table-import-backend/"><code>readExcelFileTableImportBackend</code><span>Default first-sheet table import backend.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/write-excel-file-table-export-backend/"><code>writeExcelFileTableExportBackend</code><span>Default first-sheet table export backend.</span></a>
</div>
