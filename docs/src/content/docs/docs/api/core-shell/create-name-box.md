---
title: "createNameBox | @sheetwrite/core/shell"
description: "A1 jump box: shows the focused cell's reference and navigates on Enter."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|createNameBox -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">function</span>

A1 jump box: shows the focused cell's reference and navigates on Enter.
Invalid or out-of-bounds references set `aria-invalid` and make no grid
calls; Escape restores the displayed reference.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L31</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
(host: HTMLElement, grid: Grid, options?: NameBoxOptions): ShellPiece => ;
```
