---
title: "@sheetwrite/wasm"
description: "API reference for @sheetwrite/wasm."
tableOfContents: false
---
<span class="api-status">internal</span>

**Internal/transitive entry point; application code normally does not import it directly.** Import this entry point as `@sheetwrite/wasm`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./loader.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>11</dd></div>
</dl>

Source entry: `packages/wasm/loader.d.ts`

## Exported symbols

### Classes <span class="api-count">5</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/cell-out/"><code>CellOut</code><span>Result of a single-cell read.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/cell-store/"><code>CellStore</code><span>The workbook-wide store: every sheet, one string pool.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/distinct-column/"><code>DistinctColumn</code><span>Distinct-value scan result for one column: parallel kind/number/text arrays whose buffers are surrendered once through the take accessors.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/range-snapshot/"><code>RangeSnapshot</code><span>Opaque, store-local history payload for one dense rectangular cell block.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/window-view/"><code>WindowView</code><span>A bulk window of resolved cells, row-major over nrows x ncols.</span></a>
</div>

### Functions <span class="api-count">3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/init-sync/"><code>initSync</code><span>Instantiates the given module, which can either be bytes or a precompiled WebAssembly.Module.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/is-loaded/"><code>isLoaded</code><span>Whether the WASM module has finished initializing.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/load/"><code>load</code><span>Initialize the WASM module.</span></a>
</div>

### Interfaces <span class="api-count">1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/init-output/"><code>InitOutput</code><span>Result of module initialization: the instantiated exports plus the shared linear memory.</span></a>
</div>

### Types <span class="api-count">2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/init-input/"><code>InitInput</code><span>Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled WebAssembly.Module.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/sync-init-input/"><code>SyncInitInput</code><span>Sources accepted by synchronous initialization: raw module bytes or a precompiled WebAssembly.Module.</span></a>
</div>
