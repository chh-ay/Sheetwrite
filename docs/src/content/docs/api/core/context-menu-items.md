---
title: "ContextMenuItems | @sheetwrite/core"
description: "Static rows or a context-aware factory evaluated each time the menu opens."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItems -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Static rows or a context-aware factory evaluated each time the menu opens.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L225</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type ContextMenuItems =
  | readonly ContextMenuItem[]
  | ((context: ContextMenuContext) => readonly ContextMenuItem[]);
```

</div>
