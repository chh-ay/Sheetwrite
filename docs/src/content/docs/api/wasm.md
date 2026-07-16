---
title: "@sheetwrite/wasm"
description: "API reference for @sheetwrite/wasm."
---
<span class="api-status" data-status="internal">internal</span>

**Internal/transitive entry point; application code normally does not import it directly.** Import this entry point as `@sheetwrite/wasm`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./loader.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>11</dd></div>
</dl>

Source entry: `packages/wasm/loader.d.ts`

## Exported symbols

### Classes <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/cell-out/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>CellOut</code></span><span class="api-symbol-card__desc">Result of a single-cell read.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/cell-store/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>CellStore</code></span><span class="api-symbol-card__desc">The workbook-wide store: every sheet, one string pool.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/distinct-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>DistinctColumn</code></span><span class="api-symbol-card__desc">Distinct-value scan result for one column: parallel kind/number/text arrays whose buffers are surrendered once through the take accessors.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/range-snapshot/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>RangeSnapshot</code></span><span class="api-symbol-card__desc">Opaque, store-local history payload for one dense rectangular cell block.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/window-view/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>WindowView</code></span><span class="api-symbol-card__desc">A bulk window of resolved cells, row-major over nrows x ncols.</span></a>
</div>

### Functions <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/init-sync/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>initSync</code></span><span class="api-symbol-card__desc">Instantiates the given module, which can either be bytes or a precompiled WebAssembly.Module.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/is-loaded/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>isLoaded</code></span><span class="api-symbol-card__desc">Whether the WASM module has finished initializing.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/load/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>load</code></span><span class="api-symbol-card__desc">Initialize the WASM module.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/init-output/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>InitOutput</code></span><span class="api-symbol-card__desc">Result of module initialization: the instantiated exports plus the shared linear memory.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/wasm/init-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>InitInput</code></span><span class="api-symbol-card__desc">Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled WebAssembly.Module.</span></a>
<a class="api-symbol-card" href="/docs/api/wasm/sync-init-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>SyncInitInput</code></span><span class="api-symbol-card__desc">Sources accepted by synchronous initialization: raw module bytes or a precompiled WebAssembly.Module.</span></a>
</div>
