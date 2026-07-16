---
title: "createGridFromSnapshot | @sheetwrite/core"
description: "Mount a grid over a validated, non-dirty snapshot."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|createGridFromSnapshot -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">function</span>

Mount a grid over a validated, non-dirty snapshot. The grid owns and disposes
the hydrated store just like one created through `createGrid`.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L35</code></dd></div>
</dl>

## Signature

```ts generated
function createGridFromSnapshot(host: HTMLElement, snapshot: unknown, options?: SnapshotGridOptions): Grid;
```
