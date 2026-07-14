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
<summary><code>signal</code></summary>
<pre><code>signal?: AbortSignal;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-options-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code></summary>
<pre><code>maxCells?: number;</code></pre>
</details>

<details class="api-member" id="xlsx-workbook-options-on-warning" data-pagefind-weight="1">
<summary><code>onWarning</code></summary>
<pre><code>onWarning?: (warning: XlsxWorkbookWarning) =&gt; void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface XlsxWorkbookOptions {
    signal?: AbortSignal;
    maxCells?: number;
    onWarning?: (warning: XlsxWorkbookWarning) => void;
}
```

</details>
