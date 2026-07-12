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
  onGridChange={({ changes }) => save(changes)}
/>
```

`defaultRows` seeds an uncontrolled grid and is never mutated. Changing its identity intentionally creates a new generation. Use `height` or `fill`; `fill` requires an already-sized ancestor.

WASM initializes on client mount. A `fallback` snippet renders while loading, `onInitializationError` observes failure, and `wasmSource` is the explicit-source escape hatch.

## Advanced component

```svelte
<SheetwriteGrid bind:grid {workbook} {data} fill />
```

The bindable `grid` is published before `onReady({ grid, generation, reason })` and clears during replacement/unmount. Reset-bound inputs are `workbook`, `data`, `datasource`, `renderer`, `workerUrl`, and `renderers`; `theme`, `readOnly`, `config`, `overscan`, and `minColumns` update live.

Grid events are `onGridChange`, `onViewportChange`, `onSelectionChange`, `onEditBegin`, `onEditCommit`, `onSearch`, and `onActiveSheetChange`. Native host change/scroll handlers remain available.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See the repository getting-started guide for explicit WASM-source recipes.
