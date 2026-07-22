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

`toXlsxWorkbook` and `fromXlsxWorkbook` preserve supported worksheets, formula source, styles, merges, dimensions, frozen panes, names, HTTPS/mailto and internal range hyperlinks, ordered conditional formats, and Sheetwrite metadata. Unsupported Excel features are never silently flattened: every dropped native feature is reported through the structured `onWarning` callback (`XlsxWorkbookWarning`), and callers must surface warnings when fidelity matters. Both directions build the complete workbook representation in memory; budget accordingly for large files.

Hyperlinks retain stable IDs in Sheetwrite metadata. Internal destinations use stable sheet IDs, so a sheet rename does not retarget the link; removing the destination removes inbound links atomically, and undo restores them with the sheet. Activation of any stale host-held target still fails closed. External mutation and activation accept only absolute `https://` and `mailto:` targets. `javascript:`, `data:`, `file:`, HTTP, credentials, malformed URLs, and internal OOXML relationship traversal are rejected before document mutation or host activation. Sheetwrite never calls `window.open`: Ctrl/Meta-click and `grid.activateHyperlink()` emit `hyperlink-activate` with a validated target. Set `hyperlinkActivation: "internal-navigation"` to additionally navigate internal targets, or `"disabled"` to suppress activation.

Conditional rules are evaluated in array order. Earlier rules have style precedence, and a matching `stopIfTrue` prevents later rules from entering the main/Worker match mask. Formula predicates are anchored at the rule range's top-left: relative A1 references move per target cell while `$`-absolute components stay fixed. One sheet admits at most 32 rules (the deterministic `u32` renderer mask), and one predicate formula is limited to 8,192 characters. SpreadsheetML `cellIs`, blank/text, and expression rules round-trip with priority and stop behavior. Color scales, data bars, icon sets, and unrepresentable differential styles remain in neither the live model nor the renderer; import emits a deterministic `format-loss` warning naming the exact dropped rule kind.

The [detailed compatibility results](/docs/reference/compatibility-matrix/) distinguish evaluated, preserved, flattened, warning, and unsupported behavior by checked test file and producing application.

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
