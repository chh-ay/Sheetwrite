---
title: "validateSheetName | @sheetwrite/core"
description: "Validate and canonicalize a SpreadsheetML worksheet name."
---
<!-- api-export:@sheetwrite/core|.|validateSheetName -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate and canonicalize a SpreadsheetML worksheet name.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sheet-name.ts#L17</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function validateSheetName(
  name: string,
  existingNames?: readonly string[],
): SheetNameValidationResult
```

</div>
