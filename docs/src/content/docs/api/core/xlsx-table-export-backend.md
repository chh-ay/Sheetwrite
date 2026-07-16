---
title: "XlsxTableExportBackend | @sheetwrite/core"
description: "Pluggable first-row-header, first-sheet table export backend."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|XlsxTableExportBackend -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Pluggable first-row-header, first-sheet table export backend.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L232</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-export-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>
<pre><code>name: string;</code></pre>
</details>

<details class="api-member" id="xlsx-table-export-backend-to-xlsx-table" data-pagefind-weight="1">
<summary><code>toXlsxTable</code></summary>
<pre><code>toXlsxTable(workbook: Workbook, store: Store): Promise&lt;Uint8Array&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface XlsxTableExportBackend {
    name: string;
    toXlsxTable(workbook: Workbook, store: Store): Promise<Uint8Array>;
}
```

</details>
