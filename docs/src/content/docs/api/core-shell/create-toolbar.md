---
title: "createToolbar | @sheetwrite/core/shell"
description: "Mount a toolbar bound to grid.actions (custom items receive the grid)."
---
<!-- api-export:@sheetwrite/core|./shell|createToolbar -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

Mount a toolbar bound to `grid.actions` (custom items receive the grid).
Mouse clicks never steal grid focus; keyboard users get local
Left/Right/Home/End movement across the controls while the toolbar has
focus. Returns the mounted piece with an idempotent `destroy`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/toolbar-factory.ts#L27</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createToolbar(
  host: HTMLElement,
  grid: Grid,
  options?: ToolbarOptions,
): ShellPiece
```

</div>
