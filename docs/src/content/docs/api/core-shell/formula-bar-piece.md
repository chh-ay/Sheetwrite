---
title: "FormulaBarPiece | @sheetwrite/core/shell"
description: "A formula bar piece; setReadOnly blocks commits without unmounting."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|FormulaBarPiece -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">interface</span>

A formula bar piece; `setReadOnly` blocks commits without unmounting.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L124</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="formula-bar-piece-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code></summary>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaBarPiece extends ShellPiece {
    setReadOnly(readOnly: boolean): void;
}
```

</details>
