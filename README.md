# Sheetwrite

A canvas spreadsheet and data grid backed by a Rust/WASM columnar engine, with imperative core and React, Vue, and Svelte adapters.

## Framework lane

Install one adapter. Core and WASM arrive transitively.

```sh
bun add @sheetwrite/react
```

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
  onGridChange={(event) => event.source === "local" && save(event.transaction.patches)}
/>;
```

Use the equivalent `Sheetwrite` export and package-local `styles.css` from `@sheetwrite/vue` or `@sheetwrite/svelte`. Framework components initialize WASM automatically on client mount.

`defaultRows` is an uncontrolled seed. Sheetwrite never mutates it; edits live in the grid. Changing its identity deliberately replaces the grid and creates a new readiness generation. Use `height` for fixed sizing or `fill` inside an ancestor that already has available height.

`SheetwriteGrid` remains the advanced component for explicit `workbook` plus `data`/`datasource`. Reset-bound inputs are `workbook`, `data`, `datasource`, `renderer`, `workerUrl`, and `renderers`. Live inputs are `theme`, `readOnly`, `config`, `overscan`, and `minColumns`.

Readiness reports `{ grid, generation, reason }`, where reason is `initial`, `input-reset`, or `renderer-reset`. Grid events use collision-free names: `onGridChange`/`grid-change`, `onViewportChange`/`viewport-change`, selection, edit, search, and active-sheet variants. Native host change and scroll events remain available.

## Engine lane

```sh
bun add @sheetwrite/core
```

```ts
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

await initSheetwrite();

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Products",
      rowCount: 2,
      columns: [
        { key: "name", header: "Name", width: 180, type: "text" },
        { key: "price", header: "Price", width: 100, type: "currency" },
      ],
    },
  ],
};

const grid = createGrid(document.querySelector("#grid")!, {
  workbook,
  data: {
    rowCount: 2,
    columns: { name: ["Notebook", "Pen"], price: [12.5, 2.25] },
  },
});
```

Zero-argument initialization is canonical and re-entrant. Explicit WASM sources remain available for unsupported bundlers or controlled asset delivery; see [Getting started](docs/getting-started.md).

## Persistence

Snapshots are the authoritative, JSON-safe persistence boundary. Hosts own
storage; core never embeds a database or endpoint:

```ts
import { createGridFromSnapshot, SyncCoordinator } from "@sheetwrite/core";

const snapshot = await adapter.load("products");
const grid = createGridFromSnapshot(document.querySelector("#grid")!, snapshot);
const sync = new SyncCoordinator(grid, adapter, {
  documentId: "products",
  serverVersion: snapshot.version ?? 0,
});

saveButton.onclick = () => void sync.sendNext(); // explicit host-controlled timing/retry
sync.subscribe(remoteOperationSource);

const backup = grid.exportSnapshot();
grid.applyRemoteOperations(remoteOperations); // observable, not dirty or undoable
```

## Packages

| Package | Purpose |
|---|---|
| `@sheetwrite/core` | Imperative grid, store, formulas, views, export, theming |
| `@sheetwrite/react` | React `Sheetwrite` and `SheetwriteGrid` |
| `@sheetwrite/vue` | Vue `Sheetwrite` and `SheetwriteGrid` |
| `@sheetwrite/svelte` | Svelte `Sheetwrite` and `SheetwriteGrid` |
| `@sheetwrite/wasm` | Internal Rust/WASM engine; normally transitive |

## Development

```sh
bun install
bun run build:wasm
bun run typecheck
bun test
bun run build
bun run lint
bun run verify:bundlers
```

See `docs/` for configuration, framework integration, worker rendering, export, accessibility, and performance guidance.
