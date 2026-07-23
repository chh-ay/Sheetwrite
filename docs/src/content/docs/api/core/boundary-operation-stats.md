---
title: "BoundaryOperationStats | @sheetwrite/core"
description: "Fixed-cardinality boundary crossing counters for one operation."
---
<!-- api-export:@sheetwrite/core|.|BoundaryOperationStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Fixed-cardinality boundary crossing counters for one operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L72</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="boundary-operation-stats-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="boundary-operation-stats-ffi-calls" data-pagefind-weight="1">
<summary><code>ffiCalls</code></summary>

```ts generated
readonly ffiCalls: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-js-to-wasm-bytes" data-pagefind-weight="1">
<summary><code>jsToWasmBytes</code></summary>

```ts generated
readonly jsToWasmBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-wasm-to-js-bytes" data-pagefind-weight="1">
<summary><code>wasmToJsBytes</code></summary>

```ts generated
readonly wasmToJsBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-largest-transfer-bytes" data-pagefind-weight="1">
<summary><code>largestTransferBytes</code></summary>

```ts generated
readonly largestTransferBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-bulk-calls" data-pagefind-weight="1">
<summary><code>bulkCalls</code></summary>

```ts generated
readonly bulkCalls: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-scalar-calls" data-pagefind-weight="1">
<summary><code>scalarCalls</code></summary>

```ts generated
readonly scalarCalls: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface BoundaryOperationStats {
  readonly operation: RuntimeResourceOperation;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly largestTransferBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
}
```

</details>
