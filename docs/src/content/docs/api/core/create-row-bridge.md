---
title: "createRowBridge | @sheetwrite/core"
description: "Create a typed bridge while preserving row and identity inference."
---
<!-- api-export:@sheetwrite/core|.|createRowBridge -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Create a typed bridge while preserving row and identity inference.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L859</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createRowBridge<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(options: RowBridgeOptions<Row, Id>): RowBridge<Id>
```

</div>
