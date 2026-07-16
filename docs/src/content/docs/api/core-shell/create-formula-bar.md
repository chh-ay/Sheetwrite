---
title: "createFormulaBar | @sheetwrite/core/shell"
description: "Detached formula bar: mirrors the focused cell's editable text (exact formula source, else literal text) and commits on Enter through the grid's undoable transaction path, targeting the data address captured with the…"
---
<!-- api-export:@sheetwrite/core|./shell|createFormulaBar -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

Detached formula bar: mirrors the focused cell's editable text (exact
formula source, else literal text) and commits on Enter through the grid's
undoable transaction path, targeting the data address captured with the
draft — correct even under an active sort/filter view. A focused, dirty
draft is never overwritten by selection/change events; Escape restores the
last stable text.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L136</code></dd></div>
</dl>

## Declaration

```ts generated
function createFormulaBar(
  host: HTMLElement,
  grid: Grid,
  options?: FormulaBarOptions,
): FormulaBarPiece
```
