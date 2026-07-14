---
title: "WorkbookSnapshot | @sheetwrite/core"
description: "Schema-versioned serializable workbook document."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|WorkbookSnapshot -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Schema-versioned serializable workbook document.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L244</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="workbook-snapshot-schema-version" data-pagefind-weight="1">
<summary><code>schemaVersion</code></summary>
<pre><code>schemaVersion: 1;</code></pre>
</details>

<details class="api-member" id="workbook-snapshot-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>
<pre><code>documentId?: string;</code></pre>
</details>

<details class="api-member" id="workbook-snapshot-version" data-pagefind-weight="1">
<summary><code>version</code></summary>
<pre><code>version?: number;</code></pre>
</details>

<details class="api-member" id="workbook-snapshot-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>
<pre><code>workbook: { activeSheet: SheetId; namedRanges?: NamedRangeSnapshot[]; };</code></pre>
</details>

<details class="api-member" id="workbook-snapshot-sheets" data-pagefind-weight="1">
<summary><code>sheets</code></summary>
<pre><code>sheets: SheetSnapshot[];</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface WorkbookSnapshot {
    schemaVersion: 1;
    documentId?: string;
    version?: number;
    workbook: {
        activeSheet: SheetId;
        namedRanges?: NamedRangeSnapshot[];
    };
    sheets: SheetSnapshot[];
}
```

</details>
