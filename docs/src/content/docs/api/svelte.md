---
title: "@sheetwrite/svelte"
description: "API reference for @sheetwrite/svelte."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/svelte`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./src/index.ts</code></dd></div>
<div><dt>Exports</dt><dd>14</dd></div>
</dl>

Source entry: `packages/svelte/src/index.ts`

## Exported symbols

### Interfaces <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/svelte/cell-editor/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CellEditor</code></span><span class="api-symbol-card__desc">Framework-neutral named editor definition registered through GridOptions.editors.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/cell-editor-context/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CellEditorContext</code></span><span class="api-symbol-card__desc">Immutable state and guarded completion callbacks for one mounted editor.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/cell-editor-instance/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CellEditorInstance</code></span><span class="api-symbol-card__desc">Retained lifecycle returned by a custom editor's mount method.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/grid/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>Grid</code></span><span class="api-symbol-card__desc">Imperative grid handle for document commands, events, rendering, and teardown.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/grid-command-state/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridCommandState</code></span><span class="api-symbol-card__desc">Observable availability and selection-derived activity for one command.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/grid-ready-event/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridReadyEvent</code></span><span class="api-symbol-card__desc">Grid handle, generation, and reason published after adapter initialization.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/sheetwrite-grid-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteGridProps</code></span><span class="api-symbol-card__desc">Advanced framework adapter props for workbook data or datasource ownership.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/simple-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SimpleColumn</code></span><span class="api-symbol-card__desc">Column definition accepted by the adapters’ simple row-object API.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/svelte/cell-editor-navigation/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>CellEditorNavigation</code></span><span class="api-symbol-card__desc">Selection movement applied after a successful editor commit.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/cell-scalar/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>CellScalar</code></span><span class="api-symbol-card__desc">A scalar that can be displayed directly.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/grid-command-name/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>GridCommandName</code></span><span class="api-symbol-card__desc">Built-in command names accepted by state queries and change events.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/sheetwrite-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>SheetwriteProps</code></span><span class="api-symbol-card__desc">Simple framework adapter props for columns and default row objects.</span></a>
</div>

### Variables <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/svelte/sheetwrite/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>Sheetwrite</code></span><span class="api-symbol-card__desc">Convenience component for local object rows.</span></a>
<a class="api-symbol-card" href="/docs/api/svelte/sheetwrite-grid/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>SheetwriteGrid</code></span><span class="api-symbol-card__desc">Advanced framework component for workbook data or datasource input.</span></a>
</div>
