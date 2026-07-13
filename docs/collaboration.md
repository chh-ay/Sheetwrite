# Offline and collaboration

Sheetwrite provides transport-, database-, and authentication-neutral collaboration primitives. The host still owns server sequencing, durable document storage, user identity, authorization, and network lifecycle.

## Durable pending commits

`SyncCoordinator` can receive a `PendingCommitStorage` adapter. With one configured, it:

1. persists each immutable commit before it can be sent;
2. restores pending commits on startup and reapplies them locally as remote-source operations, so restoration does not echo into the outgoing queue;
3. retries with the original `clientMutationId` after reconnect or reload;
4. removes durable work only after an `applied` or `duplicate` acknowledgement; and
5. retains conflicts and storage failures for explicit host recovery.

Await `coordinator.ready()` before declaring startup synchronized. Use `initialConnection: "offline"` for offline-first startup, `setOnline(false)` on disconnect, and `setOnline(true)` to reconnect and drain pending work in order. `coordinator.state` distinguishes connection state from hydration, persistence, sending, conflict, and error activity.

The browser IndexedDB implementation is intentionally isolated from Node and SSR entrypoints:

```ts
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

A gap emits `reload-required`. Hosts that can fetch missing operations or a current snapshot can provide `recoverVersionGap`. Missing operations are applied in version order. A returned snapshot is emitted to the host for remount/hydration, after which the host calls `resumeAfterReload` with retained local operations already reapplied.

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
