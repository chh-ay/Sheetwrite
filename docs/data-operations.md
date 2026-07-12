# Data operations

[Docs index](./README.md)

Sheetwrite can sort, filter, hide, group, aggregate, import, and export the active
sheet without rewriting the stored row data. Sorts and filters are display views:
the store keeps a row-order permutation/subset and the renderer reads through it.

## Display views

The simple shorthands are still available:

```ts
grid.sortBy(4);            // sort by column 4, ascending
grid.sortBy(4, false);     // descending
grid.filterBy(3, "Tokyo"); // keep rows whose column-3 text contains "Tokyo"
grid.clearView();          // clear sort/filter state only
```

For custom UI, use the composable primitives. All active column filters are ANDed
together, hidden rows and collapsed groups are subtracted, and the remaining rows
are sorted by the active multi-key sort.

```ts
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

```ts
grid.aggregate(col: number, op: "sum" | "avg" | "min" | "max" | "count"): number
```

```ts
const total = grid.aggregate(4, "sum");
const rows = grid.aggregate(0, "count");
```

## Frozen panes and zoom

Frozen panes and zoom are view geometry, not data mutations:

```ts
grid.setFrozen(1, 1); // pin first view row and first column
grid.setFrozen(0, 0); // unfreeze

grid.setZoom(1.25);
console.log(grid.getZoom());
```

`setFrozen(rows, cols?)` pins leading view rows and columns while the body
scrolls. `setZoom(z)` clamps to `0.5`-`2` and scales painted row/column geometry
and fonts; workbook widths/heights remain in base units.

## Export

The grid can download the active sheet directly. CSV is synchronous; XLSX is async
because the backend produces bytes asynchronously.

```ts
grid.exportCsv("sales.csv");
await grid.exportXlsx("sales.xlsx");
```

CSV is written UTF-8 with a BOM and CRLF line endings, and string values are
**injection-hardened** — a value starting with `=`, `+`, `-`, `@`, tab, or CR is
prefixed with a single quote so it cannot become an executable formula when
reopened in a spreadsheet app.

### Standalone import/export functions

The same machinery is exported for use without a `Grid`. Export functions take a
`Store` (`grid.store`, or your own). Import functions produce `ColumnarData`.

```ts
import {
  downloadBytes,
  fromCsv,
  fromXlsx,
  toCsv,
  toTsv,
  toXlsx,
} from "@sheetwrite/core";

import "@sheetwrite/core/xlsx"; // registers default XLSX import/export backends

const dataFromCsv = fromCsv(csvText, columns);
const dataFromXlsx = await fromXlsx(bytes);

const csv = toCsv(sheet, store);                 // string (BOM + CRLF, injection-hardened)
const tsv = toTsv(range, store);                 // string (Excel/Sheets clipboard TSV)
const bytes = await toXlsx(workbook, store);     // Promise<Uint8Array>

downloadBytes(csv, "sales.csv", "text/csv");
downloadBytes(bytes, "sales.xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
```

| Function | Signature |
| --- | --- |
| `fromCsv` | `fromCsv(text: string, columns: readonly Column[]): ColumnarData` |
| `fromXlsx` | `fromXlsx(data: ArrayBuffer \| Uint8Array): Promise<ColumnarData>` |
| `toCsv` | `toCsv(sheet: Sheet, store: Store): string` |
| `toTsv` | `toTsv(range: Range, store: Store): string` |
| `toXlsx` | `toXlsx(workbook: Workbook, store: Store): Promise<Uint8Array>` |
| `downloadBytes` | `downloadBytes(bytes: Uint8Array \| string, filename: string, mime: string): void` |

### XLSX backends

XLSX import/export uses pluggable backends. `toXlsx`, `fromXlsx`, and therefore
`grid.exportXlsx`, throw if no backend is registered:

```txt
Sheetwrite: no xlsx backend configured (import and register one first)
Sheetwrite: no xlsx import backend configured (import and register one first)
```

The default backend lives at the `@sheetwrite/core/xlsx` subpath. Importing it
registers itself as a side effect:

```ts
import "@sheetwrite/core/xlsx";
```

The default export writes the active sheet's visible columns, cell and header
styles, number/date formats, merged regions, column widths, and row-height
overrides. Multi-sheet export is not yet supported.

The module also exports backend objects if you want to register them explicitly or
wrap them:

```ts
import {
  readExcelFileImportBackend,
  writeExcelFileBackend,
} from "@sheetwrite/core/xlsx";
import {
  setXlsxBackend,
  setXlsxImportBackend,
  type XlsxBackend,
  type XlsxImportBackend,
} from "@sheetwrite/core";

setXlsxBackend(writeExcelFileBackend);
setXlsxImportBackend(readExcelFileImportBackend);
```

To supply your own engine, implement the backend contracts and register them —
nothing else changes:

```ts
interface XlsxBackend {
  name: string;
  toXlsx(workbook: Workbook, store: Store): Promise<Uint8Array>;
}

interface XlsxImportBackend {
  name: string;
  fromXlsx(data: ArrayBuffer | Uint8Array): Promise<ColumnarData>;
}
```

## See also

- [Interaction](./interaction.md) for clipboard TSV and the toolbar sort control.
- [Concepts](./concepts.md#transactions--patches) for the `addRows` / `removeRows` patches.
