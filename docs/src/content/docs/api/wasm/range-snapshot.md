---
title: "RangeSnapshot | @sheetwrite/wasm"
description: "Opaque, store-local history payload for one dense rectangular cell block."
---
<!-- api-export:@sheetwrite/wasm|.|RangeSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Opaque, store-local history payload for one dense rectangular cell block.

The host may retain this object in undo history, but it is deliberately not
part of the serialized document protocol. String payloads remain interned in
the owning `CellStore`, so snapshots must only be restored into that store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L337</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="range-snapshot-byte-length" data-pagefind-weight="1">
<summary><code>byteLength</code></summary>

```ts generated
byteLength: () => number;
```

</details>

<details class="api-member" id="range-snapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>formulaOffsets</code></summary>

```ts generated
formulaOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-formula-sources" data-pagefind-weight="1">
<summary><code>formulaSources</code></summary>

```ts generated
formulaSources: () => string[];
```

</details>

<details class="api-member" id="range-snapshot-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="range-snapshot-kinds" data-pagefind-weight="1">
<summary><code>kinds</code></summary>

```ts generated
kinds: () => Uint8Array;
```

</details>

<details class="api-member" id="range-snapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>referenceOffsets</code></summary>

```ts generated
referenceOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-reference-targets" data-pagefind-weight="1">
<summary><code>referenceTargets</code></summary>

```ts generated
referenceTargets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code></summary>

```ts generated
styleIds: () => Uint32Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class RangeSnapshot {
  byteLength: () => number;
  formulaOffsets: () => Uint32Array;
  formulaSources: () => string[];
  free: () => void;
  kinds: () => Uint8Array;
  referenceOffsets: () => Uint32Array;
  referenceTargets: () => Uint32Array;
  styleIds: () => Uint32Array;
}
```

</details>
