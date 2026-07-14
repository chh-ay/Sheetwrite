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
<summary><code>workbook</code></summary>
<pre><code>workbook: GridOptions[&quot;workbook&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-data" data-pagefind-weight="1">
<summary><code>data</code></summary>
<pre><code>data?: GridOptions[&quot;data&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-datasource" data-pagefind-weight="1">
<summary><code>datasource</code></summary>
<pre><code>datasource?: GridOptions[&quot;datasource&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-datasource-storage" data-pagefind-weight="1">
<summary><code>datasourceStorage</code></summary>
<pre><code>datasourceStorage?: GridOptions[&quot;datasourceStorage&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-renderer" data-pagefind-weight="1">
<summary><code>renderer</code></summary>
<pre><code>renderer?: GridOptions[&quot;renderer&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-worker-url" data-pagefind-weight="1">
<summary><code>workerUrl</code></summary>
<pre><code>workerUrl?: GridOptions[&quot;workerUrl&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-theme" data-pagefind-weight="1">
<summary><code>theme</code></summary>
<pre><code>theme?: GridOptions[&quot;theme&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-read-only" data-pagefind-weight="1">
<summary><code>readOnly</code></summary>
<pre><code>readOnly?: GridOptions[&quot;readOnly&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code></summary>
<pre><code>protectionResolver?: GridOptions[&quot;protectionResolver&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code></summary>
<pre><code>mutationPolicy?: GridOptions[&quot;mutationPolicy&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-renderers" data-pagefind-weight="1">
<summary><code>renderers</code></summary>
<pre><code>renderers?: GridOptions[&quot;renderers&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-overscan" data-pagefind-weight="1">
<summary><code>overscan</code></summary>
<pre><code>overscan?: GridOptions[&quot;overscan&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-min-columns" data-pagefind-weight="1">
<summary><code>minColumns</code></summary>
<pre><code>minColumns?: GridOptions[&quot;minColumns&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-config" data-pagefind-weight="1">
<summary><code>config</code></summary>
<pre><code>config?: GridOptions[&quot;config&quot;];</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code></summary>
<pre><code>height?: number | string;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code></summary>
<pre><code>fill?: true;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1">
<summary><code>fallback</code></summary>
<pre><code>fallback?: Snippet;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>
<pre><code>grid?: Grid;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
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
