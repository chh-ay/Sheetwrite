# @sheetwrite/xlsx

Optional deterministic OOXML table and workbook backends for `@sheetwrite/core`. The package is isolated from core and uses the pinned `fflate` codec for bounded ZIP processing.

## Install and register

```sh
npm install @sheetwrite/core @sheetwrite/xlsx
```

Register once before calling any core XLSX function or `grid.exportXlsx()`:

```ts
import "@sheetwrite/xlsx/register";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
```

The registration entry is idempotent. Importing `@sheetwrite/xlsx` itself is side-effect free. Explicit composition is available through `registerXlsxBackends()`, `sheetwriteWorkbookBackend`, `sheetwriteTableImportBackend`, and `sheetwriteTableExportBackend`.

Without registration, core XLSX functions identify the missing optional package. CSV and TSV do not require this package.

## Table and workbook APIs

- `toXlsxTable(workbook, store, options)` and `fromXlsxTable(bytes, options)` exchange the active or first sheet with a first-row header. Table conversion is in-memory and intentionally reduced-fidelity.
- `toXlsxWorkbook(snapshotOrGrid, options)` and `fromXlsxWorkbook(bytes, options)` preserve multiple sheets, formula source, supported styles and number formats, validations, notes, merges, dimensions, frozen panes, named ranges, and versioned Sheetwrite metadata.

Every path shares `XlsxWorkbookOptions`. `maxCells` defaults to 1,000,000 logical cells. `resourceLimits` can lower bounds for compressed input, generated output, archive entries, compression ratio, individual and aggregate inflated bytes, sheets, rows, columns, merges, shared strings, styles, XML elements, XML depth, attributes, and text nodes. Invalid overrides fail before codec work; exceeded bounds throw `XlsxResourceError`. `signal` is checked before and between bounded operations. Unsupported content is dropped only with a structured `onWarning` notification.

The reader preflights the complete ZIP central directory and OPC relationship graph before inflating referenced parts. DTDs and custom XML entities are rejected. Applications accepting untrusted files should set host-specific limits lower than the defaults when appropriate.

Framework toolbar XLSX actions call the core backend contract. Applications enabling those actions must register this package explicitly or lazily import `@sheetwrite/xlsx/register` immediately before use.
