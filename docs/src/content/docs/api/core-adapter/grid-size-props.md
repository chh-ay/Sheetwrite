---
title: "GridSizeProps | @sheetwrite/core/adapter"
description: "Explicit width and height accepted by framework adapters."
---
<!-- api-export:@sheetwrite/core|./adapter|GridSizeProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="type">type</span></div>

Explicit width and height accepted by framework adapters.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L86</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ height: number | string; fill?: never; }</code></div>
<div class="api-variant"><code>{ fill: true; height?: never; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type GridSizeProps = {
    height: number | string;
    fill?: never;
} | {
    fill: true;
    height?: never;
};
```

</details>
