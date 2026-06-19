# Data operations

[Docs index](./README.md)

Sheetwrite can sort, filter, aggregate, and export the active sheet without ever
rewriting your data.

## Sort & filter views

`sortBy`, `filterBy`, and `clearView` create **non-mutating display views**. They
do not touch cell data — the store keeps a row-order permutation (or subset of row
indices) and the renderer reads through it, so clearing the view restores the
original order instantly.

```ts
grid.sortBy(4);            // sort by column 4, ascending
grid.sortBy(4, false);     // descending
grid.filterBy(3, "Tokyo"); // keep rows whose column-3 text contains "Tokyo"
grid.clearView();          // drop any active sort/filter
```

| Method | Signature | Effect |
| --- | --- | --- |
| `sortBy` | `sortBy(col: number, ascending = true): void` | Reorder displayed rows by a column. |
| `filterBy` | `filterBy(col: number, needle: string): void` | Show only rows whose column text contains `needle`. |
| `clearView` | `clearView(): void` | Remove the active view and show all rows in stored order. |

Because a view reorders or hides rows, two features that depend on a stable
row-to-cell mapping are **disabled while a view is active**:

- **Merged cells** are not drawn (the layout reports no merges under a view).
- **Drag-to-fill** is unavailable (the fill handle is hidden).

Call `clearView()` to re-enable them.

## Aggregate

`aggregate` computes a column reduction over the active sheet's data and returns a
number:

```ts
grid.aggregate(col: number, op: "sum" | "avg" | "min" | "max" | "count"): number
```

```ts
const total = grid.aggregate(4, "sum");
const rows = grid.aggregate(0, "count");
```

## Export

The grid can download the active sheet directly. CSV is synchronous; XLSX is async
because the backend produces bytes asynchronously.

```ts
grid.exportCsv("sales.csv");
await grid.exportXlsx("sales.xlsx");
```

CSV is written UTF-8 with a BOM and CRLF line endings, and string values are
**injection-hardened** — a value starting with `=`, `+`, `-`, `@`, tab, or CR is
prefixed with a single quote so it can not become an executable formula when
reopened in a spreadsheet app.

### Standalone export functions

The same machinery is exported for use without a `Grid`. Each takes a `Store`
(`grid.store`, or your own):

```ts
import { toCsv, toTsv, toXlsx, downloadBytes } from "@sheetwrite/core";

const csv = toCsv(sheet, store);                 // string (BOM + CRLF, injection-hardened)
const tsv = toTsv(range, store);                 // string (Excel/Sheets clipboard TSV)
const bytes = await toXlsx(workbook, store);     // Promise<Uint8Array>

downloadBytes(csv, "sales.csv", "text/csv");
downloadBytes(bytes, "sales.xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
```

| Function | Signature |
| --- | --- |
| `toCsv` | `toCsv(sheet: Sheet, store: Store): string` |
| `toTsv` | `toTsv(range: Range, store: Store): string` |
| `toXlsx` | `toXlsx(workbook: Workbook, store: Store): Promise<Uint8Array>` |
| `downloadBytes` | `downloadBytes(bytes: Uint8Array \| string, filename: string, mime: string): void` |

### XLSX backend

XLSX export uses a **pluggable backend** — `toXlsx` (and therefore
`grid.exportXlsx`) throws if no backend is registered:

```
Sheetwrite: no xlsx backend configured (import and register one first)
```

The default backend is built on [`write-excel-file`](https://www.npmjs.com/package/write-excel-file)
and lives at the `@sheetwrite/core/xlsx` subpath. Importing it **registers itself**
as a side effect — that single import is all you need:

```ts
import "@sheetwrite/core/xlsx"; // registers the write-excel-file backend
// now grid.exportXlsx(...) and toXlsx(...) work
```

The module also exports the backend object if you want to register it explicitly
or wrap it:

```ts
import { writeExcelFileBackend } from "@sheetwrite/core/xlsx";
import { setXlsxBackend, type XlsxBackend } from "@sheetwrite/core";

setXlsxBackend(writeExcelFileBackend);
```

To supply your own engine (for example a future Rust-based writer), implement the
`XlsxBackend` contract and register it — nothing else changes:

```ts
interface XlsxBackend {
  name: string;
  toXlsx(workbook: Workbook, store: Store): Promise<Uint8Array>;
}

setXlsxBackend(myBackend);
```

## See also

- [Interaction](./interaction.md) for clipboard TSV and the toolbar sort control.
- [Concepts](./concepts.md#transactions--patches) for the `addRows` / `removeRows` patches.
