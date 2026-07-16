---
title: "createGridFromSnapshot | @sheetwrite/core"
description: "Mount a grid over a validated, non-dirty snapshot."
---
<!-- api-export:@sheetwrite/core|.|createGridFromSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

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
