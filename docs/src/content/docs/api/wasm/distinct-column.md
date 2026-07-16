---
title: "DistinctColumn | @sheetwrite/wasm"
description: "Distinct-value scan result for one column: parallel kind/number/text arrays whose buffers are surrendered once through the take accessors."
---
<!-- api-export:@sheetwrite/wasm|.|DistinctColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Distinct-value scan result for one column: parallel kind/number/text
arrays whose buffers are surrendered once through the `take*` accessors.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L213</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="distinct-column-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="distinct-column-take-kinds" data-pagefind-weight="1">
<summary><code>takeKinds</code> <span class="api-member-summary">Surrenders the per-value kind tags (number/string/boolean codes); the column keeps an empty buffer afterwards.</span></summary>

```ts generated
takeKinds: () => Uint8Array;
```

</details>

<details class="api-member" id="distinct-column-take-numbers" data-pagefind-weight="1">
<summary><code>takeNumbers</code> <span class="api-member-summary">Surrenders the numeric values aligned with the takeKinds tags.</span></summary>

```ts generated
takeNumbers: () => Float64Array;
```

</details>

<details class="api-member" id="distinct-column-take-texts" data-pagefind-weight="1">
<summary><code>takeTexts</code> <span class="api-member-summary">Surrenders the distinct strings aligned with the takeKinds tags.</span></summary>

```ts generated
takeTexts: () => string[]
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class DistinctColumn {
  free: () => void;
  takeKinds: () => Uint8Array;
  takeNumbers: () => Float64Array;
  takeTexts: () => string[];
}
```

</details>
