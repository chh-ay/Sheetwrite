---
title: "PresenceCoordinatorEvent | @sheetwrite/core"
description: "Connection or actor transition emitted by presence coordination."
---
<!-- api-export:@sheetwrite/core|.|PresenceCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Connection or actor transition emitted by presence coordination.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/collaboration.ts#L50</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant">

```ts generated
{ type: "published"; message: PresenceMessage }
```

</div>
<div class="api-variant">

```ts generated
{ type: "updated"; actorId: string }
```

</div>
<div class="api-variant">

```ts generated
{ type: "expired"; actorId: string }
```

</div>
<div class="api-variant">

```ts generated
{ type: "error"; error: unknown }
```

</div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type PresenceCoordinatorEvent =
  | {
      type: "published";
      message: PresenceMessage;
    }
  | {
      type: "updated";
      actorId: string;
    }
  | {
      type: "expired";
      actorId: string;
    }
  | {
      type: "error";
      error: unknown;
    };
```

</details>
