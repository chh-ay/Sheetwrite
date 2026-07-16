---
title: "RevisionRestoreResponse | @sheetwrite/core"
description: "Applied or conflict acknowledgement for a revision restore."
---
<!-- api-export:@sheetwrite/core|.|RevisionRestoreResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied or conflict acknowledgement for a revision restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L240</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  status: "applied";
  version: number;
  clientMutationId: string;
  snapshot: WorkbookSnapshot;
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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type RevisionRestoreResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      snapshot: WorkbookSnapshot;
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
