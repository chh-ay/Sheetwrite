---
title: "GridControllerHandlers | @sheetwrite/core/adapter"
description: "Event callbacks a host (a framework adapter, or any plain app) hangs off a grid's lifecycle."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./adapter|GridControllerHandlers -->
[← @sheetwrite/core/adapter](/docs/api/core-adapter/)

<span class="api-status">interface</span>

Event callbacks a host (a framework adapter, or any plain app) hangs off a
grid's lifecycle.

The controller reads these fields **live** on every event — see
[`createGridController`](/docs/api/core-adapter/create-grid-controller/) — so a host may swap any callback at any time by
mutating the fields of the object it passed in, without recreating the grid.
Every field is optional; a missing callback simply drops that event.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L16</code></dd></div>
</dl>

## Members <span class="api-count">7</span>

<div class="api-member-list">

<details class="api-member" id="grid-controller-handlers-on-grid-change" data-pagefind-weight="1">
<summary><code>onGridChange</code></summary>
<pre><code>onGridChange?(event: ChangeEvent): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-handlers-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code></summary>
<pre><code>onSelectionChange?(selection: Selection | null): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-handlers-on-viewport-change" data-pagefind-weight="1">
<summary><code>onViewportChange</code></summary>
<pre><code>onViewportChange?(event: GridEvents[&quot;scroll&quot;]): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-handlers-on-edit-begin" data-pagefind-weight="1">
<summary><code>onEditBegin</code></summary>
<pre><code>onEditBegin?(event: GridEvents[&quot;edit-begin&quot;]): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-handlers-on-edit-commit" data-pagefind-weight="1">
<summary><code>onEditCommit</code></summary>
<pre><code>onEditCommit?(event: GridEvents[&quot;edit-commit&quot;]): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-handlers-on-search" data-pagefind-weight="1">
<summary><code>onSearch</code></summary>
<pre><code>onSearch?(result: GridEvents[&quot;search&quot;]): void;</code></pre>
</details>

<details class="api-member" id="grid-controller-handlers-on-active-sheet-change" data-pagefind-weight="1">
<summary><code>onActiveSheetChange</code></summary>
<pre><code>onActiveSheetChange?(event: GridEvents[&quot;active-sheet&quot;]): void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridControllerHandlers {
    onGridChange?(event: ChangeEvent): void;
    onSelectionChange?(selection: Selection | null): void;
    onViewportChange?(event: GridEvents["scroll"]): void;
    onEditBegin?(event: GridEvents["edit-begin"]): void;
    onEditCommit?(event: GridEvents["edit-commit"]): void;
    onSearch?(result: GridEvents["search"]): void;
    onActiveSheetChange?(event: GridEvents["active-sheet"]): void;
}
```

</details>
