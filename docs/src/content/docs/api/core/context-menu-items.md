---
title: "ContextMenuItems | @sheetwrite/core"
description: "Static rows or a context-aware factory evaluated each time the menu opens."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItems -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

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

```ts generated
export type ContextMenuItems = readonly ContextMenuItem[] | ((context: ContextMenuContext) => readonly ContextMenuItem[]);
```

</details>
