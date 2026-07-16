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
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L70</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="workbook-sheets" data-pagefind-weight="1">
<summary><code>sheets</code> <span class="api-member-summary">Sheets in display/tab order.</span></summary>

```ts generated
sheets: Sheet[];
```

</details>

<details class="api-member" id="workbook-active-sheet" data-pagefind-weight="1">
<summary><code>activeSheet</code> <span class="api-member-summary">Active sheet ID and initial tab presented when the grid is created.</span></summary>

```ts generated
activeSheet: SheetId;
```

</details>

<details class="api-member" id="workbook-named-ranges" data-pagefind-weight="1">
<summary><code>namedRanges</code> <span class="api-member-summary">Formula names shared by the workbook or shadowed within a sheet scope.</span></summary>

```ts generated
namedRanges?: NamedRangeSnapshot[];
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Workbook {
    sheets: Sheet[];
    activeSheet: SheetId;
    namedRanges?: NamedRangeSnapshot[];
}
```

</details>
