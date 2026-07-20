---
title: "createGridController | @sheetwrite/core/adapter"
description: "Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters (and any plain host) share a single, drift-free implementation instead of each re-deriving the same create → subscribe → teardown behavior."
---
<!-- api-export:@sheetwrite/core|./adapter|createGridController -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

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

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L104</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createGridController(
  host: HTMLElement,
  options: GridOptions,
  handlers: GridControllerHandlers,
): GridController
```

</div>
