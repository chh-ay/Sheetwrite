---
title: "ContextMenuItems | @sheetwrite/core"
description: "Static rows or a context-aware factory evaluated each time the menu opens."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItems -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Static rows or a context-aware factory evaluated each time the menu opens.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L200</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>readonly ContextMenuItem[]</code></div>
<div class="api-variant"><code>((context: ContextMenuContext) =&gt; readonly ContextMenuItem[])</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type ContextMenuItems = readonly ContextMenuItem[] | ((context: ContextMenuContext) => readonly ContextMenuItem[]);
```

</details>
