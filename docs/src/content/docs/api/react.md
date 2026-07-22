---
title: "@sheetwrite/react"
description: "API reference for @sheetwrite/react."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/react`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>19</dd></div>
</dl>

Source entry: `packages/react/src/index.tsx`

## Exported symbols

### Classes <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/react/row-bridge/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>RowBridge</code></span><span class="api-symbol-card__desc">Projects canonical document transactions into host-owned row changes.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/react/cell-editor/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CellEditor</code></span><span class="api-symbol-card__desc">Framework-neutral named editor definition registered through GridOptions.editors.</span></a>
<a class="api-symbol-card" href="/docs/api/react/cell-editor-context/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CellEditorContext</code></span><span class="api-symbol-card__desc">Immutable state and guarded completion callbacks for one mounted editor.</span></a>
<a class="api-symbol-card" href="/docs/api/react/cell-editor-instance/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>CellEditorInstance</code></span><span class="api-symbol-card__desc">Retained lifecycle returned by a custom editor's mount method.</span></a>
<a class="api-symbol-card" href="/docs/api/react/grid/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>Grid</code></span><span class="api-symbol-card__desc">Imperative grid handle for document commands, events, rendering, and teardown.</span></a>
<a class="api-symbol-card" href="/docs/api/react/grid-command-state/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridCommandState</code></span><span class="api-symbol-card__desc">Observable availability and selection-derived activity for one command.</span></a>
<a class="api-symbol-card" href="/docs/api/react/grid-ready-event/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridReadyEvent</code></span><span class="api-symbol-card__desc">Grid handle, generation, and reason published after adapter initialization.</span></a>
<a class="api-symbol-card" href="/docs/api/react/row-bridge-projection/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>RowBridgeProjection</code></span><span class="api-symbol-card__desc">Result of projection or reconciliation.</span></a>
<a class="api-symbol-card" href="/docs/api/react/sheetwrite-grid-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteGridProps</code></span><span class="api-symbol-card__desc">Advanced framework adapter props for workbook data or datasource ownership.</span></a>
<a class="api-symbol-card" href="/docs/api/react/simple-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SimpleColumn</code></span><span class="api-symbol-card__desc">Column definition accepted by the adapters’ simple row-object API.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/react/cell-editor-navigation/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>CellEditorNavigation</code></span><span class="api-symbol-card__desc">Selection movement applied after a successful editor commit.</span></a>
<a class="api-symbol-card" href="/docs/api/react/cell-scalar/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>CellScalar</code></span><span class="api-symbol-card__desc">A scalar that can be displayed directly.</span></a>
<a class="api-symbol-card" href="/docs/api/react/grid-command-name/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>GridCommandName</code></span><span class="api-symbol-card__desc">Built-in command names accepted by state queries and change events.</span></a>
<a class="api-symbol-card" href="/docs/api/react/row-bridge-delta/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>RowBridgeDelta</code></span><span class="api-symbol-card__desc">Every possible projection produced by a row bridge.</span></a>
<a class="api-symbol-card" href="/docs/api/react/row-bridge-handler/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>RowBridgeHandler</code></span><span class="api-symbol-card__desc">Callback accepted by imperative and framework adapters.</span></a>
<a class="api-symbol-card" href="/docs/api/react/row-bridge-id/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>RowBridgeId</code></span><span class="api-symbol-card__desc">A stable host identity for one data-space row.</span></a>
<a class="api-symbol-card" href="/docs/api/react/sheetwrite-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>SheetwriteProps</code></span><span class="api-symbol-card__desc">Simple framework adapter props for columns and default row objects.</span></a>
</div>

### Variables <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/react/sheetwrite/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>Sheetwrite</code></span><span class="api-symbol-card__desc">Convenience component for local object rows.</span></a>
<a class="api-symbol-card" href="/docs/api/react/sheetwrite-grid/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>SheetwriteGrid</code></span><span class="api-symbol-card__desc">Advanced framework component with inferred row-bridge identity.</span></a>
</div>
