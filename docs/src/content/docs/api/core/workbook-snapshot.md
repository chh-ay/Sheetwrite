---
title: "WorkbookSnapshot | @sheetwrite/core"
description: "Schema-versioned serializable workbook document."
---
<!-- api-export:@sheetwrite/core|.|WorkbookSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Schema-versioned serializable workbook document.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L250</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="workbook-snapshot-schema-version" data-pagefind-weight="1">
<summary><code>schemaVersion</code></summary>

```ts generated
schemaVersion: 1;
```

</details>

<details class="api-member" id="workbook-snapshot-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId?: string;
```

</details>

<details class="api-member" id="workbook-snapshot-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version?: number;
```

</details>

<details class="api-member" id="workbook-snapshot-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>

```ts generated
workbook: { activeSheet: SheetId; namedRanges?: NamedRangeSnapshot[]; };
```

</details>

<details class="api-member" id="workbook-snapshot-sheets" data-pagefind-weight="1">
<summary><code>sheets</code></summary>

```ts generated
sheets: SheetSnapshot[];
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
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
