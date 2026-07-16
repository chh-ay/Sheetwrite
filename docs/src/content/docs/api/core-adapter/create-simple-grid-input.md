---
title: "createSimpleGridInput | @sheetwrite/core/adapter"
description: "Converts simple columns and row objects into canonical workbook and columnar input."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|createSimpleGridInput -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">function</span>

Converts simple columns and row objects into canonical workbook and columnar input.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L193</code></dd></div>
</dl>

## Signature

```ts generated
function createSimpleGridInput<Row extends Record<string, CellScalar>>(options: SimpleSheetwriteOptions<Row>): SimpleGridInput;
```
