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
