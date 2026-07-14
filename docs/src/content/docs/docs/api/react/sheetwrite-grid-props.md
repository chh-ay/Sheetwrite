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
<summary><code>className</code></summary>
<pre><code>className?: string;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-style" data-pagefind-weight="1">
<summary><code>style</code></summary>
<pre><code>style?: CSSProperties;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-fallback" data-pagefind-weight="1">
<summary><code>fallback</code></summary>
<pre><code>fallback?: ReactNode;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-height" data-pagefind-weight="1">
<summary><code>height</code></summary>
<pre><code>height?: number | string;</code></pre>
</details>

<details class="api-member" id="sheetwrite-grid-props-fill" data-pagefind-weight="1">
<summary><code>fill</code></summary>
<pre><code>fill?: true;</code></pre>
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
