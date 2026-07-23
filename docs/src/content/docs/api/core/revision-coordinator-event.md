---
title: "RevisionCoordinatorEvent | @sheetwrite/core"
description: "State or restore transition emitted by revision coordination."
---
<!-- api-export:@sheetwrite/core|.|RevisionCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

State or restore transition emitted by revision coordination.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L287</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ type: "restored"; targetVersion: number; version: number }
```

</div>
<div class="api-variant">

```ts generated
{
  type: "conflict";
  targetVersion: number;
  currentVersion: number;
}
```

</div>
<div class="api-variant">

```ts generated
{ type: "error"; error: SheetwriteError }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type RevisionCoordinatorEvent =
  | {
      type: "restored";
      targetVersion: number;
      version: number;
    }
  | {
      type: "conflict";
      targetVersion: number;
      currentVersion: number;
    }
  | {
      type: "error";
      error: SheetwriteError;
    };
```

</details>
