---
title: "SheetwriteGridEmits | @sheetwrite/vue"
description: "Event payloads emitted by the Vue components, keyed by template event name."
---
<!-- api-export:@sheetwrite/vue|.|SheetwriteGridEmits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Event payloads emitted by the Vue components, keyed by template event name.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/vue/src/index.ts#L102</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>13</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-emits-grid-change" data-pagefind-weight="1">
<summary><code>grid-change</code> <span class="api-member-summary">Committed Grid change, including its applied transaction.</span></summary>

```ts generated
"grid-change": ChangeEvent;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-selection-change" data-pagefind-weight="1">
<summary><code>selection-change</code> <span class="api-member-summary">Current selection, or null after it is cleared.</span></summary>

```ts generated
"selection-change": Selection | null;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-viewport-change" data-pagefind-weight="1">
<summary><code>viewport-change</code> <span class="api-member-summary">Visible row bounds and vertical scroll offset after scrolling.</span></summary>

```ts generated
"viewport-change": GridEvents["scroll"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-edit-begin" data-pagefind-weight="1">
<summary><code>edit-begin</code> <span class="api-member-summary">Cell editing began.</span></summary>

```ts generated
"edit-begin": GridEvents["edit-begin"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-edit-commit" data-pagefind-weight="1">
<summary><code>edit-commit</code> <span class="api-member-summary">An edit committed its parsed cell value.</span></summary>

```ts generated
"edit-commit": GridEvents["edit-commit"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-search" data-pagefind-weight="1">
<summary><code>search</code> <span class="api-member-summary">Refreshed search matches and active-match index.</span></summary>

```ts generated
search: GridEvents["search"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-active-sheet-change" data-pagefind-weight="1">
<summary><code>active-sheet-change</code> <span class="api-member-summary">The visible sheet changed.</span></summary>

```ts generated
"active-sheet-change": GridEvents["active-sheet"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-mutation-rejected" data-pagefind-weight="1">
<summary><code>mutation-rejected</code> <span class="api-member-summary">A Grid mutation was rejected.</span></summary>

```ts generated
"mutation-rejected": GridEvents["mutation-rejected"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-renderer-fallback" data-pagefind-weight="1">
<summary><code>renderer-fallback</code> <span class="api-member-summary">Worker rendering fell back to the main-thread canvas renderer.</span></summary>

```ts generated
"renderer-fallback": GridEvents["renderer-fallback"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-datasource-error" data-pagefind-weight="1">
<summary><code>datasource-error</code> <span class="api-member-summary">A datasource request failed.</span></summary>

```ts generated
"datasource-error": GridEvents["datasource-error"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-export-error" data-pagefind-weight="1">
<summary><code>export-error</code> <span class="api-member-summary">A built-in XLSX export action failed.</span></summary>

```ts generated
"export-error": GridEvents["export-error"];
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-ready" data-pagefind-weight="1">
<summary><code>ready</code> <span class="api-member-summary">The adapter published a ready Grid generation.</span></summary>

```ts generated
ready: GridReadyEvent;
```

</details>

<details class="api-member" id="sheetwrite-grid-emits-initialization-error" data-pagefind-weight="1">
<summary><code>initialization-error</code> <span class="api-member-summary">WASM initialization failed while the component stayed mounted.</span></summary>

```ts generated
"initialization-error": unknown;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridEmits {
  "grid-change": ChangeEvent;
  "selection-change": Selection | null;
  "viewport-change": GridEvents["scroll"];
  "edit-begin": GridEvents["edit-begin"];
  "edit-commit": GridEvents["edit-commit"];
  search: GridEvents["search"];
  "active-sheet-change": GridEvents["active-sheet"];
  "mutation-rejected": GridEvents["mutation-rejected"];
  "renderer-fallback": GridEvents["renderer-fallback"];
  "datasource-error": GridEvents["datasource-error"];
  "export-error": GridEvents["export-error"];
  ready: GridReadyEvent;
  "initialization-error": unknown;
}
```

</details>
