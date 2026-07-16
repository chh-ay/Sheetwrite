---
title: "XlsxWorkbookWarning | @sheetwrite/core"
description: "Structured fidelity warning emitted during workbook XLSX conversion."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookWarning -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Structured fidelity warning emitted during workbook XLSX conversion.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L289</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-warning-code" data-pagefind-weight="1">
<summary><code>code</code></summary>
<pre><code>code: | &quot;boolean-literal&quot; | &quot;rich-text&quot; | &quot;hyperlink&quot; | &quot;unsupported-cell-value&quot; | &quot;unsupported-feature&quot;;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-warning-message" data-pagefind-weight="1">
<summary><code>message</code></summary>
<pre><code>message: string;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-warning-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>
<pre><code>sheet?: string;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-warning-cell" data-pagefind-weight="1">
<summary><code>cell</code></summary>
<pre><code>cell?: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface XlsxWorkbookWarning {
    code: "boolean-literal" | "rich-text" | "hyperlink" | "unsupported-cell-value" | "unsupported-feature";
    message: string;
    sheet?: string;
    cell?: string;
}
```

</details>
