---
title: "DocumentRebaseResult | @sheetwrite/core"
description: "Successful rebased operations or a conservative rebase conflict."
---
<!-- api-export:@sheetwrite/core|.|DocumentRebaseResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Successful rebased operations or a conservative rebase conflict.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L23</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ status: "rebased"; operations: readonly DocumentOp[] }
```

</div>
<div class="api-variant">

```ts generated
{ status: "conflict"; conflict: RebaseConflict }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DocumentRebaseResult =
  | {
      status: "rebased";
      operations: readonly DocumentOp[];
    }
  | {
      status: "conflict";
      conflict: RebaseConflict;
    };
```

</details>
