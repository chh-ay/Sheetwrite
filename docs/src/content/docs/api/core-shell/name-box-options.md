---
title: "NameBoxOptions | @sheetwrite/core/shell"
description: "Host elements and callbacks used to bind a name box to a Grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|NameBoxOptions -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">interface</span>

Host elements and callbacks used to bind a name box to a Grid.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L19</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="name-box-options-focus-grid" data-pagefind-weight="1">
<summary><code>focusGrid</code> <span class="api-member-summary">Called after a successful Enter navigation so the grid regains focus.</span></summary>

```ts generated
focusGrid?: () => void;
```

</details>

<details class="api-member" id="name-box-options-label" data-pagefind-weight="1">
<summary><code>label</code> <span class="api-member-summary">Accessible label (default &quot;Cell reference&quot;).</span></summary>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface NameBoxOptions {
    focusGrid?: () => void;
    label?: string;
}
```

</details>
