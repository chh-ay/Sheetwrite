---
title: "CellPaintContext | @sheetwrite/core"
description: "Read-only cell and canvas geometry supplied to a custom renderer."
---
<!-- api-export:@sheetwrite/core|.|CellPaintContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Read-only cell and canvas geometry supplied to a custom renderer.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L40</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="cell-paint-context-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="cell-paint-context-x" data-pagefind-weight="1">
<summary><code>x</code></summary>

```ts generated
x: number;
```

</details>

<details class="api-member" id="cell-paint-context-y" data-pagefind-weight="1">
<summary><code>y</code></summary>

```ts generated
y: number;
```

</details>

<details class="api-member" id="cell-paint-context-w" data-pagefind-weight="1">
<summary><code>w</code></summary>

```ts generated
w: number;
```

</details>

<details class="api-member" id="cell-paint-context-h" data-pagefind-weight="1">
<summary><code>h</code></summary>

```ts generated
h: number;
```

</details>

<details class="api-member" id="cell-paint-context-theme" data-pagefind-weight="1">
<summary><code>theme</code></summary>

```ts generated
theme: Theme;
```

</details>

<details class="api-member" id="cell-paint-context-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellPaintContext {
    value: CellScalar;
    x: number;
    y: number;
    w: number;
    h: number;
    theme: Theme;
    style: CellStyle;
}
```

</details>
