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

```ts generated
change: ChangeEvent;
```

</details>

<details class="api-member" id="grid-events-selection" data-pagefind-weight="1">
<summary><code>selection</code></summary>

```ts generated
selection: { selection: Selection | null };
```

</details>

<details class="api-member" id="grid-events-scroll" data-pagefind-weight="1">
<summary><code>scroll</code></summary>

```ts generated
scroll: { scrollTop: number; firstRow: number; lastRow: number };
```

</details>

<details class="api-member" id="grid-events-edit-begin" data-pagefind-weight="1">
<summary><code>edit-begin</code></summary>

```ts generated
"edit-begin": { addr: CellAddress };
```

</details>

<details class="api-member" id="grid-events-edit-commit" data-pagefind-weight="1">
<summary><code>edit-commit</code></summary>

```ts generated
"edit-commit": { addr: CellAddress; value: CellValue };
```

</details>

<details class="api-member" id="grid-events-search" data-pagefind-weight="1">
<summary><code>search</code></summary>

```ts generated
search: SearchResult;
```

</details>

<details class="api-member" id="grid-events-mutation-rejected" data-pagefind-weight="1">
<summary><code>mutation-rejected</code></summary>

```ts generated
"mutation-rejected": { issues: MutationIssue[] };
```

</details>

<details class="api-member" id="grid-events-active-sheet" data-pagefind-weight="1">
<summary><code>active-sheet</code> <span class="api-member-summary">Emitted after the visible sheet changes (direct call or cross-sheet scroll).</span></summary>

```ts generated
"active-sheet": { sheet: SheetId };
```

</details>

<details class="api-member" id="grid-events-renderer-fallback" data-pagefind-weight="1">
<summary><code>renderer-fallback</code> <span class="api-member-summary">Emitted once when the worker renderer could not be constructed and the grid fell back to the main-thread canvas renderer.</span></summary>

```ts generated
"renderer-fallback": { requested: "worker"; error: unknown };
```

</details>

<details class="api-member" id="grid-events-datasource-error" data-pagefind-weight="1">
<summary><code>datasource-error</code></summary>

```ts generated
"datasource-error": { request: Omit<DataSourceRequest, "signal">; error: unknown };
```

</details>

<details class="api-member" id="grid-events-export-error" data-pagefind-weight="1">
<summary><code>export-error</code> <span class="api-member-summary">Built-in toolbar/context-menu export failed after its action was dispatched.</span></summary>

```ts generated
"export-error": { format: "xlsx"; error: unknown };
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
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
