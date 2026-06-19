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

## Subpath exports

- `@sheetwrite/core` — `createGrid`, `initSheetwrite`, `SheetwriteStore`, renderers, A1 utilities, export helpers, and all types.
- `@sheetwrite/core/styles.css` — default theme as CSS custom properties; import once.
- `@sheetwrite/core/xlsx` — registers the XLSX export backend (backed by `write-excel-file`). Import it once before calling `grid.exportXlsx()`, or wire your own backend with `setXlsxBackend`.
- `@sheetwrite/core/worker` — the worker-renderer entry. Pass it as `workerUrl` with `renderer: "worker"`:

```ts
const grid = createGrid(host, {
  workbook,
  data,
  renderer: "worker",
  workerUrl: new URL("@sheetwrite/core/worker", import.meta.url),
});
```

The worker renderer runs on an OffscreenCanvas off the main thread and falls
back to the main-thread `canvas` renderer if the worker cannot be constructed.

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
