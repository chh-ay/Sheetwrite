---
title: "createToolbar | @sheetwrite/core/shell"
description: "Mount a toolbar bound to grid.actions (custom items receive the grid)."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|createToolbar -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">function</span>

Mount a toolbar bound to `grid.actions` (custom items receive the grid).
Mouse clicks never steal grid focus; keyboard users get local
Left/Right/Home/End movement across the controls while the toolbar has
focus. Returns the mounted piece with an idempotent `destroy`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/toolbar-factory.ts#L27</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(host: HTMLElement, grid: Grid, options?: ToolbarOptions): ShellPiece => ;
```
