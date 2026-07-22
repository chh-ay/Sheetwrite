---
title: "SheetwriteGridProps | @sheetwrite/react"
description: "Advanced framework adapter props for workbook data or datasource ownership."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced framework adapter props for workbook data or datasource ownership.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L68</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>10</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-on-mutation-rejected" data-pagefind-weight="1">
<summary><code>onMutationRejected</code> <span class="api-member-summary">Receives structured issues when a Grid mutation is rejected.</span></summary>

```ts generated
onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-renderer-fallback" data-pagefind-weight="1">
<summary><code>onRendererFallback</code> <span class="api-member-summary">Fires when worker rendering falls back to the main-thread canvas renderer.</span></summary>

```ts generated
onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-datasource-error" data-pagefind-weight="1">
<summary><code>onDatasourceError</code> <span class="api-member-summary">Receives failed datasource requests and their errors.</span></summary>

```ts generated
onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-export-error" data-pagefind-weight="1">
<summary><code>onExportError</code> <span class="api-member-summary">Receives failures from built-in XLSX export actions.</span></summary>

```ts generated
onExportError?: GridAdapterEventHandlers["onExportError"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-on-ready" data-pagefind-weight="1">
<summary><code>onReady</code> <span class="api-member-summary">Fires after the adapter publishes a ready Grid generation.</span></summary>

```ts generated
onReady?: GridAdapterEventHandlers["onReady"];
```

</details>

<details class="api-member" id="sheetwrite-grid-props-class-name" data-pagefind-weight="1">
<summary><code>className</code> <span class="api-member-summary">Additional class appended to the required sheetwrite host class.</span></summary>

```ts generated
className?: string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-style" data-pagefind-weight="1">
<summary><code>style</code> <span class="api-member-summary">Host styles merged before adapter sizing styles.</span></summary>

```ts generated
style?: CSSProperties;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1">
<summary><code>fallback</code> <span class="api-member-summary">Content shown while WASM is loading or after initialization fails.</span></summary>

```ts generated
fallback?: ReactNode;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Host height in CSS pixels for numbers or any CSS length string.</span></summary>

```ts generated
height?: number | string;
```

</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available width and height, taking precedence over height.</span></summary>

```ts generated
fill?: true;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteGridProps
  extends
    GridOptions,
    GridAdapterEventHandlers,
    SheetwriteInitializationProps {
  onMutationRejected?: GridAdapterEventHandlers["onMutationRejected"];
  onRendererFallback?: GridAdapterEventHandlers["onRendererFallback"];
  onDatasourceError?: GridAdapterEventHandlers["onDatasourceError"];
  onExportError?: GridAdapterEventHandlers["onExportError"];
  onReady?: GridAdapterEventHandlers["onReady"];
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  height?: number | string;
  fill?: true;
}
```

</details>
