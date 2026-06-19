# @sheetwrite/react

React adapter for Sheetwrite. It wraps the imperative core grid in a
`<SheetwriteGrid>` component that owns a host `<div>`, forwards events, and tears
the grid down on unmount.

## Install

```sh
bun add @sheetwrite/react @sheetwrite/core @sheetwrite/wasm
```

Peer dependency: `react >= 18`.

## Usage

Call `await initSheetwrite(wasmUrl)` once before any grid mounts (the adapter
does not initialize WASM for you).

```tsx
import { initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { SheetwriteGrid } from "@sheetwrite/react";
import { createRoot } from "react-dom/client";
// Vite users use `@sheetwrite/wasm/wasm?url`.
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
  columns: { item: ["Cable", "Adapter", "Mount"], qty: [3, 2, 5] },
};

await initSheetwrite(wasmUrl);

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

createRoot(host).render(
  <SheetwriteGrid
    workbook={workbook}
    data={data}
    style={{ height: "100%" }}
    onChange={(event) => console.log("changed", event.changes.length)}
    onSelectionChange={(selection) => console.log("selection", selection)}
  />,
);
```

## Props

`SheetwriteGridProps` extends `GridOptions`:

- `workbook` (required) — the workbook model.
- `data` / `datasource` — eager columnar data, or a paged datasource.
- `renderer`, `workerUrl`, `theme`, `readOnly`, `renderers`, `overscan`, `config` — forwarded `GridOptions` fields.
- `className`, `style` — applied to the host `<div>`.
- `onChange(event)` — fired on committed edits (`ChangeEvent`).
- `onSelectionChange(selection)` — fired when the selection changes (`Selection | null`).

The grid is rebuilt when `workbook` identity changes and re-applies `theme` when
it changes; the `onChange`/`onSelectionChange` callbacks are read live.

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
