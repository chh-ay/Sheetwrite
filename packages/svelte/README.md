# @sheetwrite/svelte

Svelte 5 components for Sheetwrite.

## Install

```sh
bun add @sheetwrite/svelte
```

Svelte 5 is a peer dependency. Core and WASM arrive transitively.

## Data-first component

```svelte
<script lang="ts">
import { Sheetwrite } from "@sheetwrite/svelte";
import "@sheetwrite/svelte/styles.css";
</script>

<Sheetwrite
  {columns}
  defaultRows={products}
  height="500px"
  onGridChange={(event) => console.log(event.source, event.transaction.patches)}
/>
```

`defaultRows` seeds an uncontrolled grid and is never mutated. Changing its identity intentionally creates a new generation. Use `height` or `fill`; `fill` requires an already-sized ancestor.

`onGridChange` observes the complete transaction. Do not persist only
`event.changes`; use `event.transaction.patches` or attach `SyncCoordinator` to
the bound `Grid` for mutation IDs, acknowledgements, retry, and remote ordering.

WASM initializes on client mount. A `fallback` snippet renders while loading, `onInitializationError` observes failure, and `wasmSource` is the explicit-source escape hatch.

## Advanced component

```svelte
<SheetwriteGrid bind:grid {workbook} {data} fill />
```

The bindable `grid` is published before `onReady({ grid, generation, reason })` and clears during replacement/unmount. Reset-bound inputs are `workbook`, `data`, `datasource`, `datasourceStorage`, `renderer`, `workerUrl`, and `renderers`; `theme`, `readOnly`, `config`, `overscan`, and `minColumns` update live.

Grid events are `onGridChange`, `onViewportChange`, `onSelectionChange`, `onEditBegin`, `onEditCommit`, `onSearch`, and `onActiveSheetChange`. Native host change/scroll handlers remain available.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See [installation](../../docs/src/content/docs/docs/start/installation.md), [Svelte integration](../../docs/src/content/docs/docs/frameworks/svelte.md), and [collaboration](../../docs/src/content/docs/docs/guides/collaboration.md).

XLSX is not installed by this adapter. If the toolbar configuration enables
XLSX export, install `@sheetwrite/xlsx` and import
`@sheetwrite/xlsx/register` before the action (or lazily inside its handler).
CSV/TSV require no optional package.
