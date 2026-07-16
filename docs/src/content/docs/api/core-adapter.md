---
title: "@sheetwrite/core/adapter"
description: "API reference for @sheetwrite/core/adapter."
tableOfContents: false
---
<span class="api-status">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/adapter`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/adapter.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>20</dd></div>
</dl>

Source entry: `packages/core/src/adapter.ts`

## Exported symbols

### Functions <span class="api-count">6</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/apply-changed-live-grid-options/"><code>applyChangedLiveGridOptions</code><span>Applies live-updatable adapter option changes to an existing Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/create-grid-controller/"><code>createGridController</code><span>Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters (and any plain host) share a single, drift-free implementation instead of each re-deriving the same create → subscribe → teardown behavior.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/create-simple-grid-input/"><code>createSimpleGridInput</code><span>Converts simple columns and row objects into canonical workbook and columnar input.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/extract-grid-options/"><code>extractGridOptions</code><span>Extracts advanced GridOptions from framework adapter props.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/get-grid-reset-reason/"><code>getGridResetReason</code><span>Returns the first reset-sensitive adapter input that changed, if any.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-size-style/"><code>gridSizeStyle</code><span>Converts adapter size props into a host element style object.</span></a>
</div>

### Interfaces <span class="api-count">9</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-adapter-event-handlers/"><code>GridAdapterEventHandlers</code><span>Framework-neutral readiness, change, and error callbacks shared by adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-controller/"><code>GridController</code><span>The lifecycle handle returned by createGridController: the live grid, a theme passthrough, and a single teardown that detaches every subscription and destroys the grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-controller-handlers/"><code>GridControllerHandlers</code><span>Event callbacks a host (a framework adapter, or any plain app) hangs off a grid's lifecycle.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-ready-event/"><code>GridReadyEvent</code><span>Grid handle, generation, and reason published after adapter initialization.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/optional-grid-size-props/"><code>OptionalGridSizeProps</code><span>Optional width and height accepted by advanced framework adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/sheetwrite-initialization-props/"><code>SheetwriteInitializationProps</code><span>Optional explicit WASM source and initialization error callback for adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/simple-column/"><code>SimpleColumn</code><span>Column definition accepted by the adapters’ simple row-object API.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/simple-grid-input/"><code>SimpleGridInput</code><span>Normalized workbook and columnar data produced from simple adapter props.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/simple-sheetwrite-options/"><code>SimpleSheetwriteOptions</code><span>Framework-neutral simple columns, rows, sizing, and grid options.</span></a>
</div>

### Types <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-ready-reason/"><code>GridReadyReason</code><span>Reason an adapter published a ready Grid generation.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-reset-reason/"><code>GridResetReason</code><span>Reset-sensitive input change that requires an adapter to replace its Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-size-props/"><code>GridSizeProps</code><span>Explicit width and height accepted by framework adapters.</span></a>
</div>

### Variables <span class="api-count">2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/default-simple-column-width/"><code>DEFAULT_SIMPLE_COLUMN_WIDTH</code><span>Default pixel width assigned to simple adapter columns.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-option-policy/"><code>GRID_OPTION_POLICY</code><span>Classification of adapter options as live-updatable or reset-sensitive.</span></a>
</div>
