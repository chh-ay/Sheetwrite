---
title: "@sheetwrite/core/adapter"
description: "API reference for @sheetwrite/core/adapter."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/adapter`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/adapter.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>20</dd></div>
</dl>

Source entry: `packages/core/src/adapter.ts`

## Exported symbols

### Functions <span class="api-count">6</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/apply-changed-live-grid-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>applyChangedLiveGridOptions</code></span><span class="api-symbol-card__desc">Applies live-updatable adapter option changes to an existing Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/create-grid-controller/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createGridController</code></span><span class="api-symbol-card__desc">Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters (and any plain host) share a single, drift-free implementation instead of each re-deriving the same create → subscribe → teardown behavior.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/create-simple-grid-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createSimpleGridInput</code></span><span class="api-symbol-card__desc">Converts simple columns and row objects into canonical workbook and columnar input.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/extract-grid-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>extractGridOptions</code></span><span class="api-symbol-card__desc">Extracts advanced GridOptions from framework adapter props.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/get-grid-reset-reason/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>getGridResetReason</code></span><span class="api-symbol-card__desc">Returns the first reset-sensitive adapter input that changed, if any.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-size-style/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>gridSizeStyle</code></span><span class="api-symbol-card__desc">Converts adapter size props into a host element style object.</span></a>
</div>

### Interfaces <span class="api-count">9</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-adapter-event-handlers/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridAdapterEventHandlers</code></span><span class="api-symbol-card__desc">Framework-neutral readiness, change, and error callbacks shared by adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-controller/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridController</code></span><span class="api-symbol-card__desc">The lifecycle handle returned by createGridController: the live grid, a theme passthrough, and a single teardown that detaches every subscription and destroys the grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-controller-handlers/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridControllerHandlers</code></span><span class="api-symbol-card__desc">Event callbacks a host (a framework adapter, or any plain app) hangs off a grid's lifecycle.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-ready-event/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridReadyEvent</code></span><span class="api-symbol-card__desc">Grid handle, generation, and reason published after adapter initialization.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/optional-grid-size-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>OptionalGridSizeProps</code></span><span class="api-symbol-card__desc">Optional width and height accepted by advanced framework adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/sheetwrite-initialization-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteInitializationProps</code></span><span class="api-symbol-card__desc">Optional explicit WASM source and initialization error callback for adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/simple-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SimpleColumn</code></span><span class="api-symbol-card__desc">Column definition accepted by the adapters’ simple row-object API.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/simple-grid-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SimpleGridInput</code></span><span class="api-symbol-card__desc">Normalized workbook and columnar data produced from simple adapter props.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/simple-sheetwrite-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SimpleSheetwriteOptions</code></span><span class="api-symbol-card__desc">Framework-neutral simple columns, rows, sizing, and grid options.</span></a>
</div>

### Types <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-ready-reason/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>GridReadyReason</code></span><span class="api-symbol-card__desc">Reason an adapter published a ready Grid generation.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-reset-reason/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>GridResetReason</code></span><span class="api-symbol-card__desc">Reset-sensitive input change that requires an adapter to replace its Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-size-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>GridSizeProps</code></span><span class="api-symbol-card__desc">Explicit width and height accepted by framework adapters.</span></a>
</div>

### Variables <span class="api-count">2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-adapter/default-simple-column-width/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>DEFAULT_SIMPLE_COLUMN_WIDTH</code></span><span class="api-symbol-card__desc">Default pixel width assigned to simple adapter columns.</span></a>
<a class="api-symbol-card" href="/docs/api/core-adapter/grid-option-policy/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>GRID_OPTION_POLICY</code></span><span class="api-symbol-card__desc">Classification of adapter options as live-updatable or reset-sensitive.</span></a>
</div>
