---
title: "createSelectionStatus | @sheetwrite/core/shell"
description: "<output role=\"status\"> that follows the grid's selection."
---
<!-- api-export:@sheetwrite/core|./shell|createSelectionStatus -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

`<output role="status">` that follows the grid's selection. Text nodes only;
polite live region so screen readers announce changes without interrupting.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/selection-status.ts#L31</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createSelectionStatus(
  host: HTMLElement,
  grid: Grid,
): ShellPiece
```

</div>
