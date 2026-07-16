---
title: "GridReadyEvent | @sheetwrite/react"
description: "Grid handle, generation, and reason published after adapter initialization."
tableOfContents: false
---
<!-- api-export:@sheetwrite/react|.|GridReadyEvent -->
[← @sheetwrite/react](/docs/api/react/)

<span class="api-status">interface</span>

Grid handle, generation, and reason published after adapter initialization.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/adapter.d.ts#L26</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="grid-ready-event-grid" data-pagefind-weight="1">
<summary><code>grid</code> <span class="api-member-summary">Live handle just published by the adapter; replaced on the next reset generation.</span></summary>
<pre><code>grid: Grid;</code></pre>
</details>

<details class="api-member" id="grid-ready-event-generation" data-pagefind-weight="1">
<summary><code>generation</code> <span class="api-member-summary">One-based adapter generation, incremented whenever a Grid is replaced.</span></summary>
<pre><code>generation: number;</code></pre>
</details>

<details class="api-member" id="grid-ready-event-reason" data-pagefind-weight="1">
<summary><code>reason</code> <span class="api-member-summary">Whether readiness followed first initialization, an input reset, or a renderer reset.</span></summary>
<pre><code>reason: GridReadyReason;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridReadyEvent {
    grid: Grid;
    generation: number;
    reason: GridReadyReason;
}
```

</details>
