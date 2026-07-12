# Framework integration

[Docs index](./README.md)

Each adapter is a thin wrapper: it owns a host `<div>`, creates the imperative
core grid on mount, forwards events, and tears it down on unmount. None of them
render cells — that is all canvas. In every framework you must
`await initSheetwrite(wasmUrl)` **once** before the grid mounts (see
[Getting started](./getting-started.md#load-the-wasm-engine)).

All three adapters forward the full [`GridOptions`](./configuration.md#gridoptions)
surface and every grid event callback. The tables below list exactly what each
accepts.

## Binding columns to API fields

Use each `Column.key` as the stable backend field name. The visible header can
change without breaking API submission:

```ts
const workbook = {
  activeSheet: "orders",
  sheets: [
    {
      id: "orders",
      name: "Orders",
      rowCount,
      columns: [
        { key: "customer_name", header: "Customer", width: 240, type: "text" },
        { key: "amount_cents", header: "Amount", width: 120, type: "number" },
      ],
    },
  ],
};
```

`ChangeEvent.changes[]` carries cell addresses by row/column index. Map the
column index through the workbook before sending the edit to your API:

```ts
import type { CellValue, ChangeEvent, Workbook } from "@sheetwrite/core";

function apiValue(value: CellValue): unknown {
  if (value.kind === "literal") return value.value;
  if (value.kind === "formula") return { kind: "formula", src: value.src };
  return { kind: "ref", target: value.target };
}

function apiPatches(event: ChangeEvent, workbook: Workbook) {
  const sheets = new Map(workbook.sheets.map((sheet) => [sheet.id, sheet]));

  return event.changes.flatMap((change) => {
    const column = sheets.get(change.addr.sheet)?.columns[change.addr.col];
    if (!column) return [];

    return [
      {
        row: change.addr.row,
        field: column.key,
        value: apiValue(change.newValue),
      },
    ];
  });
}
```

Column keys solve field identity; row identity is still your application's
contract. Use an immutable ID column, or keep an external map from Sheetwrite's
data row index to your backend record ID.

## Submitting committed edits

Persist the grid's `change` event, not a DOM `blur` event. Blur is one way an
inline edit commits, so it already produces a `change`; Enter, Tab, paste, clear,
and drag-to-fill also produce committed changes and should usually go through the
same backend path.

```tsx
import type { ChangeEvent, Grid } from "@sheetwrite/core";

let grid: Grid | null = null;

async function submitChange(event: ChangeEvent): Promise<void> {
  const patches = apiPatches(event, workbook);
  await fetch("/api/orders/cells", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patches }),
  });

  grid?.store.markClean(event.transaction.patches);
}

<SheetwriteGrid
  workbook={workbook}
  datasource={datasource}
  onReady={(created) => {
    grid = created;
  }}
  onChange={submitChange}
/>;
```

The same handler shape applies to Vue's `@change` emit and Svelte's `onChange`
prop.

Every `ChangeEvent` carries `commitReason` — the gesture/operation that
produced the commit: `"edit-blur" | "edit-enter" | "edit-tab" |
"edit-programmatic" | "paste" | "cut" | "clear" | "fill" | "structure" |
"style" | "replace" | "undo" | "redo" | "api"`. Switch on it with a default
branch (the union grows with new mutation features):

```ts
if (event.commitReason === "paste") debouncedSubmit(event);
else submitChange(event);
```

Current integration limits:

- Sheetwrite does not ship a backend sync client, retry queue, validation layer,
  rollback UI, or conflict resolver. The host app owns API policy and calls
  `grid.store.markClean(...)` only after the server confirms the edit.
- `markClean` removes the confirmed patch objects from the dirty list. Pass the
  patch objects from `event.transaction.patches` or `grid.store.getDirty()`;
  do not reconstruct equivalent-looking objects.


## Headless integration

Every built-in interaction layer is an optional default over public primitives.
A host that wants full ownership of chrome, bindings, and styling strips them
all at creation and drives the grid through methods and events:

```ts
const grid = createGrid(host, {
  workbook,
  data,
  config: {
    toolbar: false, // build your own against grid.actions
    contextMenu: false, // or pass a custom ContextMenuItem[] list
    find: false, // grid.search/findNext/replaceAll stay available
    tabs: false, // sheet switching via grid.setActiveSheet
    keyboard: false, // NO stock bindings: you own every key
  },
});

// Your own keymap, built on the same primitives the stock bindings use:
host.addEventListener("keydown", (e) => {
  const sel = grid.getSelection();
  if (e.key === "ArrowDown" && e.ctrlKey && sel?.kind === "cell") {
    const edge = grid.dataEdge(sel.addr.row, sel.addr.col, 1, 0);
    if (edge !== null) {
      grid.setSelection({ kind: "cell", addr: { ...sel.addr, row: edge } });
      grid.scrollToCell({ ...sel.addr, row: edge });
    }
  }
  if (e.key === "F2" && sel?.kind === "cell") {
    grid.beginEdit(sel.addr.row, sel.addr.col, undefined, true);
  }
});
```

To intercept only some keys and keep the stock map for the rest, pass a handler
instead of `false` — returning `true` consumes the event:

```ts
config: {
  keyboard: (e, grid) => {
    if (e.key === "s" && e.ctrlKey) {
      submitDirtyCells(grid.store.getDirty());
      return true; // consumed; stock bindings never see it
    }
    return false; // fall through to the stock Sheets-style map
  },
},
```

The primitive surface the stock layers are built on (all on `Grid`):

- **Actions**: `grid.actions.*` — clipboard (`copy/cut/paste/pasteValues`),
  formatting toggles, structure edits, undo/redo, export.
- **Search**: `search`, `findNext`, `findPrev`, `replaceCurrent`, `replaceAll`,
  `clearSearch`, plus the `search` event for your own find UI.
- **Selection/navigation**: `getSelection`, `setSelection`, `scrollToCell`,
  `dataEdge` (Ctrl+Arrow-style data-run jumps; view-aware under sort/filter).
- **Editing**: `beginEdit(row, col, initial?, selectAll?)` — with built-in
  formula autocomplete and reference highlighting while a `=` formula is open.
- **Views** (all Rust-scanned, compose together): `sortByMulti(keys)`,
  `setColumnFilter(col, filter | null)` / `getColumnFilters()`,
  `distinctValues(col, limit?)` (the data source for a filter-by-values UI),
  `hideRows`/`showRows`/`hiddenRows`, `groupRows`/`ungroupRows`/
  `setGroupCollapsed`/`rowGroups`, plus the `sortBy`/`filterBy`/`clearView`
  shorthands. View state is not undoable (Sheets parity).
- **Panes/zoom**: `setFrozen(rows, cols?)` pins leading rows/columns;
  `setZoom(z)`/`getZoom()` scales grid content (0.5–2) without touching the
  workbook's base widths/heights.
- **Area styling**: `styleRange(range, style | null)` — undoable, store-backed,
  painted in the canvas (use it instead of `highlightCells` when the styling is
  data, not a transient veil).
- **Geometry**: `setRowHeight(row, h)` (view metadata, keyed by data row under
  active views), `setColumnWidth(col, w)` (undoable patch).
- **Data**: `grid.store.applyTransaction(...)` for ingestion,
  `fromCsv`/`fromXlsx` for imports (same `ColumnarData` shape),
  `grid.store.getDirty()`/`markClean()` for backend sync, `change` events.

Built-in chrome (toolbar, find bar, context menu, tab bar, formula-assist
popup, and the cell editor's textarea) is styled through CSS classes +
`--sheetwrite-*` custom properties seeded from the theme — override them from
host CSS without forking.

## Worker renderer shared memory

The worker renderer keeps the transferable `ArrayBuffer` paint path as the
default because browsers only expose `SharedArrayBuffer` to cross-origin-isolated
pages. Hosts that want persistent shared paint buffers must serve the app with:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

When those headers make `globalThis.crossOriginIsolated === true`, Sheetwrite can
use its double-buffered `SharedArrayBuffer` protocol for packed render windows.
If a worker falls behind and both shared regions are still busy, the renderer
falls back to the normal transfer path for that frame instead of blocking the
main thread or overwriting data the worker may still be painting.

## React — `@sheetwrite/react`

`SheetwriteGrid`'s props extend `GridOptions`, plus presentation and event props:

| Prop | Type | Notes |
| --- | --- | --- |
| …all of `GridOptions` | | `workbook`, `data`, `datasource`, `renderer`, `workerUrl`, `theme`, `readOnly`, `renderers`, `overscan`, `minColumns`, `config`. |
| `className` | `string` | Applied to the host div. |
| `style` | `CSSProperties` | Applied to the host div (give it a height). |
| `onChange` | `(event: ChangeEvent) => void` | Forwards the `change` event. |
| `onSelectionChange` | `(selection: Selection \| null) => void` | Forwards the `selection` event's payload. |
| `onScroll` | `(event: GridEvents["scroll"]) => void` | Forwards the `scroll` event. |
| `onEditBegin` | `(event: GridEvents["edit-begin"]) => void` | Forwards the `edit-begin` event. |
| `onEditCommit` | `(event: GridEvents["edit-commit"]) => void` | Forwards the `edit-commit` event. |
| `onSearch` | `(result: GridEvents["search"]) => void` | Forwards the `search` event. |
| `onActiveSheetChange` | `(event: { sheet: SheetId }) => void` | Forwards the `active-sheet` event. |
| `onReady` | `(grid: Grid) => void` | Called once with the core `Grid` after creation. |
| …all other `div` attributes | `HTMLAttributes<HTMLDivElement>` | `id`, `data-*`, `aria-*`, `tabIndex`, and event handlers not claimed by the grid fall through to the host div. |

The grid is rebuilt when the `workbook` identity changes; changing the `theme`
prop calls `setTheme`. Because the props include all of `GridOptions`, the
toolbar (`config`) and the worker renderer (`renderer`/`workerUrl`) are available
through React.

```tsx
import { initSheetwrite } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { createRoot } from "react-dom/client";
// Vite-family form; per-bundler matrix: getting-started.md#load-the-wasm-engine
import wasmUrl from "@sheetwrite/wasm/wasm?url";

await initSheetwrite(wasmUrl);

createRoot(document.getElementById("app")!).render(
  <SheetwriteGrid
    workbook={workbook}
    datasource={datasource}
    style={{ height: "100%" }}
    config={{ toolbar: true }}
    onChange={(e) => console.log("change", e.changes.length)}
    onSelectionChange={(sel) => console.log(sel)}
  />,
);
```

## Vue — `@sheetwrite/vue`

`SheetwriteGrid` is a `defineComponent`. `class` and `style` fall through to the
host div.

| Prop | Type | Notes |
| --- | --- | --- |
| `workbook` | `Workbook` | Required. |
| `data` | `ColumnarData` | |
| `datasource` | `DataSource` | |
| `renderer` | `GridOptions["renderer"]` | |
| `workerUrl` | `string \| URL` | Worker renderer script URL. |
| `theme` | `Partial<Theme>` | Re-applied via `setTheme` when it changes. |
| `readOnly` | `boolean` | |
| `renderers` | `Record<string, CellRenderer>` | |
| `overscan` | `number` | |
| `minColumns` | `number` | |
| `config` | `GridOptions["config"]` | Enables the built-in toolbar. |
| `onReady` | `(grid: Grid) => void` | Called once with the grid after creation. |

| Emit | Payload |
| --- | --- |
| `change` | `ChangeEvent` |
| `selection` | `Selection \| null` |
| `scroll` | `GridEvents["scroll"]` |
| `edit-begin` | `GridEvents["edit-begin"]` |
| `edit-commit` | `GridEvents["edit-commit"]` |
| `search` | `GridEvents["search"]` |
| `active-sheet` | `{ sheet: SheetId }` |

```vue
<script setup lang="ts">
import type { ChangeEvent, Selection } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/vue";
import { workbook, datasource } from "./data";
</script>

<template>
  <SheetwriteGrid
    :workbook="workbook"
    :datasource="datasource"
    style="height: 100%"
    @change="(e: ChangeEvent) => console.log('change', e.changes.length)"
    @selection="(sel: Selection | null) => console.log(sel)"
  />
</template>
```

The Vue adapter forwards the full `GridOptions` surface, including `workerUrl`
for the worker renderer. `onReady` is a **prop** (bind `:on-ready="fn"`), not a
declared emit.

## Svelte — `@sheetwrite/svelte`

`SheetwriteGrid` uses Svelte 5 runes and ships its source via the `svelte` export
condition. It renders a bare host `<div>`.

| Prop | Type | Default |
| --- | --- | --- |
| `workbook` | `Workbook` | required |
| `data` | `ColumnarData` | `undefined` |
| `datasource` | `DataSource` | `undefined` |
| `renderer` | `GridOptions["renderer"]` | `"canvas"` |
| `workerUrl` | `string \| URL` | `undefined` |
| `theme` | `Partial<Theme>` | `undefined` |
| `readOnly` | `boolean` | `undefined` |
| `renderers` | `Record<string, CellRenderer>` | `undefined` |
| `overscan` | `number` | `undefined` |
| `minColumns` | `number` | `undefined` |
| `config` | `GridOptions["config"]` | `undefined` |
| `onChange` | `(event: ChangeEvent) => void` | — |
| `onSelectionChange` | `(selection: Selection \| null) => void` | — |
| `onScroll` | `(event: GridEvents["scroll"]) => void` | — |
| `onEditBegin` | `(event: GridEvents["edit-begin"]) => void` | — |
| `onEditCommit` | `(event: GridEvents["edit-commit"]) => void` | — |
| `onSearch` | `(result: GridEvents["search"]) => void` | — |
| `onActiveSheetChange` | `(event: { sheet: SheetId }) => void` | — |
| `onReady` | `(grid: Grid) => void` | — |
| `grid` | `Grid` (bindable via `bind:grid`) | — |

```svelte
<script lang="ts">
import { SheetwriteGrid } from "@sheetwrite/svelte";
import { workbook, datasource } from "./data";
</script>

<SheetwriteGrid
  {workbook}
  {datasource}
  renderer="worker"
  workerUrl="/sheetwrite-worker.js"
  onSelectionChange={(sel) => console.log(sel)}
  onEditCommit={(event) => console.log("committed", event.addr)}
/>
```

Initialize WASM before mounting the component, e.g. in your entry:

```ts
import { initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import { mount } from "svelte";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import App from "./App.svelte";

await initSheetwrite(wasmUrl);
mount(App, { target: document.getElementById("app")! });
```

The Svelte adapter forwards the full `GridOptions` surface — `workerUrl`,
`renderers`, `overscan`, and `minColumns` included.

## Testing components that mount the grid

Component tests on jsdom/happy-dom (React Testing Library, Vue Test Utils,
Svelte Testing Library, bun test) fail on mount with:

```
Sheetwrite: 2D canvas context is unavailable
```

Those environments provide no 2D canvas and no layout. Install the supported
stubs before mounting:

```ts
import { installCanvasTestStubs } from "@sheetwrite/core/testing";

const restore = installCanvasTestStubs(); // optionally { width, height }
// …mount, assert on grid STATE (selection, store values, DOM chrome)…
restore();
```

Nothing is painted — assert grid state, never pixels. `initSheetwrite()`
works for real under Node-based test runners (the loader reads the binary
from disk), so no store mocking is needed. Sheetwrite's own test suite runs
on this exact helper.

---

## Meta-frameworks (SSR): keep the grid client-only

Sheetwrite instantiates WebAssembly and touches the DOM, so it can not run during
server-side rendering. In any SSR framework you must ensure the grid both
**initializes** (`initSheetwrite`) and **renders** only in the browser.

### Next.js

Mark the grid component `"use client"`, and load it through `next/dynamic` with
`ssr: false` so it is never rendered on the server. Run `initSheetwrite` in an
effect before showing the grid.

```tsx
// app/sheet/grid.tsx
"use client";
import { useEffect, useState } from "react";
import { initSheetwrite } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { workbook, datasource } from "./data";

// Next.js's webpack rewrites this bare specifier into an emitted asset URL;
// alternatively copy the binary into /public at build time (see below) and
// pass "/sheetwrite_wasm_bg.wasm".
const wasmUrl = new URL("@sheetwrite/wasm/wasm", import.meta.url);

export default function Grid() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    initSheetwrite(wasmUrl).then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <SheetwriteGrid workbook={workbook} datasource={datasource} style={{ height: "100%" }} />;
}
```

```tsx
// app/sheet/page.tsx
"use client";
import dynamic from "next/dynamic";

const Grid = dynamic(() => import("./grid"), { ssr: false });

export default function Page() {
  return (
    <div style={{ height: "100dvh" }}>
      <Grid />
    </div>
  );
}
```

For the public-path alternative, put the copy step in your build (or
`postinstall`) script so the binary actually exists under `/public`:

```sh
cp node_modules/@sheetwrite/wasm/pkg/sheetwrite_wasm_bg.wasm public/
```

### Nuxt

Wrap the grid in `<ClientOnly>`, or give the component a `.client.vue` suffix so
Nuxt only renders it on the client. Call `initSheetwrite` in `onMounted`.

```vue
<!-- components/SheetGrid.client.vue -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { initSheetwrite } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/vue";
import { workbook, datasource } from "../data";

const ready = ref(false);
onMounted(async () => {
  // Copy the binary into public/ at build time (see the Next.js note above):
  //   cp node_modules/@sheetwrite/wasm/pkg/sheetwrite_wasm_bg.wasm public/
  // Nuxt runs on Vite, so the asset-import form also works:
  //   import wasmUrl from "@sheetwrite/wasm/wasm?url";
  await initSheetwrite("/sheetwrite_wasm_bg.wasm");
  ready.value = true;
});
</script>

<template>
  <ClientOnly>
    <SheetwriteGrid v-if="ready" :workbook="workbook" :datasource="datasource" style="height: 100%" />
  </ClientOnly>
</template>
```

### SvelteKit

The adapter already creates the grid in a client-only `$effect`, so you only need
to guard initialization. Run `initSheetwrite` in `onMount` and gate rendering on
the `browser` flag; optionally disable SSR for the route with
`export const ssr = false` in its `+page.ts`.

```svelte
<script lang="ts">
import { browser } from "$app/environment";
import { onMount } from "svelte";
import { initSheetwrite } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/svelte";
import wasmUrl from "@sheetwrite/wasm/wasm?url";
import { workbook, datasource } from "./data";

let ready = $state(false);
onMount(async () => {
  await initSheetwrite(wasmUrl);
  ready = true;
});
</script>

{#if browser && ready}
  <SheetwriteGrid {workbook} {datasource} />
{/if}
```

In each recipe the WASM URL is whatever your bundler or static host produces;
serving the binary from a public path and passing that string is the most
portable, while the asset-import forms in
[Getting started](./getting-started.md#load-the-wasm-engine) work where your
bundler supports them.
