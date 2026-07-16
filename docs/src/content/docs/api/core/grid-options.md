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
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L253</code></dd></div>
</dl>

## Members <span class="api-count">14</span>

<div class="api-member-list">

<details class="api-member" id="grid-options-workbook" data-pagefind-weight="1">
<summary><code>workbook</code> <span class="api-member-summary">Live workbook schema adopted by the store and updated by document operations.</span></summary>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="grid-options-data" data-pagefind-weight="1">
<summary><code>data</code> <span class="api-member-summary">Eager column-major values loaded into workbook.activeSheet; use instead of datasource.</span></summary>

```ts generated
data?: ColumnarData;
```

</details>

<details class="api-member" id="grid-options-datasource" data-pagefind-weight="1">
<summary><code>datasource</code> <span class="api-member-summary">Lazy row provider requested for visible windows; use instead of eager data.</span></summary>

```ts generated
datasource?: DataSource;
```

</details>

<details class="api-member" id="grid-options-datasource-storage" data-pagefind-weight="1">
<summary><code>datasourceStorage</code> <span class="api-member-summary">Allocation and cache policy for datasource-backed cell storage.</span></summary>

```ts generated
datasourceStorage?: DataSourceStorageOptions;
```

</details>

<details class="api-member" id="grid-options-renderer" data-pagefind-weight="1">
<summary><code>renderer</code> <span class="api-member-summary">Paint backend; defaults to main-thread canvas and falls back there if a worker fails.</span></summary>

```ts generated
renderer?: "canvas" | "worker";
```

</details>

<details class="api-member" id="grid-options-worker-url" data-pagefind-weight="1">
<summary><code>workerUrl</code> <span class="api-member-summary">URL of the worker renderer module (renderer: &quot;worker&quot;), as served to the BROWSER — the platform Worker constructor does not consult package exports, so a bare specifier like new URL(&quot;@sheetwrite/core/worker&quot;,…</span></summary>

```ts generated
workerUrl?: string | URL;
```

<p class="api-member-doc">URL of the worker renderer module (`renderer: &quot;worker&quot;`), as served to the
BROWSER — the platform `Worker` constructor does not consult package
exports, so a bare specifier like `new URL(&quot;@sheetwrite/core/worker&quot;,
import.meta.url)` is NOT reliable. Either copy
`@sheetwrite/core/dist/worker.js` to your public assets and pass its URL
string (works everywhere), or use your bundler's dependency-worker import
if it has one (see `/docs/guides/worker-rendering/`). If omitted or the worker
can't be constructed, the grid falls back to the main-thread canvas
renderer and emits `renderer-fallback` once.</p>
</details>

<details class="api-member" id="grid-options-theme" data-pagefind-weight="1">
<summary><code>theme</code> <span class="api-member-summary">Overrides merged over the default theme and host CSS custom properties.</span></summary>

```ts generated
theme?: Partial<Theme>;
```

</details>

<details class="api-member" id="grid-options-read-only" data-pagefind-weight="1">
<summary><code>readOnly</code> <span class="api-member-summary">Disables mutating interactions while preserving navigation and selection.</span></summary>

```ts generated
readOnly?: boolean;
```

</details>

<details class="api-member" id="grid-options-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code> <span class="api-member-summary">Host-owned client UX permission check.</span></summary>

```ts generated
protectionResolver?: ProtectionResolver;
```

<p class="api-member-doc">Host-owned client UX permission check. Servers must independently authorize
every submitted operation; this resolver is not an authentication boundary.</p>
</details>

<details class="api-member" id="grid-options-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code> <span class="api-member-summary">Atomic rejects the transaction; partial skips denied operation objects.</span></summary>

```ts generated
mutationPolicy?: MutationPolicyMode;
```

</details>

<details class="api-member" id="grid-options-renderers" data-pagefind-weight="1">
<summary><code>renderers</code> <span class="api-member-summary">Custom cell renderers registered up front; also see Grid.defineCellRenderer.</span></summary>

```ts generated
renderers?: Record<string, CellRenderer>;
```

</details>

<details class="api-member" id="grid-options-overscan" data-pagefind-weight="1">
<summary><code>overscan</code> <span class="api-member-summary">Rows rendered above/below the viewport to absorb fast scrolls.</span></summary>

```ts generated
overscan?: number;
```

</details>

<details class="api-member" id="grid-options-min-columns" data-pagefind-weight="1">
<summary><code>minColumns</code> <span class="api-member-summary">Render at least this many columns (empty padding columns past the data, like a spreadsheet).</span></summary>

```ts generated
minColumns?: number;
```

</details>

<details class="api-member" id="grid-options-config" data-pagefind-weight="1">
<summary><code>config</code> <span class="api-member-summary">Built-in UI controls; providing an object enables the toolbar unless toolbar is false.</span></summary>

```ts generated
config?: GridConfig;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
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
