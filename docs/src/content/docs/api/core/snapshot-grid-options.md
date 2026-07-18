---
title: "SnapshotGridOptions | @sheetwrite/core"
description: "Grid creation options accepted when hydrating a validated snapshot."
---
<!-- api-export:@sheetwrite/core|.|SnapshotGridOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Grid creation options accepted when hydrating a validated snapshot.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L19</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SnapshotGridOptions = Omit<GridOptions, "workbook" | "data"> & {
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
};
```

</div>
