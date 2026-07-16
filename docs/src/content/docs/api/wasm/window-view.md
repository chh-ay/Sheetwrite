---
title: "WindowView | @sheetwrite/wasm"
description: "A bulk window of resolved cells, row-major over nrows x ncols."
---
<!-- api-export:@sheetwrite/wasm|.|WindowView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

A bulk window of resolved cells, row-major over `n_rows x n_cols`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L253</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>11</span>

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

<details class="api-member" id="window-view-take-cond-matches" data-pagefind-weight="1">
<summary><code>takeCondMatches</code> <span class="api-member-summary">Consume and return per-cell conditional-format rule bitmasks; empty when the sheet has no rules.</span></summary>

```ts generated
takeCondMatches: () => Uint32Array;
```

</details>

<details class="api-member" id="window-view-take-kinds" data-pagefind-weight="1">
<summary><code>takeKinds</code> <span class="api-member-summary">Consume and return the per-cell tag array: 0 empty, 1 number, 2 string.</span></summary>

```ts generated
takeKinds: () => Uint8Array;
```

</details>

<details class="api-member" id="window-view-take-numbers" data-pagefind-weight="1">
<summary><code>takeNumbers</code> <span class="api-member-summary">Consume and return per-cell numeric payloads (valid where kind == 1).</span></summary>

```ts generated
takeNumbers: () => Float64Array;
```

</details>

<details class="api-member" id="window-view-take-string-ids" data-pagefind-weight="1">
<summary><code>takeStringIds</code> <span class="api-member-summary">Consume and return per-cell GLOBAL string-pool ids; u32::MAX means none.</span></summary>

```ts generated
takeStringIds: () => Uint32Array;
```

</details>

<details class="api-member" id="window-view-take-string-index" data-pagefind-weight="1">
<summary><code>takeStringIndex</code> <span class="api-member-summary">Consume and return per-cell indices into strings (string cells only).</span></summary>

```ts generated
takeStringIndex: () => Int32Array;
```

</details>

<details class="api-member" id="window-view-take-strings" data-pagefind-weight="1">
<summary><code>takeStrings</code> <span class="api-member-summary">Consume and return unique strings referenced by this window.</span></summary>

```ts generated
takeStrings: () => string[];
```

</details>

<details class="api-member" id="window-view-take-style-dict" data-pagefind-weight="1">
<summary><code>takeStyleDict</code> <span class="api-member-summary">Consume and return the unique global style-dictionary ids referenced by this window, in local-index order; the host maps each to a CellStyle.</span></summary>

```ts generated
takeStyleDict: () => Uint32Array;
```

</details>

<details class="api-member" id="window-view-take-style-index" data-pagefind-weight="1">
<summary><code>takeStyleIndex</code> <span class="api-member-summary">Consume and return per-cell WINDOW-LOCAL style indices into the dict.</span></summary>

```ts generated
takeStyleIndex: () => Uint32Array
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
  takeCondMatches: () => Uint32Array;
  takeKinds: () => Uint8Array;
  takeNumbers: () => Float64Array;
  takeStringIds: () => Uint32Array;
  takeStringIndex: () => Int32Array;
  takeStrings: () => string[];
  takeStyleDict: () => Uint32Array;
  takeStyleIndex: () => Uint32Array;
}
```

</details>
