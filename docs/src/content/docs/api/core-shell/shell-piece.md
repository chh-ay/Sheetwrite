---
title: "ShellPiece | @sheetwrite/core/shell"
description: "A mounted shell piece: its root element plus an idempotent teardown."
---
<!-- api-export:@sheetwrite/core|./shell|ShellPiece -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

A mounted shell piece: its root element plus an idempotent teardown.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/shell</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/shell/formula-controls.ts#L13</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="shell-piece-element" data-pagefind-weight="1">
<summary><code>element</code></summary>

```ts generated
readonly element: HTMLElement;
```

</details>

<details class="api-member" id="shell-piece-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ShellPiece {
    readonly element: HTMLElement;
    destroy(): void;
}
```

</details>
