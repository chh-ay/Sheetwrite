---
title: "assertWorkbookTables | @sheetwrite/core"
description: "Reject an invalid or oversized live workbook before table arrays are copied to WASM."
---
<!-- api-export:@sheetwrite/core|.|assertWorkbookTables -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Reject an invalid or oversized live workbook before table arrays are copied to WASM.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/workbook-table.ts#L201</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function assertWorkbookTables(
  sheets: readonly Sheet[],
  limits?: Readonly<WorkbookTableResourceLimits>,
  reservedNames?: readonly string[],
): void
```

</div>
