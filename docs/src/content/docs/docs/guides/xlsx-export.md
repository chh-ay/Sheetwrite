---
title: XLSX and export
description: Register the optional XLSX backend and choose table or workbook interchange deliberately.
---

CSV and TSV remain core-only. XLSX is optional so normal grid and framework bundles do not pull spreadsheet-file dependencies into their initial graph.

```sh verify title="Install the optional XLSX backend"
bun add @sheetwrite/xlsx
```

Register it once before invoking grid XLSX actions or the core workbook/table functions:

```ts partial="requires an initialized grid" title="Register and export"
import "@sheetwrite/xlsx/register";

await grid.exportXlsx("sales.xlsx");
```

## Table interchange

`toXlsxTable` and `fromXlsxTable` exchange the active rectangular table. They do not claim full workbook fidelity. CSV output is UTF-8 with a BOM and CRLF line endings and prefixes injection-sensitive leading characters in string values.

## Workbook interchange

`toXlsxWorkbook` and `fromXlsxWorkbook` preserve supported worksheets, formula source, styles, merges, dimensions, frozen panes, names, and Sheetwrite metadata. Unsupported Excel features may be flattened or dropped and are reported through `XlsxWorkbookWarning`; callers must surface warnings when fidelity matters.

The optional package's ExcelJS-backed workbook implementation has browser and resource costs. Load `@sheetwrite/xlsx/register` on the path that needs XLSX rather than in every application entry.

- [Data operations and compatibility matrix](/docs/guides/data-operations/#xlsx-compatibility)
- [`@sheetwrite/xlsx` API](/docs/api/xlsx/)
- [`@sheetwrite/xlsx/register` API](/docs/api/xlsx-register/)
- [`toXlsxWorkbook`](/docs/api/core/to-xlsx-workbook/)
