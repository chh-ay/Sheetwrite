---
title: "validateWorkbookTableName | @sheetwrite/core"
description: "Validate and NFC-normalize an ECMA-compatible structured-reference name."
---
<!-- api-export:@sheetwrite/core|.|validateWorkbookTableName -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate and NFC-normalize an ECMA-compatible structured-reference name.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/workbook-table.ts#L65</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function validateWorkbookTableName(
  input: string,
  existingNames?: readonly string[],
  maxLength?: number,
): WorkbookTableNameValidationResult
```

</div>
