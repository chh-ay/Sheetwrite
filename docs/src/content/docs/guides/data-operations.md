---
title: Data operations and export
description: Sort, filter, aggregate, load paged data, and export CSV, TSV, tables, or workbooks.
---

[Installation](/docs/start/installation/)

Sheetwrite can sort, filter, hide, group, aggregate, import, and export the active
sheet without rewriting the stored row data. Sorts and filters are display views:
the store keeps a row-order permutation/subset and the renderer reads through it.

## Display views

The simple shorthands are still available:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.sortBy(4);            // sort by column 4, ascending
grid.sortBy(4, false);     // descending
grid.filterBy(3, "Tokyo"); // keep rows whose column-3 text contains "Tokyo"
grid.clearView();          // clear sort/filter state only
```

For custom UI, use the composable primitives. All active column filters are ANDed
together, hidden rows and collapsed groups are subtracted, and the remaining rows
are sorted by the active multi-key sort.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.sortByMulti([
  { col: 4, ascending: false }, // primary key
  { col: 0, ascending: true },  // tie-breaker
]);

grid.setColumnFilter(3, { kind: "contains", text: "Tokyo" });
grid.setColumnFilter(2, { kind: "values", values: ["Retail", "Partner"] });
grid.setColumnFilter(5, { kind: "compare", op: "gte", value: 1000 });

const cities = grid.distinctValues(3, 100); // data source for a filter menu

grid.hideRows([1, 7, 9]);
grid.groupRows(10, 25);
grid.setGroupCollapsed(10, true);
```

| Method | Signature | Effect |
| --- | --- | --- |
| `sortBy` | `sortBy(col: number, ascending = true): void` | Reorder displayed rows by one column. |
| `sortByMulti` | `sortByMulti(keys: readonly SortKey[]): void` | Stable multi-key sort; first key is primary. |
| `filterBy` | `filterBy(col: number, needle: string): void` | Shorthand for a case-insensitive `contains` column filter. |
| `setColumnFilter` | `setColumnFilter(col: number, filter: ColumnFilter \| null): void` | Set or clear one column filter. |
| `getColumnFilters` | `getColumnFilters(): ReadonlyMap<number, ColumnFilter>` | Current active column filters. |
| `distinctValues` | `distinctValues(col: number, limit = 1000): CellScalar[]` | First-seen distinct resolved values for a column. |
| `hideRows` / `showRows` | `hideRows(rows)` / `showRows(rows?)` | Hide/show data rows independent of sort/filter state. |
| `hiddenRows` | `hiddenRows(): readonly number[]` | Currently hidden data rows. |
| `groupRows` / `ungroupRows` | `groupRows(start, end)` / `ungroupRows(start, end)` | Create/remove an inclusive data-row group. |
| `setGroupCollapsed` | `setGroupCollapsed(start, collapsed): void` | Collapse or expand the group starting at `start`. |
| `rowGroups` | `rowGroups(): readonly RowGroup[]` | Current row-group definitions. |
| `clearView` | `clearView(): void` | Clears sort/filter state. Hidden rows and row groups are preserved. |

`clearView()` deliberately does **not** unhide rows or expand row groups. This
matches spreadsheet behavior: clearing a filter removes the query, but explicit
hidden rows and collapsed groups remain a separate visibility state. Use
`showRows()` and `setGroupCollapsed(start, false)` to reverse those states.

Because a view reorders or hides rows, two features that depend on a stable
row-to-cell mapping are disabled while a view is active:

- **Merged cells** are not drawn (the layout reports no merges under a view).
- **Drag-to-fill** is unavailable (the fill handle is hidden).

Call `clearView()` to remove sort/filter state; also show hidden rows / expand
row groups if you need the full natural data order.

## Aggregate

`aggregate` computes a column reduction over the active sheet's data and returns a
number:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
type Aggregate = Grid["aggregate"];
```

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
const total = grid.aggregate(4, "sum");
const rows = grid.aggregate(0, "count");
```

## Frozen panes and zoom

Frozen panes and zoom are view geometry, not data mutations:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.setFrozen(1, 1); // pin first view row and first column
grid.setFrozen(0, 0); // unfreeze

grid.setZoom(1.25);
console.log(grid.getZoom());
```

`setFrozen(rows, cols?)` pins leading view rows and columns while the body
scrolls. `setZoom(z)` clamps to `0.5`-`2` and scales painted row/column geometry
and fonts; workbook widths/heights remain in base units.

## Export

The grid can download the active sheet directly. CSV is synchronous; XLSX is
async because the optional backend produces bytes asynchronously. Install and
register `@sheetwrite/xlsx` before enabling a framework toolbar export action
or calling `grid.exportXlsx`:

```sh verify title="Verified command"
npm install @sheetwrite/xlsx
```

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import "@sheetwrite/xlsx/register";

grid.exportCsv("sales.csv");
await grid.exportXlsx("sales.xlsx");
```

`grid.exportXlsx(...)` rejects when registration or encoding fails, preserving
the backend error. Built-in toolbar and context-menu actions cannot return that
promise, so the grid emits one `export-error` event with
`{ format: "xlsx", error }` instead:

```ts prelude="core" partial="requires an initialized Grid host" title="Observe built-in XLSX failures"
grid.on("export-error", ({ format, error }) => {
  console.error(`${format} export failed`, error);
});
```

CSV is written UTF-8 with a BOM and CRLF line endings, and string values are
**injection-hardened** — a value starting with `=`, `+`, `-`, `@`, tab, or CR is
prefixed with a single quote so it cannot become an executable formula when
reopened in a spreadsheet app.

Clipboard formulas and references retain their rich behavior only for a
copy/cut pasted back through the same live Sheetwrite grid controller. Rich
payloads from another controller or application, including spreadsheet HTML,
paste as injection-neutralized text; `pasteValues` uses resolved literals.

### Standalone import/export functions

Sheetwrite exposes two intentionally different XLSX contracts:

- **Table interchange**: `toXlsxTable` / `fromXlsxTable`. This is the active-sheet,
  first-row-header API used by `grid.exportXlsx`.
- **Workbook round-trip**: `toXlsxWorkbook` / `fromXlsxWorkbook`. This consumes
  and produces the same `WorkbookSnapshot` used by persistence, without adding
  a header row.

Register the optional XLSX package once before using either contract:
```ts prelude="xlsx" partial="requires surrounding host state" title="Partial example"
import {
  downloadBytes,
  fromCsv,
  fromXlsxTable,
  fromXlsxWorkbook,
  SheetwriteStore,
  toCsv,
  toTsv,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

const dataFromCsv = fromCsv(csvText, columns);
const tableBytes = await toXlsxTable(workbook, store);
const dataFromTable = await fromXlsxTable(tableBytes);

const workbookBytes = await toXlsxWorkbook(store.exportSnapshot(), {
  maxCells: 250_000,
  signal: abortController.signal,
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
const importedSnapshot = await fromXlsxWorkbook(workbookBytes);
const importedStore = SheetwriteStore.fromSnapshot(importedSnapshot);

const csv = toCsv(sheet, store); // string (BOM + CRLF, injection-hardened)
const tsv = toTsv(range, store); // string (Excel/Sheets clipboard TSV)

downloadBytes(csv, "sales.csv", "text/csv");
downloadBytes(
  workbookBytes,
  "workbook.xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
);
```

| Function | Signature |
| --- | --- |
| `fromCsv` | `fromCsv(text: string, columns: readonly Column[]): ColumnarData` |
| `fromXlsxTable` | `(data: ArrayBuffer \| Uint8Array, options?: XlsxWorkbookOptions) => Promise<ColumnarData>` |
| `fromXlsxWorkbook` | `(data: ArrayBuffer \| Uint8Array, options?: XlsxWorkbookOptions) => Promise<WorkbookSnapshot>` |
| `toCsv` | `toCsv(sheet: Sheet, store: Store): string` |
| `toTsv` | `toTsv(range: Range, store: Store): string` |
| `toXlsxTable` | `(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions) => Promise<Uint8Array>` |
| `toXlsxWorkbook` | `(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions) => Promise<Uint8Array>` |
| `downloadBytes` | `downloadBytes(bytes: Uint8Array \| string, filename: string, mime: string): void` |

`XlsxWorkbookOptions` is the shared resource contract for every table and
workbook path. `maxCells` bounds logical accepted cells and defaults to
`1_000_000`; `resourceLimits` overrides the remaining input, archive, XML,
dimension, and output budgets, which are checked before decompression and
allocation and reject with a typed `XlsxResourceError`. `signal` is checked
between bounded codec stages, and structured warnings surface through
`onWarning`. Both directions materialize the complete file representation in
memory; there is no streaming mode.

### XLSX compatibility

| Feature | Table API | Workbook API |
| --- | --- | --- |
| Multiple worksheets and order | Active sheet only | Preserved |
| First row | Synthesized column headers | Ordinary row; no header synthesis |
| Formula source, including cross-sheet formulas | Exports resolved scalars | Preserved; workbook requests full recalculation on open |
| Cell styles, borders, number/date formats | Preserved on active-sheet export | Preserved |
| Merges, column widths, row heights | Preserved on active-sheet export | Preserved |
| Frozen panes and active worksheet | Not round-tripped | Preserved |
| Named ranges | Not represented | Preserved |
| Sheetwrite conditional formats and row groups | Not represented | Preserved in Sheetwrite metadata; warning reports that no Excel rule/outline is emitted |
| Boolean literals | Imported by the table reader | Preserved as native booleans |
| Rich text and hyperlinks | Reader-dependent flattening | Display text preserved with a structured warning |
| Sheetwrite validation rules | Not represented | Preserved in Sheetwrite metadata; supported list/numeric/date/text-length rules also emit native Excel validation |
| Protected ranges | Not represented | Preserved in Sheetwrite metadata; no Excel sheet-protection claim is made |
| Cell notes | Not represented | Preserved in Sheetwrite metadata and emitted as native Excel notes |
| External Excel validation, protection, notes, images, tables, auto-filters, conditional formatting, and VBA | Not represented | Features without Sheetwrite metadata are dropped with a structured `unsupported-feature` warning when detected |

Workbook formulas are imported as formula source, not as cached results.
Hydrating the returned snapshot with `SheetwriteStore.fromSnapshot` recompiles
them into the WASM formula engine. No raw formula handles enter the serialized
snapshot.

### XLSX backends

XLSX uses pluggable backends. Calling a table or workbook API without its
backend throws a configuration error that names both remedies: install
`@sheetwrite/xlsx`, then import `@sheetwrite/xlsx/register` before calling the
function. The ordinary core entry never resolves the optional codec, so normal
grid bundles carry no spreadsheet-file code.

`@sheetwrite/xlsx` is the only concrete implementation package. Its root entry
is side-effect free and exports `registerXlsxBackends()` plus the three named
backend instances for explicit registration or wrapping. The `./register`
entry performs idempotent registration:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import {
  registerXlsxBackends,
  sheetwriteTableExportBackend,
  sheetwriteTableImportBackend,
  sheetwriteWorkbookBackend,
} from "@sheetwrite/xlsx";
import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
  type XlsxTableExportBackend,
  type XlsxTableImportBackend,
  type XlsxWorkbookBackend,
} from "@sheetwrite/core";

registerXlsxBackends();

// Or compose individual backends explicitly.
setXlsxTableExportBackend(sheetwriteTableExportBackend);
setXlsxTableImportBackend(sheetwriteTableImportBackend);
setXlsxWorkbookBackend(sheetwriteWorkbookBackend);
```

The backends share Sheetwrite's internal bounded OOXML codec, which owns OPC
part resolution, XML tokenization, styles, and worksheet mapping over one
audited compression primitive (`fflate`). It preserves formula source,
worksheets, styles, merges, dimensions, frozen views, and named ranges, and it
enforces the shared resource limits before decompression. The host can replace
any role by implementing `XlsxWorkbookBackend` or the table backend contracts.

## See also

- [Interaction](/docs/guides/interaction/) for clipboard TSV and the toolbar sort control.
- [Concepts](/docs/concepts/runtime-ownership/#document-protocol-and-storage-transactions) for row/column `DocumentOp` transactions.
