---
title: "RuntimeResourceSnapshot | @sheetwrite/core"
description: "Complete retained-resource and boundary snapshot for one operation phase."
---
<!-- api-export:@sheetwrite/core|.|RuntimeResourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Complete retained-resource and boundary snapshot for one operation phase.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L111</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="runtime-resource-snapshot-schema-version" data-pagefind-weight="1">
<summary><code>schemaVersion</code></summary>

```ts generated
readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-phase" data-pagefind-weight="1">
<summary><code>phase</code></summary>

```ts generated
readonly phase: RuntimeResourcePhase;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-wasm" data-pagefind-weight="1">
<summary><code>wasm</code></summary>

```ts generated
readonly wasm: StoreMemoryBreakdown;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-js-owners" data-pagefind-weight="1">
<summary><code>jsOwners</code></summary>

```ts generated
readonly jsOwners: readonly ResourceOwnerBytes[];
```

</details>

<details class="api-member" id="runtime-resource-snapshot-boundary" data-pagefind-weight="1">
<summary><code>boundary</code></summary>

```ts generated
readonly boundary: readonly BoundaryOperationStats[];
```

</details>

<details class="api-member" id="runtime-resource-snapshot-runtime" data-pagefind-weight="1">
<summary><code>runtime</code></summary>

```ts generated
readonly runtime: RuntimeMemoryObservation;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-totals" data-pagefind-weight="1">
<summary><code>totals</code></summary>

```ts generated
readonly totals: { readonly logicalLiveBytes: number; readonly allocatedCapacityBytes: number; };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RuntimeResourceSnapshot {
  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly operation: RuntimeResourceOperation;
  readonly phase: RuntimeResourcePhase;
  readonly wasm: StoreMemoryBreakdown;
  readonly jsOwners: readonly ResourceOwnerBytes[];
  readonly boundary: readonly BoundaryOperationStats[];
  readonly runtime: RuntimeMemoryObservation;
  readonly totals: {
    readonly logicalLiveBytes: number;
    readonly allocatedCapacityBytes: number;
  };
}
```

</details>
