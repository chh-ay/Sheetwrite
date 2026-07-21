---
title: "SourceSnapshot | @sheetwrite/wasm"
description: "Compact serializable projection of persisted derived-cell sources in one range."
---
<!-- api-export:@sheetwrite/wasm|.|SourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Compact serializable projection of persisted derived-cell sources in one
range. Offsets are row-major and sorted; reference targets are packed
`[sheet_handle, row, col]` triples.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L339</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="source-snapshot-byte-length" data-pagefind-weight="1">
<summary><code>byteLength</code></summary>

```ts generated
byteLength: () => number;
```

</details>

<details class="api-member" id="source-snapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>formulaOffsets</code></summary>

```ts generated
formulaOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-formula-sources" data-pagefind-weight="1">
<summary><code>formulaSources</code></summary>

```ts generated
formulaSources: () => string[];
```

</details>

<details class="api-member" id="source-snapshot-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="source-snapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>referenceOffsets</code></summary>

```ts generated
referenceOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-reference-targets" data-pagefind-weight="1">
<summary><code>referenceTargets</code></summary>

```ts generated
referenceTargets: () => Uint32Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SourceSnapshot {
  byteLength: () => number;
  formulaOffsets: () => Uint32Array;
  formulaSources: () => string[];
  free: () => void;
  referenceOffsets: () => Uint32Array;
  referenceTargets: () => Uint32Array;
}
```

</details>
