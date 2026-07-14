---
title: "createGridController | @sheetwrite/core/adapter"
description: "Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters (and any plain host) share a single, drift-free implementation instead of each re-deriving the same create → subscribe → teardown behavior."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|createGridController -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">function</span>

Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters
(and any plain host) share a single, drift-free implementation instead of
each re-deriving the same create → subscribe → teardown behavior.

`initSheetwrite()` MUST already have been awaited; `createGrid` throws
otherwise.

### Live handlers
`handlers` is held **by reference**, not copied. Every event reads the
object's *current* fields (`handlers.onGridChange?.(…)`), so a host swaps
callbacks across renders by **mutating the fields of the same object** it
passed in — never by replacing the object, which the controller would not
see. This is what lets a framework feed fresh closures each render without
tearing the grid down and rebuilding it.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L92</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(host: HTMLElement, options: GridOptions, handlers: GridControllerHandlers): GridController => ;
```
