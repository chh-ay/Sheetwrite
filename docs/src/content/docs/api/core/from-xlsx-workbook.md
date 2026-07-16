---
title: "fromXlsxWorkbook | @sheetwrite/core"
description: "Formula-preserving, multi-sheet workbook import through the optional XLSX backend."
---
<!-- api-export:@sheetwrite/core|.|fromXlsxWorkbook -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Formula-preserving, multi-sheet workbook import through the optional XLSX backend.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L347</code></dd></div>
</dl>

## Declaration

```ts generated
function fromXlsxWorkbook(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot>
```
