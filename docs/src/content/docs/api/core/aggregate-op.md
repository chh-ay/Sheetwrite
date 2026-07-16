---
title: "AggregateOp | @sheetwrite/core"
description: "Column aggregate operation for Grid.aggregate / Store data ops."
---
<!-- api-export:@sheetwrite/core|.|AggregateOp -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Column aggregate operation for `Grid.aggregate` / `Store` data ops.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/data.ts#L8</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;sum&quot;</code></div>
<div class="api-variant"><code>&quot;avg&quot;</code></div>
<div class="api-variant"><code>&quot;min&quot;</code></div>
<div class="api-variant"><code>&quot;max&quot;</code></div>
<div class="api-variant"><code>&quot;count&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type AggregateOp = "sum" | "avg" | "min" | "max" | "count";
```

</details>
