---
title: "SnapshotGridOptions | @sheetwrite/core"
description: "Grid creation options accepted when hydrating a validated snapshot."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|SnapshotGridOptions -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Grid creation options accepted when hydrating a validated snapshot.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L14</code></dd></div>
</dl>

## Signature

```ts generated title="TypeScript declaration"
export type SnapshotGridOptions = Omit<GridOptions, "workbook" | "data">;
```
