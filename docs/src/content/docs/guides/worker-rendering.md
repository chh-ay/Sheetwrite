---
title: Worker rendering
description: Configure OffscreenCanvas worker painting and understand capability-based main-thread fallback.
---

[Installation](/docs/start/installation/)

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

**Universal (any bundler, no bundler):** the worker entry is an ES module with
relative imports (`./canvas-paint.js`, …), so a single-file copy breaks — copy
the package's whole `dist/` directory into your public/static assets and pass
the served `worker.js` URL (a module worker fetches its sibling imports over
HTTP):

```sh verify title="Verified command"
cp -r node_modules/@sheetwrite/core/dist public/sheetwrite
```

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
import { createGrid, initSheetwrite } from "@sheetwrite/core";

await initSheetwrite();

const grid = createGrid(host, {
  workbook,
  datasource,
  renderer: "worker",
  workerUrl: "/sheetwrite/worker.js",
});
```

**Vite dependency-worker import (machine-verified):** Vite bundles the whole
worker graph into one chunk and returns its URL via the `?worker&url` query —
verified by the fixture build in `test/bundler-fixtures/vite`
(`bun run verify:bundlers`):

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
import workerUrl from "@sheetwrite/core/worker?worker&url";
```

webpack 5 / Next.js have no equivalent URL-returning dependency-worker import
(webpack only bundles a worker graph for a literal
`new Worker(new URL(...))` expression, which Sheetwrite constructs internally)
— use the public-copy recipe above there.

`workerUrl` accepts a `string | URL`. If you omit it, the worker renderer
resolves `./worker.js` relative to its own module — that only works when your
bundler preserves module URLs (it usually does not after bundling to one file).

## Verify it actually started

A worker that fails to construct falls back to the main-thread canvas renderer
(see below) — verify instead of assuming:

```ts prelude="wasm" partial="requires surrounding host state" title="Partial example"
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
empty. If you rely on custom [`CellRenderer`](/docs/guides/configuration/#gridoptions)s,
use the main-thread `canvas` renderer.

## See also

- [Configuration](/docs/guides/configuration/#gridoptions) for `renderer` and `workerUrl`.
- [Concepts](/docs/concepts/runtime-ownership/#canvas-rendering-the-wasm-columnar-store) for the transferable window snapshot.
