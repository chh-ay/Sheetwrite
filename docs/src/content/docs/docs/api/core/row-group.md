---
title: "RowGroup | @sheetwrite/core"
description: "A collapsible row group (data-row range, end-inclusive), Sheets-style."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RowGroup -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

A collapsible row group (data-row range, end-inclusive), Sheets-style.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L60</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="row-group-start" data-pagefind-weight="1">
<summary><code>start</code></summary>
<pre><code>start: number;</code></pre>
</details>

<details class="api-member" id="row-group-end" data-pagefind-weight="1">
<summary><code>end</code></summary>
<pre><code>end: number;</code></pre>
</details>

<details class="api-member" id="row-group-collapsed" data-pagefind-weight="1">
<summary><code>collapsed</code></summary>
<pre><code>collapsed: boolean;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface RowGroup {
    start: number;
    end: number;
    collapsed: boolean;
}
```

</details>
