---
title: "SheetwriteInitializationProps | @sheetwrite/core/adapter"
description: "Optional explicit WASM source and initialization error callback for adapters."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteInitializationProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Optional explicit WASM source and initialization error callback for adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L140</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-initialization-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code> <span class="api-member-summary">Explicit source passed to process-wide WASM initialization; concurrent initialization is first-source-wins.</span></summary>

```ts generated
wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
```

</details>

<details class="api-member" id="sheetwrite-initialization-props-on-initialization-error" data-pagefind-weight="1">
<summary><code>onInitializationError</code> <span class="api-member-summary">Called when WASM initialization fails while the adapter is mounted.</span></summary>

```ts generated
onInitializationError?: (error: SheetwriteError) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteInitializationProps {
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
  onInitializationError?: (error: SheetwriteError) => void;
}
```

</details>
