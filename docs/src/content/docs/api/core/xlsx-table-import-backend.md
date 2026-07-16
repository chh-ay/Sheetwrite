---
title: "XlsxTableImportBackend | @sheetwrite/core"
description: "Pluggable table import backend."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|XlsxTableImportBackend -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Pluggable table import backend. Parses raw `.xlsx` bytes into the same
`ColumnarData` shape `fromCsv` returns, so host ingestion code can stay
format-agnostic.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L263</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-import-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-table-import-backend-from-xlsx-table" data-pagefind-weight="1">
<summary><code>fromXlsxTable</code></summary>

```ts generated
fromXlsxTable(data: ArrayBuffer | Uint8Array): Promise<ColumnarData>;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxTableImportBackend {
    name: string;
    fromXlsxTable(data: ArrayBuffer | Uint8Array): Promise<ColumnarData>;
}
```

</details>
