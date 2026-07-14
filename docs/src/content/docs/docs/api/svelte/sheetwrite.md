---
title: "Sheetwrite | @sheetwrite/svelte"
description: "Simple framework component that owns initialization and Grid lifetime."
tableOfContents: false
---
<!-- api-export:@sheetwrite/svelte|.|Sheetwrite -->
[← @sheetwrite/svelte](/docs/api/svelte/)

<span class="api-status">variable</span>

Simple framework component that owns initialization and Grid lifetime.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/Sheetwrite.svelte.d.ts#L7</code></dd></div>
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
