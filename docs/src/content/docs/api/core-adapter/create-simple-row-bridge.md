---
title: "createSimpleRowBridge | @sheetwrite/core/adapter"
description: "Creates the optional row bridge for a simple data-first input."
---
<!-- api-export:@sheetwrite/core|./adapter|createSimpleRowBridge -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Creates the optional row bridge for a simple data-first input.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L258</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createSimpleRowBridge<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(
  options: SimpleSheetwriteOptions<Row, Id>,
): RowBridgeInstance<Id> | undefined
```

</div>
