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
- `renderer`, `workerUrl`, `theme`, `readOnly`, `renderers`, `overscan`, `minColumns`, `config` — forwarded `GridOptions` fields.
- `className`, `style` — applied to the host `<div>` (the grid's own `sheetwrite` class is always preserved).
- All other standard `div` props (`id`, `data-*`, `aria-*`, `tabIndex`, event handlers not claimed by the grid) fall through to the host element.
- `onChange(event)` — fired on committed edits (`ChangeEvent`).
- `onSelectionChange(selection)` — fired when the selection changes (`Selection | null`).
- `onScroll(event)` — fired on scroll (visible row window).
- `onEditBegin(event)` — fired when a cell editor opens.
- `onEditCommit(event)` — fired after a cell editor commits.
- `onSearch(result)` — fired whenever the active search result changes.
- `onActiveSheetChange(event)` — fired after the visible sheet changes (`{ sheet: SheetId }`).
- `onReady(grid)` — fired once with the core `Grid` after it is created.

The grid is rebuilt when `workbook` identity changes and re-applies `theme` when
it changes; all event callbacks are read live.

The component is a `forwardRef<Grid>`: its `ref` resolves to the core `Grid`
(also delivered via `onReady`) so consumers can drive it imperatively.

```tsx
const gridRef = useRef<Grid>(null);
// <SheetwriteGrid ref={gridRef} workbook={workbook} data={data} />
gridRef.current?.search("foo");
```

The `Grid` handle exposed by `ref`/`onReady` has the same core data-view and
geometry API as vanilla Sheetwrite: `sortByMulti`, `setColumnFilter`,
`distinctValues`, `hideRows`/`showRows`, row groups, `setFrozen`, and `setZoom`.
Views are non-mutating; `clearView()` clears sorting and filters but preserves
explicitly hidden rows and collapsed groups. See [Data operations](../../docs/data-operations.md).

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
