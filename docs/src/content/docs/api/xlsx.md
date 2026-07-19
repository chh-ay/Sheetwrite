---
title: "@sheetwrite/xlsx"
description: "API reference for @sheetwrite/xlsx."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/xlsx`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>7</dd></div>
</dl>

Source entry: `packages/xlsx/src/index.ts`

## Exported symbols

### Functions <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/build-xlsx-model/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>buildXlsxModel</code></span><span class="api-symbol-card__desc">Build the active-sheet table model used by the bounded OOXML writer.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/register-xlsx-backends/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>registerXlsxBackends</code></span><span class="api-symbol-card__desc">Register all concrete XLSX backends with the backend-neutral core contracts.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/xlsx-model/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>XlsxModel</code></span><span class="api-symbol-card__desc">Implementation-neutral first-sheet table export model.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/xlsx-model-cell/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>XlsxModelCell</code></span><span class="api-symbol-card__desc">Implementation-neutral cell in the first-sheet table export model.</span></a>
</div>

### Variables <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/xlsx/sheetwrite-table-export-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>sheetwriteTableExportBackend</code></span><span class="api-symbol-card__desc">Default bounded first-sheet table export backend.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/sheetwrite-table-import-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>sheetwriteTableImportBackend</code></span><span class="api-symbol-card__desc">Default bounded first-sheet table import backend.</span></a>
<a class="api-symbol-card" href="/docs/api/xlsx/sheetwrite-workbook-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>sheetwriteWorkbookBackend</code></span><span class="api-symbol-card__desc">Deterministic optional OOXML workbook backend implemented by Sheetwrite.</span></a>
</div>
