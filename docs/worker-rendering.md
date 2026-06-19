# Worker rendering

[Docs index](./README.md)

By default Sheetwrite paints on the main thread (`renderer: "canvas"`). For sheets
where a busy main thread could stall scrolling, you can move painting onto a Web
Worker with an OffscreenCanvas — same `Renderer` contract, drop-in.

## Enabling it

Set `renderer: "worker"` and point `workerUrl` at the worker entry the way your
bundler expects. The core ships the worker at the `@sheetwrite/core/worker`
subpath; resolve it with `new URL(..., import.meta.url)` so the bundler emits and
fingerprints it:

```ts
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

await initSheetwrite(wasmUrl);

const grid = createGrid(host, {
  workbook,
  datasource,
  renderer: "worker",
  workerUrl: new URL("@sheetwrite/core/worker", import.meta.url),
});
```

`workerUrl` accepts a `string | URL`. If you omit it, the worker renderer falls
back to resolving its own entry relative to the module, but providing the
bundler-resolved URL above is the reliable form.

In the in-repo `examples/vanilla` app, append `?renderer=worker` to the URL to
toggle the worker path on.

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
