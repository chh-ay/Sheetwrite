---
title: "@sheetwrite/core/shell"
description: "API reference for @sheetwrite/core/shell."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/shell`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/shell.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>13</dd></div>
</dl>

Source entry: `packages/core/src/shell.ts`

## Exported symbols

### Functions <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-shell/create-formula-bar/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createFormulaBar</code></span><span class="api-symbol-card__desc">Detached formula bar: mirrors the focused cell's editable text (exact formula source, else literal text) and commits on Enter through the grid's undoable transaction path, targeting the data address captured with the…</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-name-box/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createNameBox</code></span><span class="api-symbol-card__desc">A1 jump box: shows the focused cell's reference and navigates on Enter.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-selection-status/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createSelectionStatus</code></span><span class="api-symbol-card__desc">&lt;output role=&quot;status&quot;&gt; that follows the grid's selection.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-spreadsheet-shell/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createSpreadsheetShell</code></span><span class="api-symbol-card__desc">Mount a complete spreadsheet shell into host: toolbar row, formula row (name box + formula bar), the grid, and a bottom row with sheet tabs (multi- sheet workbooks only) and a selection status.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/create-toolbar/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createToolbar</code></span><span class="api-symbol-card__desc">Mount a toolbar bound to grid.actions (custom items receive the grid).</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/describe-selection/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>describeSelection</code></span><span class="api-symbol-card__desc">Human phrase for a selection's geometry; blank for null/single-cell.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-shell/formula-bar-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>FormulaBarOptions</code></span><span class="api-symbol-card__desc">Host elements and callbacks used to bind a formula bar to a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/formula-bar-piece/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>FormulaBarPiece</code></span><span class="api-symbol-card__desc">A formula bar piece; setReadOnly blocks commits without unmounting.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/name-box-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>NameBoxOptions</code></span><span class="api-symbol-card__desc">Host elements and callbacks used to bind a name box to a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/shell-piece/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ShellPiece</code></span><span class="api-symbol-card__desc">A mounted shell piece: its root element plus an idempotent teardown.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/spreadsheet-shell/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SpreadsheetShell</code></span><span class="api-symbol-card__desc">Disposable controller for the framework-neutral spreadsheet shell.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/spreadsheet-shell-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>SpreadsheetShellOptions</code></span><span class="api-symbol-card__desc">Host elements and feature options used to create a spreadsheet shell.</span></a>
<a class="api-symbol-card" href="/docs/api/core-shell/toolbar-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ToolbarOptions</code></span><span class="api-symbol-card__desc">Host element and configuration used to create the built-in toolbar.</span></a>
</div>
