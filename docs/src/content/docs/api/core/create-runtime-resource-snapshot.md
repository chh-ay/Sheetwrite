---
title: "createRuntimeResourceSnapshot | @sheetwrite/core"
description: "Build and validate one operation-phase snapshot without double-counting runtime observations."
---
<!-- api-export:@sheetwrite/core|.|createRuntimeResourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Build and validate one operation-phase snapshot without double-counting runtime observations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L320</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createRuntimeResourceSnapshot(input: {
  operation: RuntimeResourceOperation;
  phase: RuntimeResourcePhase;
  wasm: StoreMemoryBreakdown;
  jsOwners?: readonly ResourceOwnerBytes[];
  boundary?: readonly BoundaryOperationStats[];
  runtime?: RuntimeMemoryObservation;
}): RuntimeResourceSnapshot
```

</div>
