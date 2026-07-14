---
title: "XlsxModel | @sheetwrite/xlsx"
description: "Tabular workbook model exchanged with the optional XLSX table backend."
tableOfContents: false
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModel -->
[← @sheetwrite/xlsx](/docs/api/xlsx/)

<span class="api-status">interface</span>

Tabular workbook model exchanged with the optional XLSX table backend.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/xlsx</code></dd></div>
<div><dt>Source</dt><dd><code>packages/xlsx/src/table-export.ts#L74</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-data" data-pagefind-weight="1">
<summary><code>data</code></summary>
<pre><code>data: SheetData;</code></pre>
</details>

<details class="api-member" id="xlsx-model-options" data-pagefind-weight="1">
<summary><code>options</code></summary>
<pre><code>options: SheetOptions&lt;Blob&gt;;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface XlsxModel {
    data: SheetData;
    options: SheetOptions<Blob>;
}
```

</details>
