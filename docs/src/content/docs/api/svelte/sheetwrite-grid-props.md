---
title: "SheetwriteGridProps | @sheetwrite/svelte"
description: "Advanced framework adapter props for workbook data or datasource ownership."
tableOfContents: false
---
<!-- api-export:@sheetwrite/svelte|.|SheetwriteGridProps -->
[← @sheetwrite/svelte](/docs/api/svelte/)

<span class="api-status">interface</span>

Advanced framework adapter props for workbook data or datasource ownership.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/props.ts#L12</code></dd></div>
</dl>

## Members <span class="api-count">18</span>

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

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1">
<summary><code>renderers</code> <span class="api-member-summary">Named custom cell renderers.</span></summary>

```ts generated
renderers?: GridOptions["renderers"];
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
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridProps extends Omit<HTMLAttributes<HTMLDivElement>, keyof GridAdapterEventHandlers | "children">, GridAdapterEventHandlers, SheetwriteInitializationProps {
    workbook: GridOptions["workbook"];
    data?: GridOptions["data"];
    datasource?: GridOptions["datasource"];
    datasourceStorage?: GridOptions["datasourceStorage"];
    renderer?: GridOptions["renderer"];
    workerUrl?: GridOptions["workerUrl"];
    theme?: GridOptions["theme"];
    readOnly?: GridOptions["readOnly"];
    protectionResolver?: GridOptions["protectionResolver"];
    mutationPolicy?: GridOptions["mutationPolicy"];
    renderers?: GridOptions["renderers"];
    overscan?: GridOptions["overscan"];
    minColumns?: GridOptions["minColumns"];
    config?: GridOptions["config"];
    height?: number | string;
    fill?: true;
    fallback?: Snippet;
    grid?: Grid;
}
```

</details>
