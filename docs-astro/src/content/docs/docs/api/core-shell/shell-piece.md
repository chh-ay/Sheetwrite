---
title: "ShellPiece | @sheetwrite/core/shell"
description: "A mounted shell piece: its root element plus an idempotent teardown."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./shell|ShellPiece -->
[← @sheetwrite/core/shell](/docs/api/core-shell/)

<span class="api-status">interface</span>

A mounted shell piece: its root element plus an idempotent teardown.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L13</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="shell-piece-element" data-pagefind-weight="1">
<summary><code>element</code></summary>
<pre><code>readonly element: HTMLElement;</code></pre>
</details>

<details class="api-member" id="shell-piece-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>
<pre><code>destroy(): void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface ShellPiece {
    readonly element: HTMLElement;
    destroy(): void;
}
```

</details>
