---
title: "SheetwriteGridProps | @sheetwrite/react"
description: "Advanced framework adapter props for workbook data or datasource ownership."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteGridProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Advanced framework adapter props for workbook data or datasource ownership.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L40</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

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
    SheetwriteInitializationProps,
    Omit<
      HTMLAttributes<HTMLDivElement>,
      keyof GridAdapterEventHandlers | "children"
    > {
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  height?: number | string;
  fill?: true;
}
```

</details>
