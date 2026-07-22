---
title: "validateSheetName | @sheetwrite/core"
description: "Validate and canonicalize a SpreadsheetML worksheet name."
---
<!-- api-export:@sheetwrite/core|.|validateSheetName -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate and canonicalize a SpreadsheetML worksheet name.

Length is measured in UTF-16 code units, matching SpreadsheetML and JavaScript
string length. Callers renaming an existing sheet should omit that sheet's
current name from `existingNames`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sheet-name.ts#L47</code></dd></div>
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
