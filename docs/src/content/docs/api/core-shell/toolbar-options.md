---
title: "ToolbarOptions | @sheetwrite/core/shell"
description: "Host element and configuration used to create the built-in toolbar."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|ToolbarOptions -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">interface</span>

Host element and configuration used to create the built-in toolbar.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/toolbar-factory.ts#L12</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="toolbar-options-items" data-pagefind-weight="1">
<summary><code>items</code> <span class="api-member-summary">Items to render; defaults to the full built-in action set.</span></summary>

```ts generated
items?: readonly ToolbarItem[];
```

</details>

<details class="api-member" id="toolbar-options-icons" data-pagefind-weight="1">
<summary><code>icons</code> <span class="api-member-summary">Per-action icon overrides, exactly like GridConfig.icons.</span></summary>

```ts generated
icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
```

</details>

<details class="api-member" id="toolbar-options-label" data-pagefind-weight="1">
<summary><code>label</code> <span class="api-member-summary">Accessible toolbar label (default &quot;Spreadsheet formatting&quot;).</span></summary>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ToolbarOptions {
    items?: readonly ToolbarItem[];
    icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
    label?: string;
}
```

</details>
