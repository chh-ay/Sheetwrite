---
title: "@sheetwrite/xlsx"
description: "API reference for @sheetwrite/xlsx."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/xlsx`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>7</dd></div>
</dl>

Source entry: `packages/xlsx/src/index.ts`

## Exported symbols

### Functions <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/build-xlsx-model/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>buildXlsxModel</code></span><span class="api-symbol-card__desc">Build the default writer's complete active-sheet model without serializing it.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/register-xlsx-backends/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>registerXlsxBackends</code></span><span class="api-symbol-card__desc">Register all concrete XLSX backends with the backend-neutral core contracts.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/xlsx-style-of/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>xlsxStyleOf</code></span><span class="api-symbol-card__desc">Translate Sheetwrite's style model into write-excel-file cell properties.</span></a>
</div>

### Interfaces <span class="api-count">1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/xlsx-model/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>XlsxModel</code></span><span class="api-symbol-card__desc">Tabular workbook model exchanged with the optional XLSX table backend.</span></a>
</div>

### Variables <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/excel-js-workbook-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>excelJsWorkbookBackend</code></span><span class="api-symbol-card__desc">ExcelJS is intentionally confined to the optional @sheetwrite/xlsx package.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/read-excel-file-table-import-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>readExcelFileTableImportBackend</code></span><span class="api-symbol-card__desc">Default first-sheet table import backend.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/write-excel-file-table-export-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>writeExcelFileTableExportBackend</code></span><span class="api-symbol-card__desc">Default first-sheet table export backend.</span></a>
</div>
