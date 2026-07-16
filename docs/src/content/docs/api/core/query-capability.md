---
title: "QueryCapability | @sheetwrite/core"
description: "Whether a query is complete for the currently loaded datasource pages."
---
<!-- api-export:@sheetwrite/core|.|QueryCapability -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Whether a query is complete for the currently loaded datasource pages.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L103</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant">

```ts generated
{ status: "complete" }
```

</div>
<div class="api-variant">

```ts generated
{
  status: "incomplete";
  loadedCells: number;
  totalCells: number;
}
```

</div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type QueryCapability =
  | {
      status: "complete";
    }
  | {
      status: "incomplete";
      loadedCells: number;
      totalCells: number;
    };
```

</details>
