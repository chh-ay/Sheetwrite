---
title: "SyncActivityState | @sheetwrite/core"
description: "Current persistence activity reported by a sync coordinator."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SyncActivityState -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Current persistence activity reported by a sync coordinator.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L22</code></dd></div>
</dl>

## Variants <span class="api-count">8</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;hydrating&quot;</code></div>
<div class="api-variant"><code>&quot;idle&quot;</code></div>
<div class="api-variant"><code>&quot;persisting&quot;</code></div>
<div class="api-variant"><code>&quot;pending&quot;</code></div>
<div class="api-variant"><code>&quot;sending&quot;</code></div>
<div class="api-variant"><code>&quot;conflict&quot;</code></div>
<div class="api-variant"><code>&quot;error&quot;</code></div>
<div class="api-variant"><code>&quot;destroyed&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type SyncActivityState = "hydrating" | "idle" | "persisting" | "pending" | "sending" | "conflict" | "error" | "destroyed";
```

</details>
