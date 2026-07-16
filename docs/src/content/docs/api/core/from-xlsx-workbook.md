---
title: "fromXlsxWorkbook | @sheetwrite/core"
description: "Formula-preserving, multi-sheet workbook import through the optional XLSX backend."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|fromXlsxWorkbook -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Formula-preserving, multi-sheet workbook import through the optional XLSX backend.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L347</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions): Promise<WorkbookSnapshot> => ;
```
