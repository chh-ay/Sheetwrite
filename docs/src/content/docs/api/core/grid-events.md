---
title: "GridEvents | @sheetwrite/core"
description: "Payload map for events emitted by a Grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|GridEvents -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Payload map for events emitted by a Grid.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L344</code></dd></div>
</dl>

## Members <span class="api-count">11</span>

<div class="api-member-list">

<details class="api-member" id="grid-events-change" data-pagefind-weight="1">
<summary><code>change</code></summary>
<pre><code>change: ChangeEvent;</code></pre>
</details>

<details class="api-member" id="grid-events-selection" data-pagefind-weight="1">
<summary><code>selection</code></summary>
<pre><code>selection: { selection: Selection | null };</code></pre>
</details>

<details class="api-member" id="grid-events-scroll" data-pagefind-weight="1">
<summary><code>scroll</code></summary>
<pre><code>scroll: { scrollTop: number; firstRow: number; lastRow: number };</code></pre>
</details>

<details class="api-member" id="grid-events-edit-begin" data-pagefind-weight="1">
<summary><code>edit-begin</code></summary>
<pre><code>&quot;edit-begin&quot;: { addr: CellAddress };</code></pre>
</details>

<details class="api-member" id="grid-events-edit-commit" data-pagefind-weight="1">
<summary><code>edit-commit</code></summary>
<pre><code>&quot;edit-commit&quot;: { addr: CellAddress; value: CellValue };</code></pre>
</details>

<details class="api-member" id="grid-events-search" data-pagefind-weight="1">
<summary><code>search</code></summary>
<pre><code>search: SearchResult;</code></pre>
</details>

<details class="api-member" id="grid-events-mutation-rejected" data-pagefind-weight="1">
<summary><code>mutation-rejected</code></summary>
<pre><code>&quot;mutation-rejected&quot;: { issues: MutationIssue[] };</code></pre>
</details>

<details class="api-member" id="grid-events-active-sheet" data-pagefind-weight="1">
<summary><code>active-sheet</code> <span class="api-member-summary">Emitted after the visible sheet changes (direct call or cross-sheet scroll).</span></summary>
<pre><code>&quot;active-sheet&quot;: { sheet: SheetId };</code></pre>
</details>

<details class="api-member" id="grid-events-renderer-fallback" data-pagefind-weight="1">
<summary><code>renderer-fallback</code> <span class="api-member-summary">Emitted once when the worker renderer could not be constructed and the grid fell back to the main-thread canvas renderer.</span></summary>
<pre><code>&quot;renderer-fallback&quot;: { requested: &quot;worker&quot;; error: unknown };</code></pre>
<p class="api-member-doc">Emitted once when the worker renderer could not be constructed and the
grid fell back to the main-thread canvas renderer.</p>
</details>

<details class="api-member" id="grid-events-datasource-error" data-pagefind-weight="1">
<summary><code>datasource-error</code></summary>
<pre><code>&quot;datasource-error&quot;: { request: Omit&lt;DataSourceRequest, &quot;signal&quot;&gt;; error: unknown };</code></pre>
</details>

<details class="api-member" id="grid-events-export-error" data-pagefind-weight="1">
<summary><code>export-error</code> <span class="api-member-summary">Built-in toolbar/context-menu export failed after its action was dispatched.</span></summary>
<pre><code>&quot;export-error&quot;: { format: &quot;xlsx&quot;; error: unknown };</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridEvents {
    change: ChangeEvent;
    selection: {
        selection: Selection | null;
    };
    scroll: {
        scrollTop: number;
        firstRow: number;
        lastRow: number;
    };
    "edit-begin": {
        addr: CellAddress;
    };
    "edit-commit": {
        addr: CellAddress;
        value: CellValue;
    };
    search: SearchResult;
    "mutation-rejected": {
        issues: MutationIssue[];
    };
    "active-sheet": {
        sheet: SheetId;
    };
    "renderer-fallback": {
        requested: "worker";
        error: unknown;
    };
    "datasource-error": {
        request: Omit<DataSourceRequest, "signal">;
        error: unknown;
    };
    "export-error": {
        format: "xlsx";
        error: unknown;
    };
}
```

</details>
