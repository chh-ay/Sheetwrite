---
title: "SheetwriteGridProps | @sheetwrite/svelte"
description: "Advanced Svelte adapter props with inferred host row identity."
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced Svelte adapter props with inferred host row identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/props.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>39</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-workbook" data-pagefind-weight="1">
<summary><code>workbook</code> <span class="api-member-summary">Live workbook schema adopted by the Grid.</span></summary>

```ts generated
workbook: GridOptions["workbook"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-data" data-pagefind-weight="1">
<summary><code>data</code> <span class="api-member-summary">Eager values for the active sheet.</span></summary>

```ts generated
data?: GridOptions["data"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-row-bridge" data-pagefind-weight="1">
<summary><code>rowBridge</code> <span class="api-member-summary">Optional canonical-to-host row projection.</span></summary>

```ts generated
rowBridge?: RowBridge<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource" data-pagefind-weight="1">
<summary><code>datasource</code> <span class="api-member-summary">Lazy visible-row provider.</span></summary>

```ts generated
datasource?: GridOptions["datasource"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-datasource-storage" data-pagefind-weight="1">
<summary><code>datasourceStorage</code> <span class="api-member-summary">Datasource storage policy.</span></summary>

```ts generated
datasourceStorage?: GridOptions["datasourceStorage"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderer" data-pagefind-weight="1">
<summary><code>renderer</code> <span class="api-member-summary">Canvas or worker paint backend.</span></summary>

```ts generated
renderer?: GridOptions["renderer"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-worker-url" data-pagefind-weight="1">
<summary><code>workerUrl</code> <span class="api-member-summary">Browser-fetchable worker module URL.</span></summary>

```ts generated
workerUrl?: GridOptions["workerUrl"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-presentation" data-pagefind-weight="1">
<summary><code>presentation</code> <span class="api-member-summary">Positional spreadsheet or semantic data-grid headers.</span></summary>

```ts generated
presentation?: GridOptions["presentation"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-theme" data-pagefind-weight="1">
<summary><code>theme</code> <span class="api-member-summary">Live resolved-theme overrides.</span></summary>

```ts generated
theme?: GridOptions["theme"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-read-only" data-pagefind-weight="1">
<summary><code>readOnly</code> <span class="api-member-summary">Disables mutations, not navigation.</span></summary>

```ts generated
readOnly?: GridOptions["readOnly"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code> <span class="api-member-summary">Client protected-range check.</span></summary>

```ts generated
protectionResolver?: GridOptions["protectionResolver"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code> <span class="api-member-summary">Atomic or partial denial policy.</span></summary>

```ts generated
mutationPolicy?: GridOptions["mutationPolicy"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-transaction-resource-limits" data-pagefind-weight="1">
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation.</span></summary>

```ts generated
transactionResourceLimits?: GridOptions["transactionResourceLimits"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-hyperlink-activation" data-pagefind-weight="1">
<summary><code>hyperlinkActivation</code> <span class="api-member-summary">Controls link activation: emit an event, also navigate internally, or disable it.</span></summary>

```ts generated
hyperlinkActivation?: GridOptions["hyperlinkActivation"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1">
<summary><code>renderers</code> <span class="api-member-summary">Named custom cell renderers.</span></summary>

```ts generated
renderers?: GridOptions["renderers"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-editors" data-pagefind-weight="1">
<summary><code>editors</code> <span class="api-member-summary">Named custom cell editors.</span></summary>

```ts generated
editors?: GridOptions["editors"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-overscan" data-pagefind-weight="1">
<summary><code>overscan</code> <span class="api-member-summary">Extra rows painted around the viewport.</span></summary>

```ts generated
overscan?: GridOptions["overscan"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-min-columns" data-pagefind-weight="1">
<summary><code>minColumns</code> <span class="api-member-summary">Minimum column count with padding.</span></summary>

```ts generated
minColumns?: GridOptions["minColumns"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-config" data-pagefind-weight="1">
<summary><code>config</code> <span class="api-member-summary">Built-in UI control configuration.</span></summary>

```ts generated
config?: GridOptions["config"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Host height as pixels or a CSS length.</span></summary>

```ts generated
height?: number | string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available size.</span></summary>

```ts generated
fill?: true;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1">
<summary><code>fallback</code> <span class="api-member-summary">Content shown until initialization succeeds.</span></summary>

```ts generated
fallback?: Snippet;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-grid" data-pagefind-weight="1">
<summary><code>grid</code> <span class="api-member-summary">Bindable live Grid, cleared on reset or unmount.</span></summary>

```ts generated
grid?: Grid;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-grid-change" data-pagefind-weight="1">
<summary><code>onGridChange</code> <span class="api-member-summary">Receives every committed Grid change, including its applied transaction.</span></summary>

```ts generated
onGridChange?: (event: ChangeEvent) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-row-delta" data-pagefind-weight="1">
<summary><code>onRowDelta</code> <span class="api-member-summary">Receives projected host-row effects when a row bridge is attached.</span></summary>

```ts generated
onRowDelta?: RowBridgeHandler<Id>;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-selection-change" data-pagefind-weight="1">
<summary><code>onSelectionChange</code> <span class="api-member-summary">Receives the current selection, or null after it is cleared.</span></summary>

```ts generated
onSelectionChange?: (selection: Selection | null) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-viewport-change" data-pagefind-weight="1">
<summary><code>onViewportChange</code> <span class="api-member-summary">Receives visible row bounds and vertical scroll offset after scrolling.</span></summary>

```ts generated
onViewportChange?: (event: GridEvents["scroll"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-edit-begin" data-pagefind-weight="1">
<summary><code>onEditBegin</code> <span class="api-member-summary">Fires when cell editing begins.</span></summary>

```ts generated
onEditBegin?: (event: GridEvents["edit-begin"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-edit-commit" data-pagefind-weight="1">
<summary><code>onEditCommit</code> <span class="api-member-summary">Fires after an edit commits its parsed cell value.</span></summary>

```ts generated
onEditCommit?: (event: GridEvents["edit-commit"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-search" data-pagefind-weight="1">
<summary><code>onSearch</code> <span class="api-member-summary">Receives refreshed search matches and active-match index.</span></summary>

```ts generated
onSearch?: (result: GridEvents["search"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-active-sheet-change" data-pagefind-weight="1">
<summary><code>onActiveSheetChange</code> <span class="api-member-summary">Fires after the visible sheet changes.</span></summary>

```ts generated
onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-command-state-change" data-pagefind-weight="1">
<summary><code>onCommandStateChange</code> <span class="api-member-summary">Receives observable undo/redo and formatting command state.</span></summary>

```ts generated
onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-mutation-rejected" data-pagefind-weight="1">
<summary><code>onMutationRejected</code> <span class="api-member-summary">Receives structured issues when a Grid mutation is rejected.</span></summary>

```ts generated
onMutationRejected?: (event: GridEvents["mutation-rejected"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-renderer-fallback" data-pagefind-weight="1">
<summary><code>onRendererFallback</code> <span class="api-member-summary">Fires when worker rendering falls back to the main-thread canvas renderer.</span></summary>

```ts generated
onRendererFallback?: (event: GridEvents["renderer-fallback"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-datasource-error" data-pagefind-weight="1">
<summary><code>onDatasourceError</code> <span class="api-member-summary">Receives failed datasource requests and their errors.</span></summary>

```ts generated
onDatasourceError?: (event: GridEvents["datasource-error"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-export-error" data-pagefind-weight="1">
<summary><code>onExportError</code> <span class="api-member-summary">Receives failures from built-in XLSX export actions.</span></summary>

```ts generated
onExportError?: (event: GridEvents["export-error"]) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

```ts generated
onReady?: (event: GridReadyEvent) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-initialization-error" data-pagefind-weight="1">
<summary><code>onInitializationError</code> <span class="api-member-summary">Receives a WASM initialization failure while the adapter remains mounted.</span></summary>

```ts generated
onInitializationError?: (error: SheetwriteError) => void;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code> <span class="api-member-summary">Explicit source passed to process-wide WASM initialization; concurrent initialization is first-source-wins.</span></summary>

```ts generated
wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridProps<
  Id extends RowBridgeId = RowBridgeId,
> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  keyof GridAdapterEventHandlers<Id> | "children"
> {
  workbook: GridOptions["workbook"];
  data?: GridOptions["data"];
  rowBridge?: RowBridge<Id>;
  datasource?: GridOptions["datasource"];
  datasourceStorage?: GridOptions["datasourceStorage"];
  renderer?: GridOptions["renderer"];
  workerUrl?: GridOptions["workerUrl"];
  presentation?: GridOptions["presentation"];
  theme?: GridOptions["theme"];
  readOnly?: GridOptions["readOnly"];
  protectionResolver?: GridOptions["protectionResolver"];
  mutationPolicy?: GridOptions["mutationPolicy"];
  transactionResourceLimits?: GridOptions["transactionResourceLimits"];
  hyperlinkActivation?: GridOptions["hyperlinkActivation"];
  renderers?: GridOptions["renderers"];
  editors?: GridOptions["editors"];
  overscan?: GridOptions["overscan"];
  minColumns?: GridOptions["minColumns"];
  config?: GridOptions["config"];
  height?: number | string;
  fill?: true;
  fallback?: Snippet;
  grid?: Grid;
  onGridChange?: (event: ChangeEvent) => void;
  onRowDelta?: RowBridgeHandler<Id>;
  onSelectionChange?: (selection: Selection | null) => void;
  onViewportChange?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
  onMutationRejected?: (event: GridEvents["mutation-rejected"]) => void;
  onRendererFallback?: (event: GridEvents["renderer-fallback"]) => void;
  onDatasourceError?: (event: GridEvents["datasource-error"]) => void;
  onExportError?: (event: GridEvents["export-error"]) => void;
  onReady?: (event: GridReadyEvent) => void;
  onInitializationError?: (error: SheetwriteError) => void;
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
}
```

</details>
