---
title: "toXlsxWorkbook | @sheetwrite/core"
description: "Formula-preserving, multi-sheet workbook export through the optional XLSX backend."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|toXlsxWorkbook -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Formula-preserving, multi-sheet workbook export through the optional XLSX backend.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/export.ts#L338</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(input: WorkbookSnapshot | Pick<Grid, "exportSnapshot">, options?: XlsxWorkbookOptions): Promise<Uint8Array> => ;
```
