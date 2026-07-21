---
title: "createSimpleGridInput | @sheetwrite/core/adapter"
description: "Converts simple columns and row objects into canonical workbook and columnar input."
---
<!-- api-export:@sheetwrite/core|./adapter|createSimpleGridInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Converts simple columns and row objects into canonical workbook and columnar input.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L210</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createSimpleGridInput<
  Row extends Record<string, CellScalar>,
>(options: SimpleSheetwriteOptions<Row>): SimpleGridInput
```

</div>
