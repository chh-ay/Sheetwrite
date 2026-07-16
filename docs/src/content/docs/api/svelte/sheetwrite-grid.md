---
title: "SheetwriteGrid | @sheetwrite/svelte"
description: "Advanced framework component for workbook data or datasource input."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="variable">variable</span></div>

Advanced framework component for workbook data or datasource input.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/Grid.svelte.d.ts#L7</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function SheetwriteGrid(
  this: void,
  internals: ComponentInternals,
  props: SheetwriteGridProps,
): {
  $on?(type: string, callback: (e: any) => void): () => void;
  $set?(props: Partial<SheetwriteGridProps>): void;
}
```

</div>
