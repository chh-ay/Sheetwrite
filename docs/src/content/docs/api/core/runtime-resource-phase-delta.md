---
title: "RuntimeResourcePhaseDelta | @sheetwrite/core"
description: "Owner and runtime deltas between two phases of the same operation."
---
<!-- api-export:@sheetwrite/core|.|RuntimeResourcePhaseDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Owner and runtime deltas between two phases of the same operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L122</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="runtime-resource-phase-delta-schema-version" data-pagefind-weight="1">
<summary><code>schemaVersion</code></summary>

```ts generated
readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from: RuntimeResourcePhase;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to: RuntimeResourcePhase;
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-owners" data-pagefind-weight="1">
<summary><code>owners</code></summary>

```ts generated
readonly owners: readonly ResourceOwnerDelta[];
```

</details>

<details class="api-member" id="runtime-resource-phase-delta-runtime" data-pagefind-weight="1">
<summary><code>runtime</code></summary>

```ts generated
readonly runtime: { readonly usedJSHeapSize: number | null; readonly arrayBufferBytes: number | null; readonly externalBytes: number | null; readonly browserBackingStoreBytes: number | null; };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RuntimeResourcePhaseDelta {
  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly operation: RuntimeResourceOperation;
  readonly from: RuntimeResourcePhase;
  readonly to: RuntimeResourcePhase;
  readonly owners: readonly ResourceOwnerDelta[];
  readonly runtime: {
    readonly usedJSHeapSize: number | null;
    readonly arrayBufferBytes: number | null;
    readonly externalBytes: number | null;
    readonly browserBackingStoreBytes: number | null;
  };
}
```

</details>
