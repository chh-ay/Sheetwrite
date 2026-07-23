---
title: "RowBridgeDelta | @sheetwrite/vue"
description: "Every possible projection produced by a row bridge."
---
<!-- api-export:@sheetwrite/vue|.|RowBridgeDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="type">type</span></div>

Every possible projection produced by a row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/row-bridge.d.ts#L112</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RowBridgeDelta<Id extends RowBridgeId = RowBridgeId> =
  | RowBridgeCellDelta<Id>
  | RowBridgeRangeDelta<Id>
  | RowBridgeClearDelta<Id>
  | RowBridgePasteDelta<Id>
  | RowBridgeFillDelta<Id>
  | RowBridgeRowStructureDelta<Id>
  | RowBridgeMetadataDelta<Id>
  | RowBridgeHostActionDelta<Id>
  | RowBridgeUnprojectableDelta<Id>;
```

</div>
