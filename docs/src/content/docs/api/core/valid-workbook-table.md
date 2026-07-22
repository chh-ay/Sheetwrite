---
title: "validWorkbookTable | @sheetwrite/core"
description: "Validate one canonical table against sheet bounds and workbook-global identities."
---
<!-- api-export:@sheetwrite/core|.|validWorkbookTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate one canonical table against sheet bounds and workbook-global identities.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/workbook-table.ts#L133</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function validWorkbookTable(
  table: WorkbookTable,
  sheet: Sheet,
  existing: readonly WorkbookTable[],
  limits?: Readonly<WorkbookTableResourceLimits>,
): boolean
```

</div>
