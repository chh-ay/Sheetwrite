---
title: "@sheetwrite/core/shell"
description: "API reference for @sheetwrite/core/shell."
tableOfContents: false
---
<span class="api-status">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/shell`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/shell.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>13</dd></div>
</dl>

Source entry: `packages/core/src/shell.ts`

## Exported symbols

### Functions <span class="api-count">6</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-shell/create-formula-bar/"><code>createFormulaBar</code><span>Detached formula bar: mirrors the focused cell's editable text (exact formula source, else literal text) and commits on Enter through the grid's undoable transaction path, targeting the data address captured with the…</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-name-box/"><code>createNameBox</code><span>A1 jump box: shows the focused cell's reference and navigates on Enter.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-selection-status/"><code>createSelectionStatus</code><span>&lt;output role=&quot;status&quot;&gt; that follows the grid's selection.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-spreadsheet-shell/"><code>createSpreadsheetShell</code><span>Mount a complete spreadsheet shell into host: toolbar row, formula row (name box + formula bar), the grid, and a bottom row with sheet tabs (multi- sheet workbooks only) and a selection status.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-toolbar/"><code>createToolbar</code><span>Mount a toolbar bound to grid.actions (custom items receive the grid).</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/describe-selection/"><code>describeSelection</code><span>Human phrase for a selection's geometry; blank for null/single-cell.</span></a>
</div>

### Interfaces <span class="api-count">7</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-shell/formula-bar-options/"><code>FormulaBarOptions</code><span>Host elements and callbacks used to bind a formula bar to a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/formula-bar-piece/"><code>FormulaBarPiece</code><span>A formula bar piece; setReadOnly blocks commits without unmounting.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/name-box-options/"><code>NameBoxOptions</code><span>Host elements and callbacks used to bind a name box to a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/shell-piece/"><code>ShellPiece</code><span>A mounted shell piece: its root element plus an idempotent teardown.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/spreadsheet-shell/"><code>SpreadsheetShell</code><span>Disposable controller for the framework-neutral spreadsheet shell.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/spreadsheet-shell-options/"><code>SpreadsheetShellOptions</code><span>Host elements and feature options used to create a spreadsheet shell.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/toolbar-options/"><code>ToolbarOptions</code><span>Host element and configuration used to create the built-in toolbar.</span></a>
</div>
