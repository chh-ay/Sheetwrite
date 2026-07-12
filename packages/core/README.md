# @sheetwrite/core

The framework-agnostic Sheetwrite engine: canvas rendering, the Rust→WASM
columnar store, formulas, data views, export, and theming.

## Install

```sh
bun add @sheetwrite/core @sheetwrite/wasm
```

## Usage

```ts
import { createGrid, initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
// Resolve the WASM binary as an asset URL (Vite users use `@sheetwrite/wasm/wasm?url`).
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Sheet 1",
      rowCount: 3,
      columns: [
        { key: "item", header: "Item", width: 200, type: "text" },
        { key: "qty", header: "Qty", width: 100, type: "number" },
      ],
    },
  ],
};

const data: ColumnarData = {
  rowCount: 3,
  columns: {
    item: ["Cable", "Adapter", "Mount"],
    qty: [3, 2, 5],
  },
};

// WASM must be initialized once before createGrid (which is synchronous).
await initSheetwrite(wasmUrl);

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

const grid = createGrid(host, { workbook, data });
```

Mutate cells through the store with a transaction:

```ts
grid.store.applyTransaction({
  patches: [
    {
      op: "set",
      addr: { sheet: "sheet1", row: 0, col: 0 },
      value: { kind: "literal", value: "Renamed" },
      style: { bold: true, align: "center" },
    },
  ],
});
```

## Data views and geometry

The `Grid` handle exposes composable, non-mutating views: `sortByMulti`,
`setColumnFilter`, `distinctValues`, `hideRows`/`showRows`, and row groups.
`clearView()` clears sorting and column filters while preserving explicitly hidden
rows and collapsed groups. Use `setFrozen(rows, cols?)` for leading panes and
`setZoom(0.5..2)` to scale painted geometry without changing workbook base
dimensions. See the [data-operations guide](../../docs/data-operations.md) for
the full API, including CSV/XLSX import and export.

## Subpath exports

- `@sheetwrite/core` — `createGrid`, `initSheetwrite`, `SheetwriteStore`, A1/date/input helpers, CSV/TSV/XLSX import/export helpers, and public types.
- `@sheetwrite/core/styles.css` — default theme as CSS custom properties; import once.
- `@sheetwrite/core/xlsx` — registers the XLSX import/export backends (backed by `read-excel-file` and `write-excel-file`). Import it once before calling `fromXlsx`, `toXlsx`, or `grid.exportXlsx()`, or wire your own backend with `setXlsxImportBackend` / `setXlsxBackend`.
- `@sheetwrite/core/shell` — optional composable spreadsheet chrome (`createSpreadsheetShell`, toolbar/name-box/formula-bar/status factories); pair with `@sheetwrite/core/shell.css`. See [docs/shell.md](../../docs/shell.md).
- `@sheetwrite/core/adapter` — `createGridController`, the lifecycle plumbing the framework adapters share. Only needed when building a new adapter or shell-like host.
- `@sheetwrite/core/worker` — the worker-renderer entry (`dist/worker.js`). The browser must be able to fetch it: copy `@sheetwrite/core/dist/worker.js` into your public assets (or use your bundler's dependency-worker import) and pass its served URL as `workerUrl` with `renderer: "worker"`:

```ts
const grid = createGrid(host, {
  workbook,
  data,
  renderer: "worker",
  workerUrl: "/assets/sheetwrite-worker.js",
});
```

The worker renderer runs on an OffscreenCanvas off the main thread and falls
back to the main-thread `canvas` renderer if the worker cannot be constructed —
it emits a `renderer-fallback` event and `grid.rendererKind()` reports which
renderer is active. A bare-specifier URL like
`new URL("@sheetwrite/core/worker", import.meta.url)` is NOT reliable: the
platform `URL` constructor does not consult package exports.

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
