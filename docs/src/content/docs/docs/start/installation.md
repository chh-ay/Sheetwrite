---
title: Installation
description: Install Sheetwrite for vanilla TypeScript, React, Vue, or Svelte and initialize its WebAssembly runtime.
---
Sheetwrite has two first-run paths.

## Choose your integration

Use the **Framework** selector in the site header to choose Vanilla, React, Vue,
or Svelte. It opens the matching focused guide and remembers the choice, so
framework-specific installation, lifecycle, events, and examples stay together
instead of being repeated throughout the documentation.

All framework adapters initialize WASM after client mount; importing or
server-rendering a component does not start initialization. Their shared
`defaultRows`, readiness, reset, and transaction contracts are covered in the
selected framework guide.

Use the imperative engine below when the host owns DOM lifetime directly.

## Imperative engine

```sh verify title="Verified command"
bun add @sheetwrite/core
```

```ts partial="requires surrounding host state" title="Partial example"
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

await initSheetwrite();
const grid = createGrid(document.querySelector("#grid")!, { workbook, data });
```

Zero-argument `initSheetwrite()` is canonical. It is re-entrant: concurrent calls share one initialization, retries work after failure, and repeats after success are no-ops. Node reads the co-located binary; browser bundlers select a browser-only loader graph with no `node:` imports.

## Explicit asset control

Pass a source only for unsupported bundlers, public-asset policies, or controlled delivery:

```ts partial="requires surrounding host state" title="Partial example"
await initSheetwrite(source);
```

Accepted sources are `BufferSource | URL | string | Request | WebAssembly.Module`. The raw binary remains exported as `@sheetwrite/wasm/wasm`.

Examples:

```ts partial="requires surrounding host state" title="Partial example"
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

Worker rendering and XLSX export remain explicit advanced features. Import the
worker entry from `@sheetwrite/core/worker`. XLSX requires the separate
`@sheetwrite/xlsx` package and `import "@sheetwrite/xlsx/register"` before a
toolbar or programmatic export; see [Worker rendering](/docs/guides/worker-rendering/)
and the [export documentation](/docs/guides/data-operations/#export).
