---
title: "getGridResetReason | @sheetwrite/core/adapter"
description: "Returns the first reset-sensitive adapter input that changed, if any."
---
<!-- api-export:@sheetwrite/core|./adapter|getGridResetReason -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Returns the first reset-sensitive adapter input that changed, if any.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L131</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function getGridResetReason(
  previous: GridOptions,
  next: GridOptions,
): GridResetReason | null
```

</div>
