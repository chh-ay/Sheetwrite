---
title: "@sheetwrite/vue"
description: "API reference for @sheetwrite/vue."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/vue`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>11</dd></div>
</dl>

Source entry: `packages/vue/src/index.ts`

## Exported symbols

### Interfaces <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/vue/grid/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>Grid</code></span><span class="api-symbol-card__desc">Imperative grid handle for document commands, events, rendering, and teardown.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/grid-ready-event/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>GridReadyEvent</code></span><span class="api-symbol-card__desc">Grid handle, generation, and reason published after adapter initialization.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite-grid-emits/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteGridEmits</code></span><span class="api-symbol-card__desc">Event payloads emitted by the Vue components, keyed by template event name.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite-grid-expose/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteGridExpose</code></span><span class="api-symbol-card__desc">Imperative Grid handle exposed by the Vue advanced component.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite-grid-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteGridProps</code></span><span class="api-symbol-card__desc">Advanced Vue adapter props for workbook data or datasource ownership.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite-props/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SheetwriteProps</code></span><span class="api-symbol-card__desc">Simple Vue adapter props for columns and default row objects.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/simple-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SimpleColumn</code></span><span class="api-symbol-card__desc">Column definition accepted by the adapters’ simple row-object API.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/vue/cell-scalar/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>CellScalar</code></span><span class="api-symbol-card__desc">A scalar that can be displayed directly.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite-component-constructor/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>SheetwriteComponentConstructor</code></span><span class="api-symbol-card__desc">Vue constructor type for Sheetwrite components: Sheetwrite-owned props, emitted events exposed as on listener props, and the exposed instance surface reachable through a template ref.</span></a>
</div>

### Variables <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>Sheetwrite</code></span><span class="api-symbol-card__desc">Convenience component for local object rows with live option updates.</span></a>
<a class="api-symbol-card" href="/docs/api/vue/sheetwrite-grid/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>SheetwriteGrid</code></span><span class="api-symbol-card__desc">Advanced framework component for workbook data or datasource input.</span></a>
</div>
