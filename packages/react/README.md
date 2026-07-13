# @sheetwrite/react

React components for Sheetwrite.

## Install

```sh
bun add @sheetwrite/react
```

React 18 or newer is a peer dependency. Core and WASM are runtime dependencies of the adapter.

## Data-first component

```tsx
import { Sheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";

<Sheetwrite
  columns={[
    { key: "name", title: "Name" },
    { key: "price", title: "Price", type: "currency" },
  ]}
  defaultRows={products}
  height={500}
  onGridChange={(event) => console.log(event.source, event.transaction.patches)}
/>;
```

`defaultRows` seeds an uncontrolled grid. It is never mutated. Changing its identity deliberately creates a new grid generation; later grid edits are owned by the grid, not synchronized back into the input array.

`onGridChange` observes the complete transaction. Do not persist only
`event.changes`; use `event.transaction.patches` or attach `SyncCoordinator` to
the ready `Grid` for mutation IDs, acknowledgements, retry, and remote ordering.

Use `height={500}` for a fixed host or `fill` to occupy an already-sized ancestor. `fill` requires an ancestor with available height.

The component initializes WASM on client mount. `fallback` renders inside the stable host while initialization is pending or after an initialization failure. `onInitializationError(error)` observes failures. `wasmSource` is the advanced explicit-source escape hatch.

## Advanced component

```tsx
import { SheetwriteGrid } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";

<SheetwriteGrid ref={gridRef} workbook={workbook} data={data} fill />;
```

Reset-bound inputs are `workbook`, `data`, `datasource`, `datasourceStorage`, `renderer`, `workerUrl`, and `renderers`. They replace the grid. Live inputs are `theme`, `readOnly`, `config`, `overscan`, and `minColumns`.

`ref` receives the current `Grid` before `onReady({ grid, generation, reason })` runs and clears on replacement or unmount. Reasons are `initial`, `input-reset`, and `renderer-reset`.

Grid events use collision-free names: `onGridChange`, `onViewportChange`, `onSelectionChange`, `onEditBegin`, `onEditCommit`, `onSearch`, and `onActiveSheetChange`. Native host `onChange` and `onScroll` remain ordinary DOM handlers.

For vanilla/preload control, import `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. Explicit WASM assets and durable collaboration are documented in the repository [getting-started](../../docs/getting-started.md) and [offline/collaboration](../../docs/collaboration.md) guides.
