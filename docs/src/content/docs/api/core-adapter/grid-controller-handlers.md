---
title: "GridControllerHandlers | @sheetwrite/core/adapter"
description: "Event callbacks a host (a framework adapter, or any plain app) hangs off a grid's lifecycle."
---
<!-- api-export:@sheetwrite/core|./adapter|GridControllerHandlers -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Event callbacks a host (a framework adapter, or any plain app) hangs off a
grid's lifecycle.

The controller reads these fields **live** on every event — see
[`createGridController`](/docs/api/core-adapter/create-grid-controller/) — so a host may swap any callback at any time by
mutating the fields of the object it passed in, without recreating the grid.
Every field is optional; a missing callback simply drops that event.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/grid-controller.ts#L16</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>12</span>

<div class="api-member-list">

<details class="api-member" id="grid-controller-handlers-on-grid-change" data-pagefind-weight="1">
<summary><code>onGridChange</code> <span class="api-member-summary">Forwarded from the grid's change event (a committed transaction).</span></summary>

```ts generated
onGridChange?(event: ChangeEvent): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code> <span class="api-member-summary">Forwarded from the grid's selection event; null when nothing is selected.</span></summary>

```ts generated
onSelectionChange?(selection: Selection | null): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-viewport-change" data-pagefind-weight="1">
<summary><code>onViewportChange</code> <span class="api-member-summary">Forwarded from the grid's scroll event.</span></summary>

```ts generated
onViewportChange?(event: GridEvents["scroll"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-edit-begin" data-pagefind-weight="1">
<summary><code>onEditBegin</code> <span class="api-member-summary">Forwarded when a cell editor opens.</span></summary>

```ts generated
onEditBegin?(event: GridEvents["edit-begin"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-edit-commit" data-pagefind-weight="1">
<summary><code>onEditCommit</code> <span class="api-member-summary">Forwarded after a cell editor commits.</span></summary>

```ts generated
onEditCommit?(event: GridEvents["edit-commit"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-search" data-pagefind-weight="1">
<summary><code>onSearch</code> <span class="api-member-summary">Forwarded whenever the active search result changes.</span></summary>

```ts generated
onSearch?(result: GridEvents["search"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-command-state-change" data-pagefind-weight="1">
<summary><code>onCommandStateChange</code> <span class="api-member-summary">Forwarded whenever command availability or formatting activity changes.</span></summary>

```ts generated
onCommandStateChange?(event: GridEvents["command-state-change"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-active-sheet-change" data-pagefind-weight="1">
<summary><code>onActiveSheetChange</code> <span class="api-member-summary">Forwarded after the visible sheet changes.</span></summary>

```ts generated
onActiveSheetChange?(event: GridEvents["active-sheet"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-mutation-rejected" data-pagefind-weight="1">
<summary><code>onMutationRejected</code> <span class="api-member-summary">Forwarded when a Grid mutation is rejected.</span></summary>

```ts generated
onMutationRejected?(event: GridEvents["mutation-rejected"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-renderer-fallback" data-pagefind-weight="1">
<summary><code>onRendererFallback</code> <span class="api-member-summary">Forwarded when worker rendering falls back to the main-thread canvas renderer.</span></summary>

```ts generated
onRendererFallback?(event: GridEvents["renderer-fallback"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-datasource-error" data-pagefind-weight="1">
<summary><code>onDatasourceError</code> <span class="api-member-summary">Forwarded when a datasource request fails.</span></summary>

```ts generated
onDatasourceError?(event: GridEvents["datasource-error"]): void;
```

</details>

<details class="api-member" id="grid-controller-handlers-on-export-error" data-pagefind-weight="1">
<summary><code>onExportError</code> <span class="api-member-summary">Forwarded when a built-in XLSX export action fails.</span></summary>

```ts generated
onExportError?(event: GridEvents["export-error"]): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridControllerHandlers {
  onGridChange?(event: ChangeEvent): void;
  onSelectionChange?(selection: Selection | null): void;
  onViewportChange?(event: GridEvents["scroll"]): void;
  onEditBegin?(event: GridEvents["edit-begin"]): void;
  onEditCommit?(event: GridEvents["edit-commit"]): void;
  onSearch?(result: GridEvents["search"]): void;
  onCommandStateChange?(event: GridEvents["command-state-change"]): void;
  onActiveSheetChange?(event: GridEvents["active-sheet"]): void;
  onMutationRejected?(event: GridEvents["mutation-rejected"]): void;
  onRendererFallback?(event: GridEvents["renderer-fallback"]): void;
  onDatasourceError?(event: GridEvents["datasource-error"]): void;
  onExportError?(event: GridEvents["export-error"]): void;
}
```

</details>
