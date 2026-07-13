# Getting started

Sheetwrite has two first-run paths.

## Framework components

Install one adapter:

```sh
bun add @sheetwrite/react
# or: bun add @sheetwrite/vue
# or: bun add @sheetwrite/svelte
```

React:

```tsx
import { Sheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";

<Sheetwrite
  columns={[
    { key: "name", title: "Name" },
    { key: "price", title: "Price", type: "currency" },
  ]}
  defaultRows={products}
  height={500}
  onGridChange={(event) => event.source === "local" && save(event.transaction.patches)}
/>;
```

Vue uses `:columns`, `:default-rows`, and `@grid-change`; Svelte uses the corresponding camel-case props and `onGridChange`. The adapters initialize WASM on client mount. Importing or server-rendering a component does not start initialization.

`defaultRows` is an uncontrolled seed. It is not mutated or synchronized after construction. Changing its identity intentionally resets the grid. `height` supplies a fixed host height; `fill` occupies an ancestor that already has available height and applies `min-height: 0`.

Use `SheetwriteGrid` for advanced `workbook` with `data` or `datasource`. The imperative handle is published before the readiness event. Readiness is `{ grid, generation, reason }`, where reason is `initial`, `input-reset`, or `renderer-reset`.

## Imperative engine

```sh
bun add @sheetwrite/core
```

```ts
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

await initSheetwrite();
const grid = createGrid(document.querySelector("#grid")!, { workbook, data });
```

Zero-argument `initSheetwrite()` is canonical. It is re-entrant: concurrent calls share one initialization, retries work after failure, and repeats after success are no-ops. Node reads the co-located binary; browser bundlers select a browser-only loader graph with no `node:` imports.

## Explicit asset control

Pass a source only for unsupported bundlers, public-asset policies, or controlled delivery:

```ts
await initSheetwrite(source);
```

Accepted sources are `BufferSource | URL | string | Request | WebAssembly.Module`. The raw binary remains exported as `@sheetwrite/wasm/wasm`.

Examples:

```ts
// Vite-family explicit URL
import wasmUrl from "@sheetwrite/wasm/wasm?url";
await initSheetwrite(wasmUrl);

// Bun explicit file asset
import wasmFile from "@sheetwrite/wasm/wasm" with { type: "file" };
await initSheetwrite(wasmFile);

// webpack explicit asset URL
await initSheetwrite(new URL("@sheetwrite/wasm/wasm", import.meta.url));

// Public-copy fallback
await initSheetwrite("/sheetwrite_wasm_bg.wasm");
```

webpack and Next.js need no `IgnorePlugin`; package export conditions keep Node filesystem code out of browser graphs.

## Loading and failure UI

React uses `fallback`; Vue and Svelte use their fallback content/slot conventions. Initialization errors are observable through `onInitializationError` or Vue's `initialization-error`. A changed explicit source or remount can retry after failure.

## Advanced feature assets

Worker rendering and XLSX export remain explicit advanced features. Import worker and XLSX entrypoints from `@sheetwrite/core`; see [Worker rendering](./worker-rendering.md) and the export documentation.
