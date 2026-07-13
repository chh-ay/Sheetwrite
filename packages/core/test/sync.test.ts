import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  type ChangeEvent,
  createGridFromSnapshot,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type PersistenceAdapter,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type VersionedOperation,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

class ControlledAdapter implements PersistenceAdapter {
  readonly requests: PersistenceCommitRequest[] = [];
  readonly responses: Array<Deferred<PersistenceCommitResponse>> = [];

  constructor(private readonly snapshot: WorkbookSnapshot) {}

  async load(): Promise<WorkbookSnapshot> {
    return structuredClone(this.snapshot);
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    this.requests.push(request);
    const response = deferred<PersistenceCommitResponse>();
    this.responses.push(response);
    return response.promise;
  }
}

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "sync-doc",
    version: 7,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        order: 0,
        rowCount: 3,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "literal", value: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
}

function localSet(value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal" as const, value },
  };
}

function harness(ids = ["m1", "m2", "m3"]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot());
  const adapter = new ControlledAdapter(snapshot());
  let index = 0;
  const coordinator = new SyncCoordinator(grid, adapter, {
    documentId: "sync-doc",
    serverVersion: 7,
    createMutationId: () => ids[index++]!,
  });
  const events: SyncCoordinatorEvent[] = [];
  coordinator.on((event) => events.push(event));
  return { grid, adapter, coordinator, events };
}

describe("sync coordinator", () => {
  it("queues immutable local mutations and acknowledges only the matching ID", async () => {
    const { grid, adapter, coordinator, events } = harness();
    const patch = localSet(2);

    grid.applyTransaction({ patches: [patch] });
    patch.value.value = 99;

    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(coordinator.pendingCommits()).toEqual([
      {
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "m1",
        operations: [localSet(2)],
        status: "pending",
      },
    ]);

    const sending = coordinator.sendNext();
    expect(adapter.requests).toHaveLength(1);
    expect(adapter.requests[0]).toMatchObject({
      documentId: "sync-doc",
      baseVersion: 7,
      clientMutationId: "m1",
      operations: [localSet(2)],
    });
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await sending;

    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(8);
    expect(events.some((event) => event.type === "acknowledged")).toBe(true);
    coordinator.destroy();
    grid.applyTransaction({ patches: [localSet(3)] });
    expect(coordinator.pendingCount).toBe(0);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(3);
    grid.destroy();
  });

  it("handles duplicate and out-of-order acknowledgements without cleaning neighbors", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });
    grid.applyTransaction({ patches: [localSet(3)] });

    const first = coordinator.send("m1");
    const second = coordinator.send("m2");
    expect(adapter.requests.map((request) => request.baseVersion)).toEqual([7, 8]);
    adapter.responses[1]!.resolve({
      status: "applied",
      version: 9,
      clientMutationId: "m2",
    });
    await second;
    expect(coordinator.pendingCommits().map((entry) => entry.clientMutationId)).toEqual(["m1"]);
    expect(coordinator.serverVersion).toBe(9);

    coordinator.handleResponse({ status: "duplicate", version: 9, clientMutationId: "m2" });
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await first;
    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(9);
    expect(events.filter((event) => event.type === "error")).toEqual([]);
    coordinator.destroy();
    grid.destroy();
  });

  it("retries with the same mutation ID only when the host asks", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

    const first = coordinator.sendNext();
    adapter.responses[0]!.reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(coordinator.pendingCommits()[0]?.status).toBe("pending");
    expect(events.some((event) => event.type === "error")).toBe(true);

    const retry = coordinator.retry("m1");
    expect(adapter.requests[1]?.clientMutationId).toBe("m1");
    expect(adapter.requests[1]?.baseVersion).toBe(7);
    adapter.responses[1]!.resolve({
      status: "duplicate",
      version: 8,
      clientMutationId: "m1",
    });
    await retry;
    expect(coordinator.pendingCount).toBe(0);
    coordinator.destroy();
    grid.destroy();
  });

  it("retains conflicted work and exposes deterministic reload/reapply state", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve({
      status: "conflict",
      currentVersion: 8,
      snapshot: { ...snapshot(), version: 8 },
    });
    await sending;

    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "m1",
      status: "conflicted",
    });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(events.at(-1)?.type).toBe("conflict");
    expect(await coordinator.sendNext()).toBeNull();

    coordinator.resumeAfterReload({ ...snapshot(), version: 8 });
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "m1",
      baseVersion: 8,
      status: "pending",
    });
    coordinator.destroy();
    grid.destroy();
  });

  it("applies canonical and remote operations without outgoing echo", () => {
    const { grid, coordinator, events } = harness();
    const remoteEvents: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remoteEvents.push(event);
    });
    grid.applyTransaction({ patches: [localSet(2)] });
    coordinator.handleResponse({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
      canonicalOperations: [localSet(10)],
    });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(10);
    expect(coordinator.pendingCount).toBe(0);

    coordinator.applyVersionedOperation({ version: 9, operations: [localSet(11)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);
    expect(coordinator.pendingCount).toBe(0);
    coordinator.applyVersionedOperation({ version: 9, operations: [localSet(99)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);

    coordinator.applyVersionedOperation({ version: 11, operations: [localSet(12)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 10,
      receivedVersion: 11,
    });
    expect(remoteEvents).toHaveLength(2);
    expect(remoteEvents.every((event) => event.transaction.patches.length === 1)).toBe(true);
    coordinator.destroy();
    grid.destroy();
  });

  it("deduplicates remote echoes by mutation ID", () => {
    const { grid, coordinator } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

    coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "m1",
      operations: [localSet(99)],
    });

    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(8);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    coordinator.destroy();
    grid.destroy();
  });

  it("aborts in-flight sends and remote subscriptions on destroy", async () => {
    const { grid, adapter, coordinator, events } = harness();
    let remoteListener: ((operation: VersionedOperation) => void) | undefined;
    let remoteSignal: AbortSignal | undefined;
    let disposed = false;
    coordinator.subscribe({
      subscribe(listener, signal) {
        remoteListener = listener;
        remoteSignal = signal;
        return () => {
          disposed = true;
        };
      },
    });
    remoteListener?.({ version: 8, operations: [localSet(4)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(4);

    grid.applyTransaction({ patches: [localSet(5)] });
    const sending = coordinator.sendNext();
    expect(adapter.requests[0]?.signal?.aborted).toBe(false);
    coordinator.destroy();
    expect(adapter.requests[0]?.signal?.aborted).toBe(true);
    expect(remoteSignal?.aborted).toBe(true);
    expect(disposed).toBe(true);
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 9,
      clientMutationId: "m1",
    });
    await sending;
    expect(events.some((event) => event.type === "acknowledged")).toBe(false);
    grid.destroy();
  });
});

describe("versioned memory adapter sync", () => {
  it("deduplicates retries and returns deterministic conflicts", async () => {
    const adapter = new MemoryPersistenceAdapter(snapshot());
    const request: PersistenceCommitRequest = {
      documentId: "sync-doc",
      baseVersion: 7,
      clientMutationId: "server-m1",
      operations: [localSet(2)],
    };

    expect(await adapter.commit(request)).toEqual({
      status: "applied",
      version: 8,
      clientMutationId: "server-m1",
    });
    expect(await adapter.commit(request)).toEqual({
      status: "duplicate",
      version: 8,
      clientMutationId: "server-m1",
    });
    expect(
      await adapter.commit({
        ...request,
        clientMutationId: "stale-m2",
      }),
    ).toEqual({
      status: "conflict",
      currentVersion: 8,
      operationsSinceBase: [
        { version: 8, operations: [localSet(2)], clientMutationId: "server-m1" },
      ],
    });
    expect((await adapter.load("sync-doc")).version).toBe(8);
  });
});
