---
title: "CellEditor | @sheetwrite/core"
description: "Framework-neutral named editor definition registered through GridOptions.editors."
---
<!-- api-export:@sheetwrite/core|.|CellEditor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Framework-neutral named editor definition registered through GridOptions.editors.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L99</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-mount" data-pagefind-weight="1">
<summary><code>mount</code></summary>

```ts generated
mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellEditor {
  mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;
}
```

</details>
