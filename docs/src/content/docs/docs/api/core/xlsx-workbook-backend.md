---
title: "XlsxWorkbookBackend | @sheetwrite/core"
description: "Optional backend contract for complete workbook XLSX interchange."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookBackend -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Optional backend contract for complete workbook XLSX interchange.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L315</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>
<pre><code>name: string;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-backend-to-xlsx-workbook" data-pagefind-weight="1">
<summary><code>toXlsxWorkbook</code></summary>
<pre><code>toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise&lt;Uint8Array&gt;;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-backend-from-xlsx-workbook" data-pagefind-weight="1">
<summary><code>fromXlsxWorkbook</code></summary>
<pre><code>fromXlsxWorkbook( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise&lt;WorkbookSnapshot&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface XlsxWorkbookBackend {
    name: string;
    toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
    fromXlsxWorkbook(data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions): Promise<WorkbookSnapshot>;
}
```

</details>
