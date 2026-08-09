---
title: "WindowView | @sheetwrite/wasm"
description: "A bulk window of resolved cells, row-major over nrows x ncols."
---
<!-- api-export:@sheetwrite/wasm|.|WindowView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

A bulk window of resolved cells, row-major over `n_rows x n_cols`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L367</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="window-view-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="window-view-n-cols" data-pagefind-weight="1">
<summary><code>nCols</code></summary>

```ts generated
nCols: number;
```

</details>

<details class="api-member" id="window-view-n-rows" data-pagefind-weight="1">
<summary><code>nRows</code></summary>

```ts generated
nRows: number;
```

</details>

<details class="api-member" id="window-view-take-packed" data-pagefind-weight="1">
<summary><code>takePacked</code> <span class="api-member-summary">Consume the complete fixed-width window payload.</span></summary>

```ts generated
takePacked: () => Uint8Array;
```

<p class="api-member-doc">Consume the complete fixed-width window payload. The returned
`Uint8Array` is copied by wasm-bindgen into JS-owned memory.</p>
</details>

<details class="api-member" id="window-view-take-strings" data-pagefind-weight="1">
<summary><code>takeStrings</code> <span class="api-member-summary">Consume formula-error sentinel strings referenced by the packed data.</span></summary>

```ts generated
takeStrings: () => string[]
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class WindowView {
  free: () => void;
  nCols: number;
  nRows: number;
  takePacked: () => Uint8Array;
  takeStrings: () => string[];
}
```

</details>
