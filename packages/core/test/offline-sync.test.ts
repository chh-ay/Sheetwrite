import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  createGridFromSnapshot,
  initSheetwrite,
  type PendingCommit,
  type PendingCommitStorage,
  type PersistenceAdapter,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  SyncCoordinator,
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

class FakePendingStorage implements PendingCommitStorage {
  readonly records = new Map<string, PendingCommit>();
  readonly removals: string[] = [];
  failNextPut: unknown;

  async load(documentId: string, signal?: AbortSignal): Promise<readonly PendingCommit[]> {
    if (signal?.aborted) throw signal.reason;
    return [...this.records.values()]
      .filter((record) => record.documentId === documentId)
      .map((record) => structuredClone(record));
  }

  async put(commit: PendingCommit, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
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
    this.records.delete(clientMutationId);
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

function snapshot(version = 4): WorkbookSnapshot {
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
        rowCount: 2,
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

function mountGrid() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return createGridFromSnapshot(host, snapshot());
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
    expect(adapter.requests).toHaveLength(0);

    expect(await coordinator.retryPersistence("quota-m1")).toBe(true);
    adapter.responders.push(async (request) => ({
      status: "applied",
      version: 5,
      clientMutationId: request.clientMutationId,
    }));
    await coordinator.sendNext();
    expect(adapter.requests).toHaveLength(1);
    coordinator.destroy();
    grid.destroy();
  });
});
