---
title: "XlsxWorkbookBackend | @sheetwrite/core"
description: "Optional backend contract for complete workbook XLSX interchange."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Optional backend contract for complete workbook XLSX interchange.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L315</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-workbook-backend-to-xlsx-workbook" data-pagefind-weight="1">
<summary><code>toXlsxWorkbook</code></summary>

```ts generated
toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
```

</details>

<details class="api-member" id="xlsx-workbook-backend-from-xlsx-workbook" data-pagefind-weight="1">
<summary><code>fromXlsxWorkbook</code></summary>

```ts generated
fromXlsxWorkbook( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise<WorkbookSnapshot>;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookBackend {
    name: string;
    toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
    fromXlsxWorkbook(data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions): Promise<WorkbookSnapshot>;
}
```

</details>
