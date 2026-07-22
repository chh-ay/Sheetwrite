---
title: "GridEvents | @sheetwrite/core"
description: "Payload map for events emitted by a Grid."
---
<!-- api-export:@sheetwrite/core|.|GridEvents -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Payload map for events emitted by a Grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L444</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>13</span>

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
scroll: { scrollTop: number; firstRow: number; lastRow: number; scrollLeft: number; firstVisibleColumn: number | null; lastVisibleColumn: number | null; };
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

<details class="api-member" id="grid-events-command-state-change" data-pagefind-weight="1">
<summary><code>command-state-change</code> <span class="api-member-summary">Command availability or formatting activity changed.</span></summary>

```ts generated
"command-state-change": GridCommandStateChangeEvent;
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

<details class="api-member" id="grid-events-hyperlink-activate" data-pagefind-weight="1">
<summary><code>hyperlink-activate</code></summary>

```ts generated
"hyperlink-activate": HyperlinkActivationEvent;
```

</details>

<details class="api-member" id="grid-events-renderer-fallback" data-pagefind-weight="1">
<summary><code>renderer-fallback</code> <span class="api-member-summary">Emitted once when the worker renderer could not be constructed and the grid fell back to the main-thread canvas renderer.</span></summary>

```ts generated
"renderer-fallback": { requested: "worker"; error: SheetwriteError };
```

</details>

<details class="api-member" id="grid-events-datasource-error" data-pagefind-weight="1">
<summary><code>datasource-error</code></summary>

```ts generated
"datasource-error": { request: Omit<DataSourceRequest, "signal">; error: SheetwriteError; };
```

</details>

<details class="api-member" id="grid-events-export-error" data-pagefind-weight="1">
<summary><code>export-error</code> <span class="api-member-summary">Built-in toolbar/context-menu export failed after its action was dispatched.</span></summary>

```ts generated
"export-error": { format: "xlsx"; error: SheetwriteError };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
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
    scrollLeft: number;
    firstVisibleColumn: number | null;
    lastVisibleColumn: number | null;
  };
  "edit-begin": {
    addr: CellAddress;
  };
  "edit-commit": {
    addr: CellAddress;
    value: CellValue;
  };
  search: SearchResult;
  "command-state-change": GridCommandStateChangeEvent;
  "mutation-rejected": {
    issues: MutationIssue[];
  };
  "active-sheet": {
    sheet: SheetId;
  };
  "hyperlink-activate": HyperlinkActivationEvent;
  "renderer-fallback": {
    requested: "worker";
    error: SheetwriteError;
  };
  "datasource-error": {
    request: Omit<DataSourceRequest, "signal">;
    error: SheetwriteError;
  };
  "export-error": {
    format: "xlsx";
    error: SheetwriteError;
  };
}
```

</details>
