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
<summary><code>grid</code> <span class="api-member-summary">The imperative core grid this controller owns.</span></summary>
<pre><code>readonly grid: Grid;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code> <span class="api-member-summary">Apply the host's declarative theme prop: option-level replacement via <code>Grid.replaceTheme</code>; undefined restores CSS/default resolution.</span></summary>
<pre><code>setTheme(theme: Partial&lt;Theme&gt; | undefined): void;</code></pre>
<p class="api-member-doc">Apply the host's declarative theme prop: option-level replacement via
<code>Grid.replaceTheme</code>; `undefined` restores CSS/default resolution.</p>
</details>

<details class="api-member" id="grid-controller-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code> <span class="api-member-summary">Update editability without replacing the owned grid.</span></summary>
<pre><code>setReadOnly(readOnly: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-config" data-pagefind-weight="1">
<summary><code>setConfig</code> <span class="api-member-summary">Update built-in chrome and keyboard configuration without replacing the grid.</span></summary>
<pre><code>setConfig(config: GridConfig | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-set-overscan" data-pagefind-weight="1">
<summary><code>setOverscan</code> <span class="api-member-summary">Live-update the render overscan without replacing the grid; undefined restores the default.</span></summary>
<pre><code>setOverscan(overscan: number | undefined): void;</code></pre>
<p class="api-member-doc">Live-update the render overscan without replacing the grid; `undefined`
restores the default.</p>
</details>

<details class="api-member" id="grid-controller-set-min-columns" data-pagefind-weight="1">
<summary><code>setMinColumns</code> <span class="api-member-summary">Live-update the minimum rendered column count without emitting user edits.</span></summary>
<pre><code>setMinColumns(minColumns: number | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-destroy" data-pagefind-weight="1">
<summary><code>destroy</code> <span class="api-member-summary">Detach every event subscription and destroy the grid.</span></summary>
<pre><code>destroy(): void;</code></pre>
<p class="api-member-doc">Detach every event subscription and destroy the grid. Call exactly once.</p>
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
