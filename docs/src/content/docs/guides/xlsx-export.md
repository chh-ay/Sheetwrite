---
title: XLSX and export
description: Register the optional XLSX backend and choose table or workbook interchange deliberately.
---

CSV and TSV remain core-only. XLSX is optional so normal grid and framework bundles do not pull spreadsheet-file dependencies into their initial graph.

```sh verify title="Install the optional XLSX backend"
bun add @sheetwrite/xlsx
```

Register it once before invoking grid XLSX actions or the core workbook/table functions:

```ts prelude="core" partial="requires an initialized grid" title="Register and export"
import "@sheetwrite/xlsx/register";

await grid.exportXlsx("sales.xlsx");
```
All four optional XLSX functions are asynchronous. Missing registration and
codec failures reject with `SheetwriteError`; use `code` rather than matching
the installation message. Resource failures remain `XlsxResourceError`
instances and therefore also satisfy `isSheetwriteError`.


## Table interchange

`toXlsxTable` and `fromXlsxTable` exchange the active rectangular table. They deliberately reduce scope and fidelity — one sheet, synthesized headers, resolved scalars instead of formula source — and, like the workbook APIs, they materialize the complete file in memory rather than streaming it. CSV output is UTF-8 with a BOM and CRLF line endings and prefixes injection-sensitive leading characters in string values.

## Workbook interchange

`toXlsxWorkbook` and `fromXlsxWorkbook` preserve supported worksheets, formula source, styles, merges, dimensions, frozen panes, names, and Sheetwrite metadata. Unsupported Excel features may be flattened or dropped and are reported through the structured `onWarning` callback (`XlsxWorkbookWarning`); callers must surface warnings when fidelity matters. Both directions build the complete workbook representation in memory; budget accordingly for large files.

The [generated executable compatibility matrix](/docs/reference/compatibility-matrix/) distinguishes evaluated, preserved, flattened, warning, and unsupported behavior by fixture and producer evidence.

## Resource limits

Every table and workbook path shares one resource contract, `XlsxWorkbookOptions`:

- `maxCells` bounds logical accepted cells and defaults to `1_000_000`;
- `resourceLimits` overrides the remaining bounded dimensions, checked before decompression and allocation: input bytes (32 MiB), output bytes (128 MiB), archive entries (1,024), per-entry uncompressed bytes (64 MiB), total uncompressed bytes (256 MiB), compression ratio (×100), sheets (256), rows per sheet (1,048,576), columns per sheet (16,384), merges (100,000), shared strings (1,000,000), style records (65,536), XML elements (2,000,000), XML depth (64), XML attributes per element (128), and XML text bytes (16 MiB);
- `signal` aborts between bounded codec stages.

Crossing any bound rejects with a typed `XlsxResourceError` naming the resource, limit, and observed value — before the codec allocates unsafe data. The defaults are exported as `DEFAULT_XLSX_RESOURCE_LIMITS`.

The optional package implements a bounded OOXML subset internally over one audited compression primitive (`fflate`). Load `@sheetwrite/xlsx/register` on the path that needs XLSX rather than in every application entry.

- [Data operations and XLSX compatibility](/docs/guides/data-operations/#xlsx-compatibility)
- [`@sheetwrite/xlsx` API](/docs/api/xlsx/)
- [`@sheetwrite/xlsx/register` API](/docs/api/xlsx-register/)
- [`toXlsxWorkbook`](/docs/api/core/to-xlsx-workbook/)
