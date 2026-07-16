---
title: "getGridResetReason | @sheetwrite/core/adapter"
description: "Returns the first reset-sensitive adapter input that changed, if any."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|getGridResetReason -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">function</span>

Returns the first reset-sensitive adapter input that changed, if any.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L130</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(previous: GridOptions, next: GridOptions): GridResetReason | null => ;
```
