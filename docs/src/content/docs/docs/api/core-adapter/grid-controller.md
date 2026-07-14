---
title: "GridController | @sheetwrite/core/adapter"
description: "The lifecycle handle returned by createGridController: the live grid, a theme passthrough, and a single teardown that detaches every subscription and destroys the grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|GridController -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">interface</span>

The lifecycle handle returned by [`createGridController`](/docs/api/core-adapter/create-grid-controller/): the live grid,
a theme passthrough, and a single teardown that detaches every subscription
and destroys the grid.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L43</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="grid-controller-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>
<pre><code>readonly grid: Grid;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code></summary>
<pre><code>setTheme(theme: Partial&lt;Theme&gt; | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code></summary>
<pre><code>setReadOnly(readOnly: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-config" data-pagefind-weight="1">
<summary><code>setConfig</code></summary>
<pre><code>setConfig(config: GridConfig | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-overscan" data-pagefind-weight="1">
<summary><code>setOverscan</code></summary>
<pre><code>setOverscan(overscan: number | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-min-columns" data-pagefind-weight="1">
<summary><code>setMinColumns</code></summary>
<pre><code>setMinColumns(minColumns: number | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>
<pre><code>destroy(): void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridController {
    readonly grid: Grid;
    setTheme(theme: Partial<Theme> | undefined): void;
    setReadOnly(readOnly: boolean): void;
    setConfig(config: GridConfig | undefined): void;
    setOverscan(overscan: number | undefined): void;
    setMinColumns(minColumns: number | undefined): void;
    destroy(): void;
}
```

</details>
