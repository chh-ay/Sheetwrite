---
title: "createSelectionStatus | @sheetwrite/core/shell"
description: "<output role=\"status\"> that follows the grid's selection."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|createSelectionStatus -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">function</span>

`<output role="status">` that follows the grid's selection. Text nodes only;
polite live region so screen readers announce changes without interrupting.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/selection-status.ts#L31</code></dd></div>
</dl>

## Signature

```ts generated
function createSelectionStatus(host: HTMLElement, grid: Grid): ShellPiece;
```
