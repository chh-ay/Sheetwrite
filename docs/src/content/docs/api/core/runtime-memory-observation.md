---
title: "RuntimeMemoryObservation | @sheetwrite/core"
description: "Available runtime-level memory observations, kept separate from retained owner totals."
---
<!-- api-export:@sheetwrite/core|.|RuntimeMemoryObservation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Available runtime-level memory observations, kept separate from retained owner totals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L95</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="runtime-memory-observation-used-jsheap-size" data-pagefind-weight="1">
<summary><code>usedJSHeapSize</code></summary>

```ts generated
readonly usedJSHeapSize: number | null;
```

</details>

<details class="api-member" id="runtime-memory-observation-array-buffer-bytes" data-pagefind-weight="1">
<summary><code>arrayBufferBytes</code></summary>

```ts generated
readonly arrayBufferBytes: number | null;
```

</details>

<details class="api-member" id="runtime-memory-observation-external-bytes" data-pagefind-weight="1">
<summary><code>externalBytes</code></summary>

```ts generated
readonly externalBytes: number | null;
```

</details>

<details class="api-member" id="runtime-memory-observation-browser-backing-store-bytes" data-pagefind-weight="1">
<summary><code>browserBackingStoreBytes</code></summary>

```ts generated
readonly browserBackingStoreBytes: number | null;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RuntimeMemoryObservation {
  readonly usedJSHeapSize: number | null;
  readonly arrayBufferBytes: number | null;
  readonly externalBytes: number | null;
  readonly browserBackingStoreBytes: number | null;
}
```

</details>
