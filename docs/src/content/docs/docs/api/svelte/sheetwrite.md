---
title: "Sheetwrite | @sheetwrite/svelte"
description: "Convenience component for local object rows."
tableOfContents: false
---
<!-- api-export:@sheetwrite/svelte|.|Sheetwrite -->
[← @sheetwrite/svelte](/docs/api/svelte/)

<span class="api-status">variable</span>

Convenience component for local object rows. It derives a single-sheet workbook from
`columns`, `defaultRows`, and `sheetName`, initializes Sheetwrite, and owns reset and
teardown through the component lifecycle. Bind `grid` to access the live `Grid`; use
`SheetwriteGrid` when the host already owns a workbook or datasource.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/Sheetwrite.svelte.d.ts#L12</code></dd></div>
</dl>

## Signature

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
(this: void, internals: ComponentInternals, props: SheetwriteProps<Record<string, CellScalar>>): {
    $on?(type: string, callback: (e: any) => void): () => void;
    $set?(props: Partial<SheetwriteProps<Record<string, CellScalar>>>): void;
} => ;
```

</details>
