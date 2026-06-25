# Framework integration

[Docs index](./README.md)

Each adapter is a thin wrapper: it owns a host `<div>`, creates the imperative
core grid on mount, forwards events, and tears it down on unmount. None of them
render cells — that is all canvas. In every framework you must
`await initSheetwrite(wasmUrl)` **once** before the grid mounts (see
[Getting started](./getting-started.md#load-the-wasm-engine)).

The adapters expose different subsets of [`GridOptions`](./configuration.md#gridoptions):
React forwards all of them, while Vue and Svelte forward a curated set. The tables
below list exactly what each accepts.

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

Current integration limits:

- Sheetwrite does not ship a backend sync client, retry queue, validation layer,
  rollback UI, or conflict resolver. The host app owns API policy and calls
  `grid.store.markClean(...)` only after the server confirms the edit.
- `markClean` removes the confirmed patch objects from the dirty list. Pass the
  patch objects from `event.transaction.patches` or `grid.store.getDirty()`;
  do not reconstruct equivalent-looking objects.
- `change` events do not currently identify the input gesture that caused the
  commit. If an app must submit only blur-caused commits, the core event model
  needs a future `commitReason` field such as `"blur" | "enter" | "tab" | "paste"`.

## React — `@sheetwrite/react`

`SheetwriteGrid`'s props extend `GridOptions`, plus presentation and event props:

| Prop | Type | Notes |
| --- | --- | --- |
| …all of `GridOptions` | | `workbook`, `data`, `datasource`, `renderer`, `workerUrl`, `theme`, `readOnly`, `renderers`, `overscan`, `config`. |
| `className` | `string` | Applied to the host div. |
| `style` | `CSSProperties` | Applied to the host div (give it a height). |
| `onChange` | `(event: ChangeEvent) => void` | Forwards the `change` event. |
| `onSelectionChange` | `(selection: Selection \| null) => void` | Forwards the `selection` event's payload. |

The grid is rebuilt when the `workbook` identity changes; changing the `theme`
prop calls `setTheme`. Because the props include all of `GridOptions`, the
toolbar (`config`) and the worker renderer (`renderer`/`workerUrl`) are available
through React.

```tsx
import { initSheetwrite } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { createRoot } from "react-dom/client";
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

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
| `renderer` | `"canvas"` | |
| `theme` | `Partial<Theme>` | Re-applied via `setTheme` when it changes. |
| `readOnly` | `boolean` | |
| `renderers` | `Record<string, CellRenderer>` | |
| `overscan` | `number` | |

| Emit | Payload |
| --- | --- |
| `change` | `ChangeEvent` |
| `selection` | `Selection \| null` |

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

The Vue adapter does not surface `config` or `workerUrl`; for the built-in toolbar
or worker rendering, drive the core directly with `createGrid`.

## Svelte — `@sheetwrite/svelte`

`SheetwriteGrid` uses Svelte 5 runes and ships its source via the `svelte` export
condition. It renders a bare host `<div>`.

| Prop | Type | Default |
| --- | --- | --- |
| `workbook` | `Workbook` | required |
| `data` | `ColumnarData` | `undefined` |
| `datasource` | `DataSource` | `undefined` |
| `renderer` | `GridOptions["renderer"]` | `"canvas"` |
| `theme` | `Partial<Theme>` | `undefined` |
| `readOnly` | `boolean` | `undefined` |
| `onChange` | `(event: ChangeEvent) => void` | — |
| `onSelectionChange` | `(selection: Selection \| null) => void` | — |

```svelte
<script lang="ts">
import { SheetwriteGrid } from "@sheetwrite/svelte";
import { workbook, datasource } from "./data";
</script>

<SheetwriteGrid
  {workbook}
  {datasource}
  onSelectionChange={(sel) => console.log(sel)}
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

The Svelte adapter does not surface `config`, `workerUrl`, `renderers`, or
`overscan`; use `createGrid` directly if you need them.

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

// Serve the binary from /public and pass its URL, or use your bundler's
// asset import (see Getting started). A public path is the most portable.
const wasmUrl = "/sheetwrite_wasm_bg.wasm";

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

The adapter already creates the grid in `onMount` (client-only), so you only need
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
