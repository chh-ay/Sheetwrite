---
title: "GridOptions | @sheetwrite/core"
description: "Workbook, data, rendering, policy, and built-in UI options used to create a Grid."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|GridOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Workbook, data, rendering, policy, and built-in UI options used to create a Grid.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L245</code></dd></div>
</dl>

## Members <span class="api-count">14</span>

<div class="api-member-list">

<details class="api-member" id="grid-options-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>
<pre><code>workbook: Workbook;</code></pre>
</details>

<details class="api-member" id="grid-options-data" data-pagefind-weight="1">
<summary><code>data</code></summary>
<pre><code>data?: ColumnarData;</code></pre>
</details>

<details class="api-member" id="grid-options-datasource" data-pagefind-weight="1">
<summary><code>datasource</code></summary>
<pre><code>datasource?: DataSource;</code></pre>
</details>

<details class="api-member" id="grid-options-datasource-storage" data-pagefind-weight="1">
<summary><code>datasourceStorage</code></summary>
<pre><code>datasourceStorage?: DataSourceStorageOptions;</code></pre>
</details>

<details class="api-member" id="grid-options-renderer" data-pagefind-weight="1">
<summary><code>renderer</code></summary>
<pre><code>renderer?: &quot;canvas&quot; | &quot;worker&quot;;</code></pre>
</details>

<details class="api-member" id="grid-options-worker-url" data-pagefind-weight="1">
<summary><code>workerUrl</code></summary>
<pre><code>workerUrl?: string | URL;</code></pre>
</details>

<details class="api-member" id="grid-options-theme" data-pagefind-weight="1">
<summary><code>theme</code></summary>
<pre><code>theme?: Partial&lt;Theme&gt;;</code></pre>
</details>

<details class="api-member" id="grid-options-read-only" data-pagefind-weight="1">
<summary><code>readOnly</code></summary>
<pre><code>readOnly?: boolean;</code></pre>
</details>

<details class="api-member" id="grid-options-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code></summary>
<pre><code>protectionResolver?: ProtectionResolver;</code></pre>
</details>

<details class="api-member" id="grid-options-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code></summary>
<pre><code>mutationPolicy?: MutationPolicyMode;</code></pre>
</details>

<details class="api-member" id="grid-options-renderers" data-pagefind-weight="1">
<summary><code>renderers</code></summary>
<pre><code>renderers?: Record&lt;string, CellRenderer&gt;;</code></pre>
</details>

<details class="api-member" id="grid-options-overscan" data-pagefind-weight="1">
<summary><code>overscan</code></summary>
<pre><code>overscan?: number;</code></pre>
</details>

<details class="api-member" id="grid-options-min-columns" data-pagefind-weight="1">
<summary><code>minColumns</code></summary>
<pre><code>minColumns?: number;</code></pre>
</details>

<details class="api-member" id="grid-options-config" data-pagefind-weight="1">
<summary><code>config</code></summary>
<pre><code>config?: GridConfig;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface GridOptions {
    workbook: Workbook;
    data?: ColumnarData;
    datasource?: DataSource;
    datasourceStorage?: DataSourceStorageOptions;
    renderer?: "canvas" | "worker";
    workerUrl?: string | URL;
    theme?: Partial<Theme>;
    readOnly?: boolean;
    protectionResolver?: ProtectionResolver;
    mutationPolicy?: MutationPolicyMode;
    renderers?: Record<string, CellRenderer>;
    overscan?: number;
    minColumns?: number;
    config?: GridConfig;
}
```

</details>
