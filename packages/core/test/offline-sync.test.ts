import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  createGridFromSnapshot,
  initSheetwrite,
  type PendingCommit,
  type PendingCommitLoadOptions,
  type PendingCommitStorage,
  type PersistenceAdapter,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  SyncCoordinator,
  SyncProtocolError,
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
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

class FakePendingStorage implements PendingCommitStorage {
  readonly records = new Map<string, PendingCommit>();
  readonly removals: string[] = [];
  readonly puts: string[] = [];
  failNextPut: unknown;
  failNextRemove: unknown;
  failNextReplace: unknown;
  removeGate?: Deferred<void>;
  putGate?: Deferred<void>;

  async load(
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<readonly PendingCommit[]> {
    if (options.signal?.aborted) throw options.signal.reason;
    const loaded: PendingCommit[] = [];
    let operations = 0;
    let bytes = 0;
    for (const record of this.records.values()) {
      if (record.documentId !== documentId) continue;
      if (loaded.length + 1 > options.maxRecords) {
        throw new SyncProtocolError("pending-count-limit", "Fake durable record limit exceeded");
      }
      operations += record.operations.length;
      if (operations > options.maxOperations) {
        throw new SyncProtocolError(
          "pending-operation-limit",
          "Fake durable operation limit exceeded",
        );
      }
      bytes += new TextEncoder().encode(JSON.stringify(record.operations)).byteLength;
      if (bytes > options.maxBytes) {
        throw new SyncProtocolError("pending-byte-limit", "Fake durable byte limit exceeded");
      }
      loaded.push(structuredClone(record));
    }
    return loaded;
  }

  async put(commit: PendingCommit, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    this.puts.push(commit.clientMutationId);
    if (this.putGate) await this.putGate.promise;
    if (this.failNextPut !== undefined) {
      const error = this.failNextPut;
      this.failNextPut = undefined;
      throw error;
    }
    this.records.set(commit.clientMutationId, structuredClone(commit));
  }

  async remove(_documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    this.removals.push(clientMutationId);
    if (this.removeGate) await this.removeGate.promise;
    if (this.failNextRemove !== undefined) {
      const error = this.failNextRemove;
      this.failNextRemove = undefined;
      throw error;
    }
    this.records.delete(clientMutationId);
  }

  async replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    if (this.failNextReplace !== undefined) {
      const error = this.failNextReplace;
      this.failNextReplace = undefined;
      throw error;
    }
    const current = [...this.records.values()]
      .filter((record) => record.documentId === documentId)
      .map((record) => record.clientMutationId);
    if (
      current.length !== expectedClientMutationIds.length ||
      current.some((id, index) => id !== expectedClientMutationIds[index])
    ) {
      throw new Error("Fake durable queue changed before replacement");
    }
    for (const id of current) this.records.delete(id);
    for (const commit of commits) {
      this.records.set(commit.clientMutationId, structuredClone(commit));
    }
  }
}

class ControlledAdapter implements PersistenceAdapter {
  readonly requests: PersistenceCommitRequest[] = [];
  responders: Array<(request: PersistenceCommitRequest) => Promise<PersistenceCommitResponse>> = [];

  constructor(private readonly base: WorkbookSnapshot) {}

  async load(): Promise<WorkbookSnapshot> {
    return structuredClone(this.base);
  }

  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    this.requests.push(request);
    const responder = this.responders.shift();
    if (!responder) throw new Error("No controlled response configured");
    return responder(request);
  }
}

function snapshot(version = 4, rowCount = 2): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "offline-doc",
    version,
    workbook: { activeSheet: "s1" },
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        order: 0,
        rowCount,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        cells: [],
      },
    ],
  };
}

function setValue(value: number) {
  return {
    op: "set" as const,
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal" as const, value },
  };
}

function mountGrid(version = 4, rowCount = 2) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return createGridFromSnapshot(host, snapshot(version, rowCount));
}

describe("durable offline sync", () => {
  it("restores an offline commit after reload and retries its original mutation ID", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const firstGrid = mountGrid();
    const first = new SyncCoordinator(firstGrid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => "offline-m1",
    });

    await first.ready();
    firstGrid.applyTransaction({ patches: [setValue(9)] });
    await first.ready();
    expect(storage.records.get("offline-m1")).toMatchObject({
      baseVersion: 4,
      clientMutationId: "offline-m1",
    });
    expect(adapter.requests).toHaveLength(0);
    first.destroy();
    firstGrid.destroy();

    const reloadedGrid = mountGrid();
    const reloaded = new SyncCoordinator(reloadedGrid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
    });
    await reloaded.ready();
    expect(reloadedGrid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(9);
    expect(reloaded.pendingCommits()[0]?.clientMutationId).toBe("offline-m1");

    adapter.responders.push(async (request) => ({
      status: "applied",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));
    reloaded.setOnline(true);
    await reloaded.flush();
    await Promise.resolve();

    expect(adapter.requests[0]?.clientMutationId).toBe("offline-m1");
    expect(reloaded.pendingCount).toBe(0);
    expect(storage.records.size).toBe(0);
    expect(storage.removals).toEqual(["offline-m1"]);
    reloaded.destroy();
    reloadedGrid.destroy();
  });

  it("aborts a disconnected send and reconnects with the same ID", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      createMutationId: () => "disconnect-m1",
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [setValue(3)] });
    await coordinator.ready();

    adapter.responders.push(
      (request) =>
        new Promise<PersistenceCommitResponse>((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => reject(new Error("disconnected")), {
            once: true,
          });
        }),
    );
    const sending = coordinator.sendNext();
    expect(adapter.requests[0]?.signal?.aborted).toBe(false);
    coordinator.setOnline(false);
    await expect(sending).rejects.toThrow("disconnected");
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "disconnect-m1",
      status: "pending",
    });

    adapter.responders.push(async (request) => ({
      status: "duplicate",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));
    coordinator.setOnline(true);
    await coordinator.flush();
    expect(adapter.requests.map((request) => request.clientMutationId)).toEqual([
      "disconnect-m1",
      "disconnect-m1",
    ]);
    expect(coordinator.pendingCount).toBe(0);
    coordinator.destroy();
    grid.destroy();
  });

  it("retains a durable conflict on reconnect", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => "conflict-m1",
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [setValue(5)] });
    await coordinator.ready();
    adapter.responders.push(async () => ({ status: "conflict", currentVersion: 6 }));

    coordinator.setOnline(true);
    await coordinator.flush();
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "conflict-m1",
      status: "conflicted",
    });
    expect(storage.records.has("conflict-m1")).toBe(true);
    expect(coordinator.state).toMatchObject({ pendingCount: 1, pendingOperations: 1 });
    expect(coordinator.state.pendingEncodedBytes).toBeGreaterThan(0);
    coordinator.destroy();
    grid.destroy();
  });

  it("keeps local behavior immediate and blocks send until a storage failure is retried", async () => {
    const storage = new FakePendingStorage();
    storage.failNextPut = new Error("quota exceeded");
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      createMutationId: () => "quota-m1",
    });
    await coordinator.ready();

    grid.applyTransaction({ patches: [setValue(7)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(7);
    await expect(coordinator.ready()).rejects.toThrow("quota exceeded");
    expect(coordinator.pendingCommits()[0]?.status).toBe("storage-error");
    expect(coordinator.state).toMatchObject({ pendingCount: 1, pendingOperations: 1 });
    expect(coordinator.state.pendingEncodedBytes).toBeGreaterThan(0);
    expect(adapter.requests).toHaveLength(0);

    expect(await coordinator.retryPersistence("quota-m1")).toBe(true);
    adapter.responders.push(async (request) => ({
      status: "applied",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));
    await coordinator.sendNext();
    expect(adapter.requests).toHaveLength(1);
    expect(coordinator.state).toMatchObject({
      pendingCount: 0,
      pendingOperations: 0,
      pendingEncodedBytes: 0,
    });
    coordinator.destroy();
    grid.destroy();
  });

  it("keeps acknowledgements pending until durable removal succeeds", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      createMutationId: () => "remove-m1",
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    await coordinator.ready();
    grid.applyTransaction({ patches: [setValue(8)] });
    await coordinator.ready();
    storage.failNextRemove = new Error("remove failed");
    adapter.responders.push(async (request) => ({
      status: "applied",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));

    await expect(coordinator.sendNext()).rejects.toThrow("remove failed");
    expect(coordinator.pendingCount).toBe(1);
    expect(storage.records.has("remove-m1")).toBe(true);
    expect(events).not.toContain("acknowledged");

    adapter.responders.push(async (request) => ({
      status: "duplicate",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));
    await coordinator.retry("remove-m1");
    expect(coordinator.pendingCount).toBe(0);
    expect(storage.records.has("remove-m1")).toBe(false);
    expect(events.filter((event) => event === "acknowledged")).toHaveLength(1);
    coordinator.destroy();
    grid.destroy();
  });

  it("finishes an acknowledged durable removal after destroy without publishing", async () => {
    const storage = new FakePendingStorage();
    storage.removeGate = deferred<void>();
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      createMutationId: () => "destroy-remove-m1",
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    await coordinator.ready();
    grid.applyTransaction({ patches: [setValue(6)] });
    await coordinator.ready();
    adapter.responders.push(async (request) => ({
      status: "applied",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));

    const sending = coordinator.sendNext();
    while (storage.removals.length === 0) await Promise.resolve();
    coordinator.destroy();
    storage.removeGate.resolve(undefined);
    await sending;

    expect(storage.records.has("destroy-remove-m1")).toBe(false);
    expect(coordinator.pendingCount).toBe(0);
    expect(events).not.toContain("acknowledged");
    grid.destroy();
  });

  it("fails closed for an ambiguous durable mutation on a newer offline snapshot", async () => {
    const storage = new FakePendingStorage();
    storage.records.set("ambiguous-m1", {
      documentId: "offline-doc",
      baseVersion: 4,
      clientMutationId: "ambiguous-m1",
      operations: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }],
    });
    const adapter = new ControlledAdapter(snapshot(5, 3));
    const grid = mountGrid(5, 3);
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 5,
      pendingStorage: storage,
      initialConnection: "offline",
    });
    const events: string[] = [];
    coordinator.on((event) => events.push(event.type));
    await coordinator.ready();

    expect(grid.exportSnapshot().sheets[0]?.rowCount).toBe(3);
    expect(coordinator.pendingCommits()[0]?.clientMutationId).toBe("ambiguous-m1");
    expect(events).toContain("reload-required");
    expect(storage.records.has("ambiguous-m1")).toBe(true);
    coordinator.destroy();
    grid.destroy();
  });

  it("reconciles an ambiguous durable mutation before applying it locally", async () => {
    const storage = new FakePendingStorage();
    storage.records.set("ambiguous-online-m1", {
      documentId: "offline-doc",
      baseVersion: 4,
      clientMutationId: "ambiguous-online-m1",
      operations: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }],
    });
    const adapter = new ControlledAdapter(snapshot(5));
    adapter.responders.push(async (request) => ({
      status: "applied",
      version: 6,
      clientMutationId: request.clientMutationId,
    }));
    const grid = mountGrid(5);
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 5,
      pendingStorage: storage,
    });
    await coordinator.ready();
    await coordinator.flush();

    expect(adapter.requests[0]?.clientMutationId).toBe("ambiguous-online-m1");
    expect(grid.exportSnapshot().sheets[0]?.rowCount).toBe(3);
    expect(coordinator.pendingCount).toBe(0);
    expect(storage.records.has("ambiguous-online-m1")).toBe(false);
    coordinator.destroy();
    grid.destroy();
  });
  it("serializes durable puts in mutation order", async () => {
    const storage = new FakePendingStorage();
    storage.putGate = deferred<void>();
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const ids = ["ordered-m1", "ordered-m2"];
    let index = 0;
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => ids[index++]!,
    });
    await coordinator.ready();

    grid.applyTransaction({ patches: [setValue(1)] });
    grid.applyTransaction({ patches: [setValue(2)] });
    while (storage.puts.length === 0) await Promise.resolve();
    await Promise.resolve();
    expect(storage.puts).toEqual(["ordered-m1"]);

    storage.putGate.resolve(undefined);
    await coordinator.ready();
    expect(storage.puts).toEqual(["ordered-m1", "ordered-m2"]);
    expect([...storage.records.keys()]).toEqual(["ordered-m1", "ordered-m2"]);
    coordinator.destroy();
    grid.destroy();
  });

  it("atomically rewrites durable base versions during reload recovery", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const grid = mountGrid();
    const ids = ["replace-m1", "replace-m2"];
    let index = 0;
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => ids[index++]!,
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [setValue(1)] });
    grid.applyTransaction({ patches: [setValue(2)] });
    await coordinator.ready();
    const resourcesBeforeReplacement = {
      pendingCount: coordinator.state.pendingCount,
      pendingOperations: coordinator.state.pendingOperations,
      pendingEncodedBytes: coordinator.state.pendingEncodedBytes,
    };

    storage.failNextReplace = new Error("replacement crashed");
    await expect(coordinator.resumeAfterReload(snapshot(10))).rejects.toThrow(
      "replacement crashed",
    );
    expect([...storage.records.values()].map((record) => record.baseVersion)).toEqual([4, 5]);
    expect(coordinator.serverVersion).toBe(4);
    expect(coordinator.state).toMatchObject(resourcesBeforeReplacement);

    await coordinator.resumeAfterReload(snapshot(10));
    expect([...storage.records.values()].map((record) => record.baseVersion)).toEqual([10, 11]);
    expect(coordinator.pendingCommits().map((record) => record.baseVersion)).toEqual([10, 11]);
    expect(coordinator.state).toMatchObject(resourcesBeforeReplacement);
    coordinator.destroy();
    grid.destroy();
  });

  it("applies asynchronous intake in order behind durable echo removal", async () => {
    const storage = new FakePendingStorage();
    storage.removeGate = deferred<void>();
    const adapter = new ControlledAdapter(snapshot());
    const sendGate = deferred<PersistenceCommitResponse>();
    adapter.responders.push(() => sendGate.promise);
    const grid = mountGrid();
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      createMutationId: () => "echo-m1",
    });
    await coordinator.ready();
    grid.applyTransaction({ patches: [setValue(3)] });
    await coordinator.ready();

    let nextCalls = 0;
    const operations: VersionedOperation[] = [
      { version: 5, clientMutationId: "echo-m1", operations: [setValue(99)] },
      { version: 6, operations: [setValue(4)] },
    ];
    coordinator.subscribe({
      [Symbol.asyncIterator]() {
        let operation = 0;
        return {
          async next() {
            nextCalls += 1;
            const value = operations[operation++];
            return value
              ? { done: false as const, value }
              : { done: true as const, value: undefined };
          },
        };
      },
    });
    while (storage.removals.length === 0) await Promise.resolve();

    expect(nextCalls).toBe(1);
    expect(coordinator.serverVersion).toBe(4);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(3);

    const applied = deferred<void>();
    const disposeApplied = coordinator.on((event) => {
      if (event.type === "remote-applied" && event.operation.version === 6) {
        applied.resolve(undefined);
      }
    });
    storage.removeGate.resolve(undefined);
    await applied.promise;
    disposeApplied();
    expect(nextCalls).toBe(2);
    expect(coordinator.serverVersion).toBe(6);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(4);

    sendGate.resolve({
      status: "duplicate",
      version: 5,
      clientMutationId: "echo-m1",
    });
    coordinator.destroy();
    grid.destroy();
  });

  it("reopens 300 durable commits in original order without loss", async () => {
    const storage = new FakePendingStorage();
    const adapter = new ControlledAdapter(snapshot());
    const ids = Array.from(
      { length: 300 },
      (_, index) => `restore-${String(index).padStart(3, "0")}`,
    );
    let index = 0;
    const firstGrid = mountGrid();
    const first = new SyncCoordinator(firstGrid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
      createMutationId: () => ids[index++]!,
    });
    await first.ready();
    for (let value = 0; value < ids.length; value++) {
      expect(firstGrid.applyTransaction({ patches: [setValue(value)] }).status).toBe("applied");
    }
    await first.ready();
    expect([...storage.records.keys()]).toEqual(ids);
    first.destroy();
    firstGrid.destroy();

    const reopenedGrid = mountGrid();
    const reopened = new SyncCoordinator(reopenedGrid, adapter, {
      documentId: "offline-doc",
      serverVersion: 4,
      pendingStorage: storage,
      initialConnection: "offline",
    });
    await reopened.ready();

    expect(reopened.pendingCommits().map((record) => record.clientMutationId)).toEqual(ids);
    expect(reopened.pendingCommits().map((record) => record.baseVersion)).toEqual(
      ids.map((_, recordIndex) => 4 + recordIndex),
    );
    expect(reopened.state).toMatchObject({
      pendingCount: 300,
      pendingOperations: 300,
      pendingCapacity: "available",
    });
    expect(reopenedGrid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(299);
    expect(storage.records.size).toBe(300);
    reopened.destroy();
    reopenedGrid.destroy();
  });

  it("rejects oversized durable queues before cloning or partially restoring", async () => {
    const cases = [
      {
        code: "pending-count-limit",
        limits: { maxPendingCommits: 1 },
      },
      {
        code: "pending-operation-limit",
        limits: { maxPendingCommits: 2, maxPendingOperations: 1 },
      },
      {
        code: "pending-byte-limit",
        limits: { maxPendingCommits: 2, maxPendingEncodedBytes: 150 },
      },
    ] as const;

    for (const testCase of cases) {
      const storage = new FakePendingStorage();
      storage.records.set("restore-m1", {
        documentId: "offline-doc",
        baseVersion: 4,
        clientMutationId: "restore-m1",
        operations: [setValue(1)],
      });
      storage.records.set("restore-m2", {
        documentId: "offline-doc",
        baseVersion: 5,
        clientMutationId: "restore-m2",
        operations: [setValue(2)],
      });
      const adapter = new ControlledAdapter(snapshot());
      const grid = mountGrid();
      const coordinator = new SyncCoordinator(grid, adapter, {
        documentId: "offline-doc",
        serverVersion: 4,
        pendingStorage: storage,
        initialConnection: "offline",
        limits: testCase.limits,
      });

      try {
        await coordinator.ready();
        throw new Error("Expected durable restore to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(SyncProtocolError);
        expect((error as SyncProtocolError).code).toBe(testCase.code);
      }
      expect(coordinator.pendingCount).toBe(0);
      expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBeNull();
      expect([...storage.records.keys()]).toEqual(["restore-m1", "restore-m2"]);
      coordinator.destroy();
      grid.destroy();
    }
  });
});
