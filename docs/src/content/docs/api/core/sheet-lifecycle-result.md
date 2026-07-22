---
title: "SheetLifecycleResult | @sheetwrite/core"
description: "Actionable transaction outcome for a stable sheet lifecycle target."
---
<!-- api-export:@sheetwrite/core|.|SheetLifecycleResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Actionable transaction outcome for a stable sheet lifecycle target.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L385</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetLifecycleResult = ApplyTransactionResult & {
  readonly sheet: SheetId;
};
```

</div>
