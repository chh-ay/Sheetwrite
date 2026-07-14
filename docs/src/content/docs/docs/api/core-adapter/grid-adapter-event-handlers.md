---
title: "GridAdapterEventHandlers | @sheetwrite/core/adapter"
description: "Framework-neutral readiness, change, and error callbacks shared by adapters."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|GridAdapterEventHandlers -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">interface</span>

Framework-neutral readiness, change, and error callbacks shared by adapters.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L53</code></dd></div>
</dl>

## Members <span class="api-count">9</span>

<div class="api-member-list">
<h3 id="ongridchange" class="api-search-anchor">onGridChange</h3>
<details class="api-member" id="grid-adapter-event-handlers-on-grid-change" data-pagefind-weight="10">
<summary><code>onGridChange</code></summary>
<pre><code>onGridChange?: (event: ChangeEvent) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code></summary>
<pre><code>onSelectionChange?: (selection: Selection | null) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-viewport-change" data-pagefind-weight="1">
<summary><code>onViewportChange</code></summary>
<pre><code>onViewportChange?: (event: GridEvents[&quot;scroll&quot;]) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-edit-begin" data-pagefind-weight="1">
<summary><code>onEditBegin</code></summary>
<pre><code>onEditBegin?: (event: GridEvents[&quot;edit-begin&quot;]) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-edit-commit" data-pagefind-weight="1">
<summary><code>onEditCommit</code></summary>
<pre><code>onEditCommit?: (event: GridEvents[&quot;edit-commit&quot;]) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-search" data-pagefind-weight="1">
<summary><code>onSearch</code></summary>
<pre><code>onSearch?: (result: GridEvents[&quot;search&quot;]) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-active-sheet-change" data-pagefind-weight="1">
<summary><code>onActiveSheetChange</code></summary>
<pre><code>onActiveSheetChange?: (event: GridEvents[&quot;active-sheet&quot;]) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code></summary>
<pre><code>onReady?: (event: GridReadyEvent) =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-adapter-event-handlers-on-initialization-error" data-pagefind-weight="1">
<summary><code>onInitializationError</code></summary>
<pre><code>onInitializationError?: (error: unknown) =&gt; void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridAdapterEventHandlers {
    onGridChange?: (event: ChangeEvent) => void;
    onSelectionChange?: (selection: Selection | null) => void;
    onViewportChange?: (event: GridEvents["scroll"]) => void;
    onEditBegin?: (event: GridEvents["edit-begin"]) => void;
    onEditCommit?: (event: GridEvents["edit-commit"]) => void;
    onSearch?: (result: GridEvents["search"]) => void;
    onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
    onReady?: (event: GridReadyEvent) => void;
    onInitializationError?: (error: unknown) => void;
}
```

</details>
