---
title: "SheetwriteGridProps | @sheetwrite/react"
description: "Advanced framework adapter props for workbook data or datasource ownership."
tableOfContents: false
---
<!-- api-export:@sheetwrite/react|.|SheetwriteGridProps -->
[← @sheetwrite/react](/docs/api/react/)

<span class="api-status">interface</span>

Advanced framework adapter props for workbook data or datasource ownership.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L40</code></dd></div>
</dl>

## Members <span class="api-count">5</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-grid-props-class-name" data-pagefind-weight="1">
<summary><code>className</code> <span class="api-member-summary">Additional class appended to the required sheetwrite host class.</span></summary>
<pre><code>className?: string;</code></pre>
<p class="api-member-doc">Additional class appended to the required `sheetwrite` host class.</p>
</details>

<details class="api-member" id="sheetwrite-grid-props-style" data-pagefind-weight="1">
<summary><code>style</code> <span class="api-member-summary">Host styles merged before adapter sizing styles.</span></summary>
<pre><code>style?: CSSProperties;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1">
<summary><code>fallback</code> <span class="api-member-summary">Content shown while WASM is loading or after initialization fails.</span></summary>
<pre><code>fallback?: ReactNode;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code> <span class="api-member-summary">Host height in CSS pixels for numbers or any CSS length string.</span></summary>
<pre><code>height?: number | string;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code> <span class="api-member-summary">Fills the parent's available width and height, taking precedence over height.</span></summary>
<pre><code>fill?: true;</code></pre>
<p class="api-member-doc">Fills the parent's available width and height, taking precedence over `height`.</p>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface SheetwriteGridProps extends GridOptions, GridAdapterEventHandlers, SheetwriteInitializationProps, Omit<HTMLAttributes<HTMLDivElement>, keyof GridAdapterEventHandlers | "children"> {
    className?: string;
    style?: CSSProperties;
    fallback?: ReactNode;
    height?: number | string;
    fill?: true;
}
```

</details>
