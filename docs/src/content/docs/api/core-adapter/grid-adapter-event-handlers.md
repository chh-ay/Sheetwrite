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
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L56</code></dd></div>
</dl>

## Members <span class="api-count">9</span>

<div class="api-member-list">
<h3 id="ongridchange" class="api-search-anchor">onGridChange</h3>
<details class="api-member" id="grid-adapter-event-handlers-on-grid-change" data-pagefind-weight="10">
<summary><code>onGridChange</code> <span class="api-member-summary">Receives every committed Grid change, including its applied transaction.</span></summary>

```ts generated
onGridChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code> <span class="api-member-summary">Receives the current selection, or null after it is cleared.</span></summary>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-viewport-change" data-pagefind-weight="1">
<summary><code>onViewportChange</code> <span class="api-member-summary">Receives visible row bounds and vertical scroll offset after scrolling.</span></summary>

```ts generated
onViewportChange?: (event: GridEvents["scroll"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-edit-begin" data-pagefind-weight="1">
<summary><code>onEditBegin</code> <span class="api-member-summary">Fires when cell editing begins.</span></summary>

```ts generated
onEditBegin?: (event: GridEvents["edit-begin"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-edit-commit" data-pagefind-weight="1">
<summary><code>onEditCommit</code> <span class="api-member-summary">Fires after an edit commits its parsed cell value.</span></summary>

```ts generated
onEditCommit?: (event: GridEvents["edit-commit"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-search" data-pagefind-weight="1">
<summary><code>onSearch</code> <span class="api-member-summary">Receives refreshed search matches and active-match index.</span></summary>

```ts generated
onSearch?: (result: GridEvents["search"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-active-sheet-change" data-pagefind-weight="1">
<summary><code>onActiveSheetChange</code> <span class="api-member-summary">Fires after the visible sheet changes.</span></summary>

```ts generated
onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

```ts generated
onReady?: (event: GridReadyEvent) => void;
```

</details>

<details class="api-member" id="grid-adapter-event-handlers-on-initialization-error" data-pagefind-weight="1">
<summary><code>onInitializationError</code> <span class="api-member-summary">Receives a WASM initialization failure while the adapter remains mounted.</span></summary>

```ts generated
onInitializationError?: (error: unknown) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
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
