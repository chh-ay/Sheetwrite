---
title: "Sheetwrite | @sheetwrite/svelte"
description: "Convenience component for local object rows."
---
<!-- api-export:@sheetwrite/svelte|.|Sheetwrite -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="variable">variable</span></div>

Convenience component for local object rows. Bind `grid` to access the live `Grid`.

Owns a sheet derived from `columns` and `defaultRows`. Bind `grid` for imperative access; it clears on reset or unmount.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/svelte/src/Sheetwrite.svelte.d.ts#L7</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function Sheetwrite(
  this: void,
  internals: ComponentInternals,
  props: any,
): {
  $on?(type: string, callback: (e: any) => void): () => void;
  $set?(props: any): void;
}
```

</div>
