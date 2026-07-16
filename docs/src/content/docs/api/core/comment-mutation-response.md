---
title: "CommentMutationResponse | @sheetwrite/core"
description: "Applied, duplicate, or conflict acknowledgement for a comment mutation."
---
<!-- api-export:@sheetwrite/core|.|CommentMutationResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied, duplicate, or conflict acknowledgement for a comment mutation.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L407</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant">

```ts generated
{
  status: "applied";
  version: number;
  clientMutationId: string;
  thread: CommentThread;
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "duplicate";
  version: number;
  clientMutationId: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ status: "conflict"; currentVersion: number }
```

</div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type CommentMutationResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      thread: CommentThread;
    }
  | {
      status: "duplicate";
      version: number;
      clientMutationId: string;
    }
  | {
      status: "conflict";
      currentVersion: number;
    };
```

</details>
