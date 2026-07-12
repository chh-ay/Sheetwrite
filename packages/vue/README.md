# @sheetwrite/vue

Vue 3 adapter for Sheetwrite. It wraps the imperative core grid in a
`<SheetwriteGrid>` component that owns a host `<div>`, forwards events as emits,
and tears the grid down on unmount.

## Install

```sh
bun add @sheetwrite/vue @sheetwrite/core @sheetwrite/wasm
```

Peer dependency: `vue >= 3.4`.

## Usage

Call `await initSheetwrite(wasmUrl)` once at your app entry before any grid
mounts (the adapter does not initialize WASM for you).

```ts
import { initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { SheetwriteGrid } from "@sheetwrite/vue";
import { createApp, h } from "vue";
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

createApp({
  render: () =>
    h(SheetwriteGrid, {
      workbook,
      data,
      style: "height: 100%",
      onChange: (event) => console.log("changed", event.changes.length),
      onSelection: (selection) => console.log("selection", selection),
    }),
}).mount("#app");
```

In a single-file component the same props and emits bind with template syntax
(`workbook`, `data`, and the handlers come from `<script setup>`):

```vue
<template>
  <SheetwriteGrid :workbook="workbook" :data="data" @change="onChange" @selection="onSelection" />
</template>
```

## Props and emits

Props: `workbook` (required), `data`, `datasource`, `renderer`, `workerUrl`,
`theme`, `readOnly`, `renderers`, `overscan`, `minColumns`, `config`
(toolbar/feature flags). `class` and `style` fall through to the host `<div>`.

`onReady(grid)` is called once with the core `Grid` after mount. It is a
**prop**, not a declared emit — bind it as `:on-ready="fn"` in a template:

```vue
<SheetwriteGrid :workbook="workbook" :on-ready="(grid) => grid.search('foo')" />
```

Emits:

- `change` — committed edits (`ChangeEvent`).
- `selection` — the new selection (`Selection | null`).
- `scroll` — the visible row window on scroll.
- `edit-begin` — a cell editor opened.
- `edit-commit` — a cell editor committed.
- `search` — the active search result changed.
- `active-sheet` — the visible sheet changed (`{ sheet: SheetId }`).

## Imperative handle

`setup` calls `expose({ getGrid: () => grid })`, so a template ref reaches the
core `Grid` for imperative control:

```vue
<template>
  <SheetwriteGrid ref="gridRef" :workbook="workbook" :data="data" />
</template>
<script setup lang="ts">
import { ref } from "vue";
const gridRef = ref();
// gridRef.value?.getGrid()?.search("foo");
</script>
```

The handle returned by `getGrid()` exposes the core data-view and geometry API:
`sortByMulti`, `setColumnFilter`, `distinctValues`, `hideRows`/`showRows`, row
groups, `setFrozen`, and `setZoom`. Views are non-mutating; `clearView()` clears
sort/filter state but preserves explicitly hidden rows and collapsed groups. See
[Data operations](../../docs/data-operations.md).

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
