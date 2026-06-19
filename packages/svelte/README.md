# @sheetwrite/svelte

Svelte 5 adapter for Sheetwrite. It wraps the imperative core grid in a
`<SheetwriteGrid>` component that owns a host `<div>`, forwards events, and tears
the grid down on unmount. The package ships its source via the `svelte` export
condition (no prebuilt `dist`); your Svelte tooling compiles it.

## Install

```sh
bun add @sheetwrite/svelte @sheetwrite/core @sheetwrite/wasm
```

Peer dependency: `svelte >= 5`.

## Usage

Initialize WASM once at your app entry before any grid mounts (the adapter does
not initialize WASM for you):

```ts
// main.ts
import { initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { mount } from "svelte";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import App from "./App.svelte";

await initSheetwrite(wasmUrl);

const target = document.getElementById("app");
if (!target) throw new Error("missing #app host element");

mount(App, { target });
```

Then render the grid from a component:

```svelte
<script lang="ts">
import type { ColumnarData, Workbook } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/svelte";

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
</script>

<SheetwriteGrid
  {workbook}
  {data}
  onChange={(event) => console.log("changed", event.changes.length)}
  onSelectionChange={(selection) => console.log("selection", selection)}
/>
```

## Props

- `workbook` (required), `data`, `datasource`, `renderer`, `theme`, `readOnly`, `config` (toolbar/feature flags).
- `onChange(event)` — committed edits (`ChangeEvent`).
- `onSelectionChange(selection)` — the new selection (`Selection | null`).

## Documentation

See the [project README](../../README.md) and [docs/](../../docs/) for the full guide.
