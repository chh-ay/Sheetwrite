# Worker rendering

[Docs index](./README.md)

By default Sheetwrite paints on the main thread (`renderer: "canvas"`). For sheets
where a busy main thread could stall scrolling, you can move painting onto a Web
Worker with an OffscreenCanvas — same `Renderer` contract, drop-in.

## Enabling it

Set `renderer: "worker"` and point `workerUrl` at the worker module **as the
browser will fetch it**. The worker entry ships at
`@sheetwrite/core/dist/worker.js` (export subpath `@sheetwrite/core/worker`),
but the platform `Worker`/`URL` constructors do not consult package exports —
`new URL("@sheetwrite/core/worker", import.meta.url)` treats the bare
specifier as a relative path and produces a 404 URL unless your bundler
happens to rewrite that exact form. Two reliable recipes:

**Universal (any bundler, no bundler):** copy
`node_modules/@sheetwrite/core/dist/worker.js` into your public/static assets
and pass its served URL:

```ts
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

await initSheetwrite(wasmUrl);

const grid = createGrid(host, {
  workbook,
  datasource,
  renderer: "worker",
  workerUrl: "/assets/sheetwrite-worker.js",
});
```

**Bundler dependency-worker import (verify against your bundler version):**
Vite supports importing a worker URL from a dependency with the
`?worker&url` query — verify against your Vite version (plan is to pin this
recipe once the bundler fixtures exercise it):

```ts
import workerUrl from "@sheetwrite/core/worker?worker&url";
```

`workerUrl` accepts a `string | URL`. If you omit it, the worker renderer
resolves `./worker.js` relative to its own module — that only works when your
bundler preserves module URLs (it usually does not after bundling to one file).

## Verify it actually started

A worker that fails to construct falls back to the main-thread canvas renderer
(see below) — verify instead of assuming:

```ts
grid.on("renderer-fallback", ({ error }) => {
  console.warn("Sheetwrite worker renderer unavailable, using canvas:", error);
});

if (grid.rendererKind() !== "worker") {
  // main-thread rendering is active
}
```


## How it works

- On mount the renderer constructs the `Worker`, creates a `<canvas>`, and
  transfers control of it to the worker with `transferControlToOffscreen()`. The
  worker paints into that `OffscreenCanvas` off the main thread.
- Layout, theme, viewport, and each painted window are posted to the worker as
  messages. The window snapshot is the same typed-array-backed `VisibleWindowView`
  the store produces, so it is cheap to transfer.
- Painting therefore continues smoothly even when the main thread is busy.

## Automatic fallback

The worker is constructed **first**, before the canvas is transferred. If
construction throws — no `OffscreenCanvas` support, or a bundler/security
restriction on the worker URL — the grid silently falls back to the main-thread
`CanvasRenderer`. You always get a working grid; worker rendering is an
enhancement, never a hard requirement.

## Limitation: no custom renderers

Custom cell renderers are functions, and functions can not cross the worker
boundary. Under `renderer: "worker"` the `renderers` option (and
`defineCellRenderer`) have no effect — the worker's renderer registry is always
empty. If you rely on custom [`CellRenderer`](./configuration.md#gridoptions)s,
use the main-thread `canvas` renderer.

## See also

- [Configuration](./configuration.md#gridoptions) for `renderer` and `workerUrl`.
- [Concepts](./concepts.md#canvas-rendering--the-wasm-columnar-store) for the transferable window snapshot.
