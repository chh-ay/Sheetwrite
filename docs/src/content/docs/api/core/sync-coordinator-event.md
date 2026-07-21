---
title: "SyncCoordinatorEvent | @sheetwrite/core"
description: "Queue, version, connection, or error transition emitted by synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Queue, version, connection, or error transition emitted by synchronization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L213</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>12</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ type: "state"; state: SyncStateSnapshot }
```

</div>
<div class="api-variant">

```ts generated
{ type: "restored"; pending: readonly SyncMutationRecord[] }
```

</div>
<div class="api-variant">

```ts generated
{ type: "persisting"; mutation: SyncMutationRecord }
```

</div>
<div class="api-variant">

```ts generated
{ type: "pending"; mutation: SyncMutationRecord }
```

</div>
<div class="api-variant">

```ts generated
{ type: "sending"; mutation: SyncMutationRecord }
```

</div>
<div class="api-variant">

```ts generated
{
  type: "acknowledged";
  clientMutationId: string;
  version: number;
  duplicate: boolean;
}
```

</div>
<div class="api-variant">

```ts generated
{
  type: "conflict";
  mutation: SyncMutationRecord;
  response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
}
```

</div>
<div class="api-variant">

```ts generated
{ type: "remote-applied"; operation: VersionedOperation }
```

</div>
<div class="api-variant">

```ts generated
{
  type: "reload-required";
  expectedVersion: number;
  receivedVersion: number;
  snapshot?: WorkbookSnapshot;
}
```

</div>
<div class="api-variant">

```ts generated
{
  type: "reloaded";
  serverVersion: number;
  pending: readonly SyncMutationRecord[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  type: "storage-error";
  error: unknown;
  clientMutationId?: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ type: "error"; error: unknown; clientMutationId?: string }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SyncCoordinatorEvent =
  | {
      type: "state";
      state: SyncStateSnapshot;
    }
  | {
      type: "restored";
      pending: readonly SyncMutationRecord[];
    }
  | {
      type: "persisting";
      mutation: SyncMutationRecord;
    }
  | {
      type: "pending";
      mutation: SyncMutationRecord;
    }
  | {
      type: "sending";
      mutation: SyncMutationRecord;
    }
  | {
      type: "acknowledged";
      clientMutationId: string;
      version: number;
      duplicate: boolean;
    }
  | {
      type: "conflict";
      mutation: SyncMutationRecord;
      response: Extract<
        PersistenceCommitResponse,
        {
          status: "conflict";
        }
      >;
    }
  | {
      type: "remote-applied";
      operation: VersionedOperation;
    }
  | {
      type: "reload-required";
      expectedVersion: number;
      receivedVersion: number;
      snapshot?: WorkbookSnapshot;
    }
  | {
      type: "reloaded";
      serverVersion: number;
      pending: readonly SyncMutationRecord[];
    }
  | {
      type: "storage-error";
      error: unknown;
      clientMutationId?: string;
    }
  | {
      type: "error";
      error: unknown;
      clientMutationId?: string;
    };
```

</details>
