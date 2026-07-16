---
title: "CellLoadState | @sheetwrite/core"
description: "Datasource loading state for a resolved cell."
---
<!-- api-export:@sheetwrite/core|.|CellLoadState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Datasource loading state for a resolved cell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L91</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;unloaded&quot;</code></div>
<div class="api-variant"><code>&quot;loaded-empty&quot;</code></div>
<div class="api-variant"><code>&quot;loaded-value&quot;</code></div>
<div class="api-variant"><code>&quot;local-edit&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type CellLoadState = "unloaded" | "loaded-empty" | "loaded-value" | "local-edit";
```

</details>
