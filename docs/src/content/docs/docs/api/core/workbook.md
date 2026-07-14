---
title: "Workbook | @sheetwrite/core"
description: "Live workbook schema containing ordered sheets and the active sheet ID."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|Workbook -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Live workbook schema containing ordered sheets and the active sheet ID.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L67</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="workbook-sheets" data-pagefind-weight="1">
<summary><code>sheets</code></summary>
<pre><code>sheets: Sheet[];</code></pre>
</details>

<details class="api-member" id="workbook-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code></summary>
<pre><code>activeSheet: SheetId;</code></pre>
</details>

<details class="api-member" id="workbook-named-ranges" data-pagefind-weight="1">
<summary><code>namedRanges</code></summary>
<pre><code>namedRanges?: NamedRangeSnapshot[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface Workbook {
    sheets: Sheet[];
    activeSheet: SheetId;
    namedRanges?: NamedRangeSnapshot[];
}
```

</details>
