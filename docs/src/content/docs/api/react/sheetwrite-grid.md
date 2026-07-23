---
title: "SheetwriteGrid | @sheetwrite/react"
description: "Advanced framework component with inferred row-bridge identity."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="variable">variable</span></div>

Advanced framework component with inferred row-bridge identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L391</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function SheetwriteGrid<Id extends RowBridgeId = RowBridgeId>(
  props: SheetwriteGridProps<Id> & {
    ref?: ForwardedRef<Grid>;
  },
): ReactElement
```

</div>
