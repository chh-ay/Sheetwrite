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

`onGridChange` carries the complete transaction. Persist `event.transaction.patches`, not only `event.changes`; use `SyncCoordinator` for acknowledgements, retry, and remote ordering.

WASM initializes on client mount. Use `fallback` while loading, `onInitializationError` for failures, and `wasmSource` for an explicit source.

## Advanced component

```svelte
<SheetwriteGrid bind:grid {workbook} {data} fill />
```

The bindable `grid` is published before `onReady({ grid, generation, reason })` and clears during replacement or unmount. Reset-bound inputs replace the generation; presentation props update live.

Grid events cover changes, viewport, selection, editing, search, and active-sheet changes.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See [installation](https://sheetwrite.vercel.app/docs/start/installation/), [Svelte integration](https://sheetwrite.vercel.app/docs/frameworks/svelte/), and [collaboration](https://sheetwrite.vercel.app/docs/guides/collaboration/).

XLSX is not installed by this adapter. If the toolbar configuration enables
XLSX export, install `@sheetwrite/xlsx` and import
`@sheetwrite/xlsx/register` before the action (or lazily inside its handler).
CSV/TSV require no optional package.
