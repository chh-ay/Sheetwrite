---
title: "createSpreadsheetShell | @sheetwrite/core/shell"
description: "Mount a complete spreadsheet shell into host: toolbar row, formula row (name box + formula bar), the grid, and a bottom row with sheet tabs (multi- sheet workbooks only) and a selection status."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|createSpreadsheetShell -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">function</span>

Mount a complete spreadsheet shell into `host`: toolbar row, formula row
(name box + formula bar), the grid, and a bottom row with sheet tabs (multi-
sheet workbooks only) and a selection status. The host must have a real
size; the shell fills it. Returns the shell handle; `destroy` tears down
every piece, the grid, and the shell DOM, and is safe to call twice.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/spreadsheet-shell.ts#L59</code></dd></div>
</dl>

## Signature

```ts generated
function createSpreadsheetShell(host: HTMLElement, options: SpreadsheetShellOptions): SpreadsheetShell;
```
