---
title: "GridReadyEvent | @sheetwrite/core/adapter"
description: "Grid handle, generation, and reason published after adapter initialization."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|GridReadyEvent -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">interface</span>

Grid handle, generation, and reason published after adapter initialization.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L46</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="grid-ready-event-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>
<pre><code>grid: Grid;</code></pre>
</details>

<details class="api-member" id="grid-ready-event-generation" data-pagefind-weight="1">
<summary><code>generation</code></summary>
<pre><code>generation: number;</code></pre>
</details>

<details class="api-member" id="grid-ready-event-reason" data-pagefind-weight="1">
<summary><code>reason</code></summary>
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
