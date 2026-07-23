---
title: "StoreMemoryBreakdown | @sheetwrite/core"
description: "Decoded, fail-closed retained-memory ownership report from the WASM store."
---
<!-- api-export:@sheetwrite/core|.|StoreMemoryBreakdown -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Decoded, fail-closed retained-memory ownership report from the WASM store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L58</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="store-memory-breakdown-protocol-version" data-pagefind-weight="1">
<summary><code>protocolVersion</code></summary>

```ts generated
readonly protocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
```

</details>

<details class="api-member" id="store-memory-breakdown-hash-table-estimate-version" data-pagefind-weight="1">
<summary><code>hashTableEstimateVersion</code></summary>

```ts generated
readonly hashTableEstimateVersion: typeof STORE_MEMORY_HASH_ESTIMATE_VERSION;
```

</details>

<details class="api-member" id="store-memory-breakdown-owners" data-pagefind-weight="1">
<summary><code>owners</code></summary>

```ts generated
readonly owners: readonly ResourceOwnerBytes[];
```

</details>

<details class="api-member" id="store-memory-breakdown-logical-live-bytes" data-pagefind-weight="1">
<summary><code>logicalLiveBytes</code></summary>

```ts generated
readonly logicalLiveBytes: number;
```

</details>

<details class="api-member" id="store-memory-breakdown-allocated-capacity-bytes" data-pagefind-weight="1">
<summary><code>allocatedCapacityBytes</code></summary>

```ts generated
readonly allocatedCapacityBytes: number;
```

</details>

<details class="api-member" id="store-memory-breakdown-wasm-committed-bytes" data-pagefind-weight="1">
<summary><code>wasmCommittedBytes</code> <span class="api-member-summary">Linear-memory pages are a runtime observation and are never summed into live payload.</span></summary>

```ts generated
readonly wasmCommittedBytes: number | null;
```

</details>

<details class="api-member" id="store-memory-breakdown-allocator-margin-bytes" data-pagefind-weight="1">
<summary><code>allocatorMarginBytes</code> <span class="api-member-summary">Allocator internals are intentionally not fabricated from sizeofval.</span></summary>

```ts generated
readonly allocatorMarginBytes: number | null;
```

<p class="api-member-doc">Allocator internals are intentionally not fabricated from `size_of_val`.</p>
</details>

<details class="api-member" id="store-memory-breakdown-unaccounted-bytes" data-pagefind-weight="1">
<summary><code>unaccountedBytes</code></summary>

```ts generated
readonly unaccountedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface StoreMemoryBreakdown {
  readonly protocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
  readonly hashTableEstimateVersion: typeof STORE_MEMORY_HASH_ESTIMATE_VERSION;
  readonly owners: readonly ResourceOwnerBytes[];
  readonly logicalLiveBytes: number;
  readonly allocatedCapacityBytes: number;
  readonly wasmCommittedBytes: number | null;
  readonly allocatorMarginBytes: number | null;
  readonly unaccountedBytes: number;
}
```

</details>
