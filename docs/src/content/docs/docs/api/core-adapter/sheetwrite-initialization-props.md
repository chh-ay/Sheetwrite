---
title: "SheetwriteInitializationProps | @sheetwrite/core/adapter"
description: "Optional explicit WASM source and initialization error callback for adapters."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteInitializationProps -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">interface</span>

Optional explicit WASM source and initialization error callback for adapters.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L66</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-initialization-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code></summary>
<pre><code>wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;</code></pre>
</details>

<details class="api-member" id="sheetwrite-initialization-props-on-initialization-error" data-pagefind-weight="1">
<summary><code>onInitializationError</code></summary>
<pre><code>onInitializationError?: (error: unknown) =&gt; void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SheetwriteInitializationProps {
    wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
    onInitializationError?: (error: unknown) => void;
}
```

</details>
