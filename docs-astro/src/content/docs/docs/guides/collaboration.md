---
title: Collaboration and offline work
description: Sequence, persist, acknowledge, retry, and conservatively rebase Sheetwrite document operations.
---

Sheetwrite provides transport-, database-, and authentication-neutral collaboration primitives. The host still owns server sequencing, durable document storage, user identity, authorization, and network lifecycle.

## Load, mount, queue, and acknowledge

Load a validated snapshot before mounting, then let one `SyncCoordinator`
observe local grid transactions. Do not also save `event.changes`: that list is
cell-oriented rollback detail and omits document metadata operations.

```ts partial="requires surrounding host state" title="Partial example"
import {
  createGridFromSnapshot,
  SyncCoordinator,
  type PersistenceAdapter,
  type RemoteOperationSource,
} from "@sheetwrite/core";

const documentId = "workbook-42";
const snapshot = await persistenceAdapter.load(documentId);
const grid = createGridFromSnapshot(document.querySelector("#grid")!, snapshot);
const sync = new SyncCoordinator(grid, persistenceAdapter, {
  documentId,
  serverVersion: snapshot.version ?? 0,
});

sync.on((event) => {
  if (event.type === "acknowledged") {
    console.log(`server version ${event.version} acknowledged ${event.clientMutationId}`);
  } else if (event.type === "conflict") {
    console.error("conflict retained for host recovery", event.mutation);
  }
});

await sync.ready();
const unsubscribeRemote = sync.subscribe(remoteOperationSource);

saveButton.addEventListener("click", () => {
  void sync.flush(); // sends in order; each response acknowledges only its mutation ID
});

// Teardown:
// unsubscribeRemote();
// sync.destroy();
// grid.destroy();
```

`SyncCoordinator` subscribes to `Grid` changes itself. Local rendering remains
optimistic; the host controls when to call `sendNext`, `flush`, or `retry`.
`applied` and `duplicate` responses acknowledge the matching operations and
remove that mutation. A transport error leaves the immutable record pending.

An HTTP adapter can stay transport-neutral at the core boundary:

```ts partial="requires surrounding host state" title="Partial example"
import type {
  PersistenceAdapter,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  WorkbookSnapshot,
} from "@sheetwrite/core";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Persistence request failed: ${response.status}`);
  return (await response.json()) as T;
}

const persistenceAdapter: PersistenceAdapter = {
  async load(documentId, signal) {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { signal });
    return responseJson<WorkbookSnapshot>(response);
  },
  async commit(request: PersistenceCommitRequest) {
    const { signal, ...body } = request;
    const response = await fetch(
      `/api/documents/${encodeURIComponent(request.documentId)}/operations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    );
    return responseJson<PersistenceCommitResponse>(response);
  },
};
```

The server must authenticate the request, authorize every operation, validate
the document schema/policy, and assign the version. Client protection metadata
is not authorization.

## Database-neutral server model

A snapshot plus append-only operation log is the default persistence shape:

```sql partial="illustrative output or schema" title="Illustrative excerpt"
documents(
  document_id       primary key,
  current_version   integer not null,
  snapshot_version  integer not null,
  snapshot_json     json not null
)

document_operations(
  document_id        not null,
  version            integer not null,
  client_mutation_id text not null,
  operations_json    json not null,
  created_at         server_timestamp not null,
  primary key(document_id, version),
  unique(document_id, client_mutation_id)
)
```

Handle `commit()` in one database transaction:

1. Return `duplicate` with the existing version when
   `(document_id, client_mutation_id)` already exists.
2. Lock/read the document version. If it differs from `baseVersion`, return
   `conflict` with ordered operations since base or a current snapshot.
3. Validate and authorize the submitted `DocumentOp[]` on the server.
4. Append at `current_version + 1`, update the document version, and return
   `applied` with the same mutation ID.
5. Periodically fold the log into `snapshot_json`; never rewrite operation
   versions or accept client-authored server timestamps.

Normalized cell tables are an alternative for products that need SQL queries
over cell values. They do not replace the protocol: the host must still
reconstruct a complete schema-versioned `WorkbookSnapshot`, preserve formula
source/style/metadata, and serialize structural operations under one document
version. Mixing independent cell writes with the operation log breaks atomic
row/column/formula semantics.

## Durable pending commits

`SyncCoordinator` can receive a `PendingCommitStorage` adapter. With one configured, it:

1. persists each immutable commit before it can be sent;
2. restores pending commits on startup and reapplies them locally as remote-source operations, so restoration does not echo into the outgoing queue;
3. retries with the original `clientMutationId` after reconnect or reload;
4. removes durable work only after an `applied` or `duplicate` acknowledgement; and
5. retains conflicts and storage failures for explicit host recovery.

Await `coordinator.ready()` before declaring startup synchronized. Use `initialConnection: "offline"` for offline-first startup, `setOnline(false)` on disconnect, and `setOnline(true)` to reconnect and drain pending work in order. `coordinator.state` distinguishes connection state from hydration, persistence, sending, conflict, and error activity.

The browser IndexedDB implementation is intentionally isolated from Node and SSR entrypoints:

```ts partial="requires surrounding host state" title="Partial example"
import { SyncCoordinator } from "@sheetwrite/core";
import { IndexedDbPendingCommitStorage } from "@sheetwrite/core/browser";

const pendingStorage = new IndexedDbPendingCommitStorage({
  databaseName: "my-product-sheetwrite",
});

const sync = new SyncCoordinator(grid, persistenceAdapter, {
  documentId: "workbook-42",
  serverVersion: snapshot.version ?? 0,
  pendingStorage,
  initialConnection: navigator.onLine ? "online" : "offline",
});

await sync.ready();
window.addEventListener("online", () => sync.setOnline(true));
window.addEventListener("offline", () => sync.setOnline(false));
```

IndexedDB record migration is versioned. Unsupported future schemas, blocked upgrades, quota exhaustion, transaction failures, and aborts surface as typed `IndexedDbPendingCommitStorageError` codes. Core continues to work without IndexedDB when no durable adapter is supplied.

## Remote operations and version gaps

`SyncCoordinator.subscribe` accepts either `RemoteOperationSource` or `AsyncIterable<VersionedOperation>`. Operations apply only at `serverVersion + 1`; own echoed mutation IDs and already acknowledged IDs are deduplicated. Remote application uses `Grid.applyRemoteOperations`, so it does not create outgoing dirty work or local undo entries.

A gap emits `reload-required`. Prefer fetching missing ordered operations through
`recoverVersionGap`; the coordinator applies them in sequence. A returned
snapshot is a host remount signal, not an automatic store replacement.
`resumeAfterReload(snapshot)` updates retained queue base versions only after the
host has installed that snapshot and reapplied local work; it does not hydrate a
grid or attach the coordinator to a newly created grid.

### Conflict and snapshot reload

Never acknowledge or discard a conflicted mutation implicitly. If the server
returns both `operationsSinceBase` and a current snapshot, the host can gate
every pending transaction through the conservative rebaser, clear the old
durable IDs, remount, and submit the safe results as new mutations:

```ts partial="requires surrounding host state" title="Partial example"
import {
  createGridFromSnapshot,
  rebaseDocumentOperations,
  SyncCoordinator,
  type Grid,
  type PersistenceCommitResponse,
} from "@sheetwrite/core";

type ConflictResponse = Extract<PersistenceCommitResponse, { status: "conflict" }>;
interface SyncSession {
  grid: Grid;
  sync: SyncCoordinator;
  unsubscribeRemote: () => void;
}

async function reloadAfterConflict(
  session: SyncSession,
  response: ConflictResponse,
): Promise<SyncSession> {
  if (!response.operationsSinceBase) {
    console.error("Manual conflict review required: server did not return an operation tail");
    return session;
  }

  const pending = session.sync.pendingCommits();
  const remoteOperations = response.operationsSinceBase.flatMap((entry) => [
    ...entry.operations,
  ]);
  const safeBatches: Array<ReturnType<typeof rebaseDocumentOperations> & {
    status: "rebased";
  }> = [];

  for (const record of pending) {
    const result = rebaseDocumentOperations(record.operations, remoteOperations);
    if (result.status === "conflict") {
      console.error("Manual conflict review required", result.conflict);
      return session; // old queue and grid remain intact
    }
    safeBatches.push(result);
  }

  const latest = response.snapshot ?? (await persistenceAdapter.load(documentId));
  for (const record of pending) {
    await pendingStorage.remove(documentId, record.clientMutationId);
  }

  session.unsubscribeRemote();
  session.sync.destroy();
  session.grid.destroy();

  const grid = createGridFromSnapshot(document.querySelector("#grid")!, latest);
  const sync = new SyncCoordinator(grid, persistenceAdapter, {
    documentId,
    serverVersion: latest.version ?? 0,
    pendingStorage,
  });
  await sync.ready(); // the stale IDs were removed before hydration

  for (const batch of safeBatches) {
    const outcome = grid.applyTransaction({ patches: [...batch.operations] });
    if (outcome.status !== "applied") {
      throw new Error(`Rebased local transaction was not applied: ${outcome.status}`);
    }
  }

  const unsubscribeRemote = sync.subscribe(remoteOperationSource);
  await sync.flush();
  return { grid, sync, unsubscribeRemote };
}
```

When the rebaser reports `conflict`—overlap, formulas across structural changes,
concurrent moves, or sheet lifecycle ambiguity—keep the original queue and show
product-specific conflict UI. If the server returns only a snapshot, the host
cannot infer a safe transform; offer explicit discard/export/manual re-entry
instead. Reloading a snapshot over pending edits without this decision loses
intent.

## Presence

`PresenceCoordinator` publishes actor metadata, active sheet, and bounded selection ranges through a host `PresenceTransport`. Presence:

- is never written to document operations, snapshots, dirty state, or history;
- expires according to local heartbeat receipt time;
- is bounded by actor and range limits;
- clamps ranges to valid visible grid geometry and hides other-sheet or filtered selections;
- reuses the grid overlay element pool rather than mutating canvas cells; and
- supports privacy controls for display name, selections, inbound presence, and actor filtering.

Presence is advisory UI state. Do not use it for authorization, locking, or conflict prevention.

## Revisions

`RevisionCoordinator` delegates revision listing, loading, and restore to a `RevisionAdapter`. Preview snapshots pass through the optional host schema migrator and mount with `readOnly: true`. Restore requests include `targetVersion`, current `baseVersion`, and a stable mutation ID. The adapter contract requires restore to create a newer auditable server version; it must never rewind database state in place.

## Comments

Comments are document-adjacent server entities, not fields on every cell. `CommentCoordinator` stores stable thread/message IDs and range or cell anchors, while adapters supply authenticated author references and server timestamps. Create, reply, and resolve requests contain no client-authored identity or time fields. Authorization remains entirely host/server-owned.

Comment streams are versioned independently. Out-of-order events emit a gap rather than being applied speculatively.

## Concurrent structural editing decision

Sheetwrite uses deterministic server ordering plus conservative rebase, not a CRDT or general OT layer.

`rebaseDocumentOperations` safely shifts non-overlapping literal edits and references across server-ordered row/column insertions and deletions. It reports explicit conflicts for:

- edits or range pastes overlapping inserted/deleted boundaries;
- targets or references deleted by a concurrent operation;
- formula source crossing structural edits, because text-only rewriting cannot preserve sheet-aware reference intent;
- concurrent row/column moves;
- conflicting sheet lifecycle operations; and
- metadata families that need domain-specific transforms.

This choice preserves stable sheet IDs and authoritative formula source without lossy adapters. A CRDT/OT dependency is not justified by current scenarios: short-lived offline and online collaboration converge under server sequencing, while long-lived offline concurrent structural edits require product-level conflict UX and spreadsheet-specific formula/range semantics that generic sequence CRDTs do not supply. Revisit only if requirements demand automatic preservation of those ambiguous edits and scenario tests define the intended result for every structural/formula case.
