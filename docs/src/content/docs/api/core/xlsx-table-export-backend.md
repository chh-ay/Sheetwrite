---
title: "XlsxTableExportBackend | @sheetwrite/core"
description: "Pluggable first-row-header, first-sheet table export backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxTableExportBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pluggable first-row-header, first-sheet table export backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L232</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-export-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-table-export-backend-to-xlsx-table" data-pagefind-weight="1">
<summary><code>toXlsxTable</code></summary>

```ts generated
toXlsxTable(workbook: Workbook, store: Store): Promise<Uint8Array>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxTableExportBackend {
  name: string;
  toXlsxTable(workbook: Workbook, store: Store): Promise<Uint8Array>;
}
```

</details>
