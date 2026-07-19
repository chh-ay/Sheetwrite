import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  PresenceCoordinator,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type VersionedOperation,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import {
  COLLABORATION_ACTORS,
  COLLABORATION_DOCUMENT_ID,
  COLLABORATION_TOTAL_CELL,
  makeCollaborationSnapshot,
  ShowcaseCollaborationServer,
  type ShowcaseCommitRecord,
  ShowcaseLinkError,
  ShowcaseNetworkLink,
  ShowcasePresenceBus,
} from "../src/showcases/collaboration-protocol.ts";

const SEED_TOTAL = 23;

beforeAll(async () => {
  await initSheetwrite();
});

const restoreCanvasStubs = installCanvasTestStubs();

afterAll(() => {
  restoreCanvasStubs();
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function mountGrid(): { grid: Grid; host: HTMLDivElement } {
  const host = document.createElement("div");
  host.style.width = "520px";
  host.style.height = "260px";
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, makeCollaborationSnapshot());
  cleanups.push(() => {
    grid.destroy();
    host.remove();
  });
  return { grid, host };
}

function pointsEdit(row: number, value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "plan", row, col: 2 },
    value: { kind: "literal" as const, value },
  };
}

/** Resolves on the first coordinator event matching the predicate. Attach before triggering. */
function onceSyncEvent(
  sync: SyncCoordinator,
  predicate: (event: SyncCoordinatorEvent) => boolean,
): Promise<SyncCoordinatorEvent> {
  const { promise, resolve } = Promise.withResolvers<SyncCoordinatorEvent>();
  const dispose = sync.on((event) => {
    if (!predicate(event)) return;
    dispose();
    resolve(event);
  });
  cleanups.push(dispose);
  return promise;
}

describe("showcase collaboration server", () => {
  it("sequences commits and reports applied, duplicate, and conflict acknowledgements", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const records: ShowcaseCommitRecord[] = [];
    cleanups.push(server.observeCommits((record) => records.push(record)));

    const applied = await server.commit({
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "unit-m1",
      operations: [pointsEdit(0, 9)],
    });
    expect(applied.status).toBe("applied");
    if (applied.status === "applied") expect(applied.version).toBe(1);

    const duplicate = await server.commit({
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "unit-m1",
      operations: [pointsEdit(0, 9)],
    });
    expect(duplicate.status).toBe("duplicate");

    const conflict = await server.commit({
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "unit-m2",
      operations: [pointsEdit(1, 6)],
    });
    expect(conflict.status).toBe("conflict");

    expect(records.map((record) => record.status)).toEqual(["applied", "duplicate", "conflict"]);
    expect(records.map((record) => record.version)).toEqual([1, 1, 1]);
  });
});

describe("showcase network link", () => {
  it("queues broadcasts while offline and replays them in order on reconnect", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const link = new ShowcaseNetworkLink(server);
    cleanups.push(() => link.destroy());
    const delivered: number[] = [];
    link.subscribe((operation: VersionedOperation) => delivered.push(operation.version));

    link.setConnected(false);
    await expect(
      link.commit({
        documentId: COLLABORATION_DOCUMENT_ID,
        baseVersion: 0,
        clientMutationId: "offline-m1",
        operations: [pointsEdit(0, 10)],
      }),
    ).rejects.toBeInstanceOf(ShowcaseLinkError);

    await server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [pointsEdit(1, 6)]);
    await server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [pointsEdit(2, 4)]);
    expect(delivered).toEqual([]);
    expect(link.state().queuedBroadcasts).toBe(2);

    link.setConnected(true);
    expect(delivered).toEqual([1, 2]);
    expect(link.state().queuedBroadcasts).toBe(0);
  });

  it("holds one broadcast to reorder delivery, then releases it in version order", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const link = new ShowcaseNetworkLink(server);
    cleanups.push(() => link.destroy());
    const delivered: number[] = [];
    link.subscribe((operation) => delivered.push(operation.version));

    link.holdNextBroadcast();
    await server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [pointsEdit(0, 11)]);
    await server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [pointsEdit(1, 7)]);
    expect(delivered).toEqual([2]);
    expect(link.state().heldBroadcasts).toBe(1);

    link.releaseHeldBroadcasts();
    expect(delivered).toEqual([2, 1]);
    expect(link.state().heldBroadcasts).toBe(0);
  });

  it("loses one acknowledgement and its echo, then answers the retry with duplicate", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const link = new ShowcaseNetworkLink(server);
    cleanups.push(() => link.destroy());
    const delivered: number[] = [];
    link.subscribe((operation) => delivered.push(operation.version));

    link.dropNextAcknowledgement();
    const request = {
      documentId: COLLABORATION_DOCUMENT_ID,
      baseVersion: 0,
      clientMutationId: "flaky-m1",
      operations: [pointsEdit(0, 12)],
    };
    await expect(link.commit(request)).rejects.toBeInstanceOf(ShowcaseLinkError);
    // The server stored the commit, but neither the ack nor the echo arrived.
    expect(delivered).toEqual([]);

    const retry = await link.commit(request);
    expect(retry.status).toBe("duplicate");
    if (retry.status === "duplicate") expect(retry.version).toBe(1);
  });
});

describe("two-client protocol integration", () => {
  it("converges ordered commits, drains an offline durable queue, and buffers version gaps", async () => {
    const server = new ShowcaseCollaborationServer(makeCollaborationSnapshot());
    const bus = new ShowcasePresenceBus();
    const a = mountGrid();
    const b = mountGrid();
    const linkA = new ShowcaseNetworkLink(server);
    const linkB = new ShowcaseNetworkLink(server);
    cleanups.push(
      () => linkA.destroy(),
      () => linkB.destroy(),
    );

    let nextMutation = 1;
    const syncA = new SyncCoordinator(a.grid, linkA, {
      documentId: COLLABORATION_DOCUMENT_ID,
      serverVersion: 0,
      createMutationId: () => `ana-${nextMutation++}`,
    });
    const syncB = new SyncCoordinator(b.grid, linkB, {
      documentId: COLLABORATION_DOCUMENT_ID,
      serverVersion: 0,
      createMutationId: () => `bram-${nextMutation++}`,
    });
    cleanups.push(
      () => syncA.destroy(),
      () => syncB.destroy(),
    );
    syncA.subscribe(linkA);
    syncB.subscribe(linkB);

    const presenceA = new PresenceCoordinator(a.grid, bus.endpoint(), {
      actor: COLLABORATION_ACTORS[0],
      heartbeatMs: 0,
    });
    const presenceB = new PresenceCoordinator(b.grid, bus.endpoint(), {
      actor: COLLABORATION_ACTORS[1],
      heartbeatMs: 0,
    });
    cleanups.push(
      () => presenceA.destroy(),
      () => presenceB.destroy(),
    );

    // Ordered convergence: Ana raises "Import pipeline" points to 9.
    const bAppliedV1 = onceSyncEvent(
      syncB,
      (event) => event.type === "remote-applied" && event.operation.version === 1,
    );
    a.grid.applyTransaction({ patches: [pointsEdit(0, 9)] });
    await syncA.flush();
    await bAppliedV1;
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(SEED_TOTAL + 1);
    expect(syncB.serverVersion).toBe(1);

    // Presence: Ana's selection is painted inside Bram's grid.
    a.grid.setSelection({ kind: "cell", addr: { sheet: "plan", row: 0, col: 2 } });
    await presenceA.publishNow();
    b.grid.refresh();
    expect(
      b.host.querySelectorAll(`[data-sheetwrite-presence="${COLLABORATION_ACTORS[0].id}"]`).length,
    ).toBeGreaterThan(0);
    expect(presenceB.remotePresence().map((message) => message.actor.id)).toContain(
      COLLABORATION_ACTORS[0].id,
    );

    // Offline: Bram queues two local commits, then reconnects and drains in order.
    syncB.setOnline(false);
    linkB.setConnected(false);
    b.grid.applyTransaction({ patches: [pointsEdit(3, 6)] });
    b.grid.applyTransaction({ patches: [pointsEdit(4, 3)] });
    expect(syncB.pendingCount).toBe(2);
    const aAppliedV3 = onceSyncEvent(
      syncA,
      (event) => event.type === "remote-applied" && event.operation.version === 3,
    );
    const bDrained = onceSyncEvent(
      syncB,
      (event) => event.type === "state" && event.state.pendingCount === 0,
    );
    linkB.setConnected(true);
    syncB.setOnline(true);
    await bDrained;
    expect(syncB.serverVersion).toBe(3);
    await aAppliedV3;
    expect(a.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(SEED_TOTAL + 3);

    // Version gap: hold v4 on Bram's link, deliver v5 first, then close the gap.
    const bSawGap = onceSyncEvent(syncB, (event) => event.type === "reload-required");
    const bAppliedV5 = onceSyncEvent(
      syncB,
      (event) => event.type === "remote-applied" && event.operation.version === 5,
    );
    linkB.holdNextBroadcast();
    a.grid.applyTransaction({ patches: [pointsEdit(0, 10)] });
    await syncA.flush();
    a.grid.applyTransaction({ patches: [pointsEdit(1, 6)] });
    await syncA.flush();
    await bSawGap;
    expect(syncB.serverVersion).toBe(3);
    linkB.releaseHeldBroadcasts();
    await bAppliedV5;
    expect(syncB.serverVersion).toBe(5);
    expect(b.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved).toBe(
      a.grid.store.getCell(COLLABORATION_TOTAL_CELL).resolved,
    );

    // Conflict: Ana misses the server broadcast, commits on a stale base, and the
    // coordinator retains the conflicted mutation for explicit host recovery.
    linkA.holdNextBroadcast();
    await server.commitServerOperations(COLLABORATION_DOCUMENT_ID, [pointsEdit(2, 5)]);
    const aConflicted = onceSyncEvent(syncA, (event) => event.type === "conflict");
    a.grid.applyTransaction({ patches: [pointsEdit(0, 11)] });
    await syncA.flush();
    const conflictEvent = (await aConflicted) as Extract<
      SyncCoordinatorEvent,
      { type: "conflict" }
    >;
    expect(conflictEvent.response.currentVersion).toBe(6);
    expect(conflictEvent.response.operationsSinceBase?.length).toBe(1);
    expect(syncA.pendingCommits()[0]?.status).toBe("conflicted");
  });
});
