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
    @grid-change="({ changes }) => save(changes)"
  />
</template>
```

`defaultRows` seeds an uncontrolled grid and is never mutated. A new array identity deliberately creates a new generation. Use `height` or `fill`; `fill` requires an already-sized ancestor.

WASM initializes on client mount. Supply a `#fallback` slot while loading, observe `@initialization-error`, and use `wasm-source` only for explicit asset control.

## Advanced component

```vue
<SheetwriteGrid ref="gridComponent" :workbook="workbook" :data="data" fill />
```

The exposed `grid` handle is published before `@ready="({ grid, generation, reason }) => …"` and clears during replacement/unmount. Reset-bound inputs are `workbook`, `data`, `datasource`, `renderer`, `workerUrl`, and `renderers`; `theme`, `readOnly`, `config`, `overscan`, and `minColumns` update live.

Events are `grid-change`, `viewport-change`, `selection-change`, `edit-begin`, `edit-commit`, `search`, `active-sheet-change`, `ready`, and `initialization-error`. Native DOM change/scroll listeners remain available on the host.

For vanilla/preload control, use `initSheetwrite()` and `createGrid()` from `@sheetwrite/core`. See the repository getting-started guide for explicit WASM-source recipes.
