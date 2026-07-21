# @sheetwrite/vue

Vue 3 components for Sheetwrite.

## Install

```sh
bun add @sheetwrite/vue
```

Vue 3.4 or newer is a peer dependency. Core and WASM arrive transitively.

## Data-first component

```vue
<script setup lang="ts">
import { Sheetwrite } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
</script>

<template>
  <Sheetwrite
    :columns="columns"
    :default-rows="products"
    height="500px"
    @grid-change="(event) => console.log(event.source, event.transaction.patches)"
  />
</template>
```

`defaultRows` seeds an uncontrolled grid and is never mutated. A new array identity deliberately creates a new generation. Use `height` or `fill`; `fill` requires an already-sized ancestor.

`grid-change` observes the complete transaction. Do not persist only
`event.changes`; use `event.transaction.patches` or attach `SyncCoordinator` to
the exposed `Grid` for mutation IDs, acknowledgements, retry, and remote ordering.

WASM initializes on client mount. Supply a `#fallback` slot while loading, observe `@initialization-error`, and use `wasm-source` only for explicit asset control.

## Advanced component

```vue
<SheetwriteGrid
  ref="gridComponent"
  :workbook="workbook"
  :data="data"
  presentation="data-grid"
  :editors="editors"
  fill
/>
```

The exposed `grid` handle is published before
`@ready="({ grid, generation, reason }) => …"` and clears during
replacement/unmount. Reset-bound inputs are `workbook`, `data`, `datasource`,
`datasourceStorage`, `presentation`, `editors`, `protectionResolver`,
`mutationPolicy`, `transactionResourceLimits`, `renderer`, `workerUrl`, and
`renderers`; `theme`, `readOnly`, `config`, `overscan`, and `minColumns` update
live.

Events are `grid-change`, `viewport-change`, `selection-change`, `edit-begin`, `edit-commit`, `search`, `command-state-change`, `active-sheet-change`, `mutation-rejected`, `renderer-fallback`, `datasource-error`, `export-error`, `ready`, and `initialization-error`. Native DOM change/scroll listeners remain available on the host.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See [installation](https://sheetwrite.vercel.app/docs/start/installation/), [Vue integration](https://sheetwrite.vercel.app/docs/frameworks/vue/), and [collaboration](https://sheetwrite.vercel.app/docs/guides/collaboration/).

XLSX is not installed by this adapter. If the toolbar configuration enables
XLSX export, install `@sheetwrite/xlsx` and import
`@sheetwrite/xlsx/register` before the action (or lazily inside its handler).
CSV/TSV require no optional package.
