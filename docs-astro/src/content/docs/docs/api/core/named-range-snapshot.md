---
title: "NamedRangeSnapshot | @sheetwrite/core"
description: "Workbook-global or sheet-scoped named range used by formulas and persistence."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|NamedRangeSnapshot -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Workbook-global or sheet-scoped named range used by formulas and persistence.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L87</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="named-range-snapshot-name" data-pagefind-weight="1">
<summary><code>name</code></summary>
<pre><code>name: string;</code></pre>
</details>

<details class="api-member" id="named-range-snapshot-scope" data-pagefind-weight="1">
<summary><code>scope</code> <span class="api-member-summary">Formula-context sheet whose local definition shadows the workbook definition.</span></summary>
<pre><code>scope?: SheetId;</code></pre>
</details>

<details class="api-member" id="named-range-snapshot-range" data-pagefind-weight="1">
<summary><code>range</code></summary>
<pre><code>range: Range;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface NamedRangeSnapshot {
    name: string;
    scope?: SheetId;
    range: Range;
}
```

</details>
