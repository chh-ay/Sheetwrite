# @sheetwrite/xlsx

Optional concrete XLSX backends for `@sheetwrite/core`. The package provides first-sheet table interchange through `write-excel-file` / `read-excel-file` and formula-preserving workbook interchange through ExcelJS.

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

The registration entry is idempotent. Importing `@sheetwrite/xlsx` itself is side-effect free; it exposes `registerXlsxBackends()` and the named concrete backend instances for hosts that need explicit composition.

Without registration, the core XLSX functions throw an error that tells the caller to install `@sheetwrite/xlsx` and import `@sheetwrite/xlsx/register`. CSV and TSV do not require this package.

## Table and workbook APIs

- `toXlsxTable(workbook, store)` and `fromXlsxTable(bytes)` exchange the active/first sheet with a first-row header. `grid.exportXlsx()` uses this table backend.
- `toXlsxWorkbook(snapshotOrGrid, options)` and `fromXlsxWorkbook(bytes, options)` preserve multiple sheets, formula source, supported styles, merges, dimensions, frozen panes, named ranges, and Sheetwrite metadata.

`XlsxWorkbookOptions.maxCells` defaults to 1,000,000 populated cells. The workbook backend uses an in-memory ExcelJS document model and is not a streaming path. `signal` is checked around parsing, serialization, and worksheet conversion; ExcelJS cannot interrupt an individual `load` or `writeBuffer` call. Unsupported external workbook features may be flattened or omitted and are reported through `onWarning`.

Framework toolbar XLSX actions call the core backend contract. Applications enabling those actions must install and register this package explicitly, or lazily import `@sheetwrite/xlsx/register` immediately before export.
