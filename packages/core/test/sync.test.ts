import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  type ApplyTransactionResult,
  type ChangeEvent,
  createGridFromSnapshot,
  DEFAULT_SYNC_COORDINATOR_LIMITS,
  initSheetwrite,
  MemoryPersistenceAdapter,
  type PersistenceAdapter,
  type PersistenceCommitRequest,
  type PersistenceCommitResponse,
  rebaseDocumentOperations,
  SyncCoordinator,
  type SyncCoordinatorEvent,
  type SyncCoordinatorOptions,
  SyncPendingCapacityError,
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

function harness(ids = ["m1", "m2", "m3"], options: Partial<SyncCoordinatorOptions> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot());
  const adapter = new ControlledAdapter(snapshot());
  let index = 0;
  const coordinator = new SyncCoordinator(grid, adapter, {
    documentId: "sync-doc",
    serverVersion: 7,
    createMutationId: () => ids[index++]!,
    ...options,
  });
  const events: SyncCoordinatorEvent[] = [];
  coordinator.on((event) => events.push(event));
  return { grid, adapter, coordinator, events };
}

describe("sync coordinator", () => {
  it("rejects invalid resource-limit overrides at construction", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot());
    const adapter = new ControlledAdapter(snapshot());

    expect(
      () =>
        new SyncCoordinator(grid, adapter, {
          documentId: "sync-doc",
          serverVersion: 7,
          limits: { maxBufferedBytes: 0 },
        }),
    ).toThrow(SyncProtocolError);
    grid.destroy();
  });

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

  it("refuses non-head sends and advances the durable queue serially", async () => {
    const { grid, adapter, coordinator, events } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });
    grid.applyTransaction({ patches: [localSet(3)] });

    const first = coordinator.send("m1");
    expect(await coordinator.send("m2")).toBeNull();
    expect(adapter.requests.map((request) => request.baseVersion)).toEqual([7]);
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await first;

    const second = coordinator.send("m2");
    expect(adapter.requests.map((request) => request.baseVersion)).toEqual([7, 8]);
    adapter.responses[1]!.resolve({
      status: "applied",
      version: 9,
      clientMutationId: "m2",
    });
    await second;
    expect(coordinator.pendingCount).toBe(0);
    expect(coordinator.serverVersion).toBe(9);
    expect(events.filter((event) => event.type === "error")).toEqual([]);
    coordinator.destroy();
    grid.destroy();
  });

  it("rejects a response mutation ID mismatch before queue or version mutation", async () => {
    const { grid, adapter, coordinator } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });
    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "wrong-id",
    });

    await expect(sending).rejects.toMatchObject({ code: "response-id-mismatch" });
    expect(coordinator.serverVersion).toBe(7);
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "m1", status: "pending" },
    ]);
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

    await coordinator.resumeAfterReload({ ...snapshot(), version: 8 });
    expect(coordinator.pendingCommits()[0]).toMatchObject({
      clientMutationId: "m1",
      baseVersion: 8,
      status: "pending",
    });
    coordinator.destroy();
    grid.destroy();
  });

  it("rejects malformed and oversized conflict recovery before publishing conflict", async () => {
    const cases: Array<{
      response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
      limits?: SyncCoordinatorOptions["limits"];
      code: string;
    }> = [
      {
        response: {
          status: "conflict",
          currentVersion: 9,
          operationsSinceBase: [{ version: 9, operations: [localSet(9)] }],
        },
        code: "invalid-version",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 9,
          operationsSinceBase: [
            { version: 8, operations: [localSet(8)] },
            { version: 9, operations: [localSet(9)] },
          ],
        },
        limits: { maxBufferedVersions: 1 },
        code: "buffer-count-limit",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 8,
          operationsSinceBase: [{ version: 8, operations: [localSet(8)] }],
        },
        limits: { maxBufferedBytes: 64 },
        code: "buffer-byte-limit",
      },
      {
        response: {
          status: "conflict",
          currentVersion: 8,
          snapshot: { ...snapshot(), version: 9 },
        },
        code: "invalid-version",
      },
    ];

    for (const testCase of cases) {
      const { grid, coordinator, events } = harness(["m1"], {
        ...(testCase.limits ? { limits: testCase.limits } : {}),
      });
      grid.applyTransaction({ patches: [localSet(2)] });
      await expect(coordinator.handleResponse(testCase.response, "m1")).rejects.toMatchObject({
        code: testCase.code,
      });
      expect(coordinator.serverVersion).toBe(7);
      expect(coordinator.pendingCommits()[0]?.status).toBe("pending");
      expect(events.some((event) => event.type === "conflict")).toBe(false);
      coordinator.destroy();
      grid.destroy();
    }
  });

  it("applies host-rebased conflicted work without duplicating the outgoing mutation", async () => {
    const { grid, coordinator } = harness();
    const remoteEvents: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remoteEvents.push(event);
    });
    const local = {
      op: "set" as const,
      addr: { sheet: "s1", row: 2, col: 0 },
      value: { kind: "literal" as const, value: 7 },
    };
    const remote = [{ op: "addRows" as const, sheet: "s1", at: 0, count: 1 }];
    grid.applyTransaction({ patches: [local] });
    await coordinator.handleResponse(
      { status: "conflict", currentVersion: 8, snapshot: { ...snapshot(), version: 8 } },
      "m1",
    );

    const rebased = rebaseDocumentOperations(coordinator.pendingCommits()[0]!.operations, remote);
    expect(rebased).toEqual({
      status: "rebased",
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 3, col: 0 },
          value: { kind: "literal", value: 7 },
        },
      ],
    });
    if (rebased.status !== "rebased") throw new Error("Expected successful host rebase");

    await coordinator.applyVersionedOperation({ version: 9, operations: remote });
    grid.applyRemoteOperations(rebased.operations);

    expect(remoteEvents.map((event) => event.transaction.patches)).toEqual([
      remote,
      [...rebased.operations],
    ]);
    expect(grid.store.getCell({ sheet: "s1", row: 3, col: 0 }).resolved).toBe(7);
    expect(coordinator.pendingCommits()).toEqual([
      {
        documentId: "sync-doc",
        baseVersion: 7,
        clientMutationId: "m1",
        operations: [local],
        status: "conflicted",
      },
    ]);
    coordinator.destroy();
    grid.destroy();
  });

  it("rejects canonical response operations and applies later remote operations", async () => {
    const { grid, coordinator, events } = harness();
    const remoteEvents: ChangeEvent[] = [];
    grid.on("change", (event) => {
      if (event.source === "remote") remoteEvents.push(event);
    });
    grid.applyTransaction({ patches: [localSet(2)] });
    await expect(
      coordinator.handleResponse({
        status: "applied",
        version: 8,
        clientMutationId: "m1",
        canonicalOperations: [localSet(10)],
      } as PersistenceCommitResponse),
    ).rejects.toMatchObject({ code: "invalid-operations" });
    expect(coordinator.pendingCount).toBe(1);
    expect(coordinator.serverVersion).toBe(7);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);

    await coordinator.handleResponse({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    expect(coordinator.pendingCount).toBe(0);
    await coordinator.applyVersionedOperation({ version: 9, operations: [localSet(11)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);
    await coordinator.applyVersionedOperation({ version: 9, operations: [localSet(99)] });
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(11);

    await coordinator.applyVersionedOperation({ version: 11, operations: [localSet(12)] });
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 10,
      receivedVersion: 11,
    });
    expect(remoteEvents).toHaveLength(1);
    coordinator.destroy();
    grid.destroy();
  });

  it("recovers missing versions in order and drains the buffered operation", async () => {
    const recovery = deferred<readonly VersionedOperation[]>();
    const requests: Array<{ expectedVersion: number; receivedVersion: number }> = [];
    const { grid, coordinator, events } = harness(["m1"], {
      recoverVersionGap: (request) => {
        requests.push({
          expectedVersion: request.expectedVersion,
          receivedVersion: request.receivedVersion,
        });
        return recovery.promise;
      },
    });
    const drained = deferred<void>();
    const disposeDrain = coordinator.on((event) => {
      if (event.type === "remote-applied" && event.operation.version === 10) {
        drained.resolve(undefined);
      }
    });

    await coordinator.applyVersionedOperation({ version: 10, operations: [localSet(10)] });
    recovery.resolve([
      { version: 9, operations: [localSet(9)] },
      { version: 8, operations: [localSet(8)] },
    ]);
    await drained.promise;
    disposeDrain();

    expect(requests).toEqual([{ expectedVersion: 8, receivedVersion: 10 }]);
    expect(coordinator.serverVersion).toBe(10);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(10);
    expect(
      events
        .filter((event) => event.type === "remote-applied")
        .map((event) => event.operation.version),
    ).toEqual([8, 9, 10]);
    coordinator.destroy();
    grid.destroy();
  });

  it("fails closed when a nonempty inbound version noops and accepts empty version ticks", async () => {
    const failed = harness();
    spyOn(failed.grid, "applyRemoteOperations").mockReturnValue({
      status: "noop",
      epoch: 0,
      reason: "out-of-bounds",
    });

    await failed.coordinator.applyVersionedOperation({
      version: 8,
      operations: [localSet(10)],
    });

    expect(failed.coordinator.serverVersion).toBe(7);
    expect(failed.events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 8,
      receivedVersion: 8,
    });
    expect(failed.events.some((event) => event.type === "remote-applied")).toBe(false);
    failed.coordinator.destroy();
    failed.grid.destroy();

    const tick = harness();
    await tick.coordinator.applyVersionedOperation({ version: 8, operations: [] });
    expect(tick.coordinator.serverVersion).toBe(8);
    expect(tick.events).toContainEqual({
      type: "remote-applied",
      operation: { version: 8, operations: [] },
    });
    tick.coordinator.destroy();
    tick.grid.destroy();
  });

  it("rejects invalid, too-future, and oversized inbound operations before applying", async () => {
    const { grid, coordinator, events } = harness(["m1"], {
      limits: {
        maxFutureVersionDistance: 2,
        maxOperationsPerVersion: 1,
        maxVersionPayloadBytes: 128,
      },
    });

    await coordinator.applyVersionedOperation({
      version: Number.NaN,
      operations: [],
    });
    await coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "x".repeat(257),
      operations: [],
    });
    await coordinator.applyVersionedOperation({
      version: 8,
      operations: [localSet(2), localSet(3)],
    });
    await coordinator.applyVersionedOperation({
      version: 8,
      operations: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "x".repeat(256) },
        },
      ],
    });
    await coordinator.applyVersionedOperation({ version: 10, operations: [] });

    const codes = events.flatMap((event) =>
      event.type === "error" && event.error instanceof SyncProtocolError ? [event.error.code] : [],
    );
    expect(codes).toEqual([
      "invalid-version",
      "invalid-id",
      "operation-limit",
      "payload-limit",
      "future-distance-limit",
    ]);
    expect(coordinator.serverVersion).toBe(7);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
    expect(events.filter((event) => event.type === "reload-required")).toHaveLength(4);
    coordinator.destroy();
    grid.destroy();
  });

  it("bounds retained acknowledgements and treats expired late echoes as reload violations", async () => {
    const { grid, coordinator, events } = harness(["m1", "m2", "m3"], {
      limits: { maxRecentAcknowledgements: 2 },
    });
    grid.applyTransaction({ patches: [localSet(2)] });
    grid.applyTransaction({ patches: [localSet(3)] });
    grid.applyTransaction({ patches: [localSet(4)] });
    await coordinator.handleResponse({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await coordinator.handleResponse({
      status: "applied",
      version: 9,
      clientMutationId: "m2",
    });
    await coordinator.handleResponse({
      status: "applied",
      version: 10,
      clientMutationId: "m3",
    });

    const reloadsBefore = events.filter((event) => event.type === "reload-required").length;
    await coordinator.applyVersionedOperation({
      version: 9,
      clientMutationId: "m2",
      operations: [localSet(98)],
    });
    expect(events.filter((event) => event.type === "reload-required")).toHaveLength(reloadsBefore);

    await coordinator.applyVersionedOperation({
      version: 8,
      clientMutationId: "m1",
      operations: [localSet(99)],
    });
    expect(coordinator.serverVersion).toBe(10);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(4);
    expect(events.at(-1)).toEqual({
      type: "reload-required",
      expectedVersion: 11,
      receivedVersion: 8,
    });
    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.error instanceof SyncProtocolError &&
          event.error.code === "late-echo",
      ),
    ).toBe(true);
    coordinator.destroy();
    grid.destroy();
  });

  it("bounds callback intake when a source ignores listener backpressure", async () => {
    const { grid, coordinator, events } = harness(["m1"], {
      limits: { maxBufferedVersions: 1 },
    });
    let listener: ((operation: VersionedOperation) => void | Promise<void>) | undefined;
    coordinator.subscribe({
      subscribe(remoteListener) {
        listener = remoteListener;
      },
    });

    const first = listener?.({ version: 8, operations: [localSet(2)] });
    const overflow = listener?.({ version: 9, operations: [localSet(3)] });
    await Promise.all([first, overflow]);

    expect(coordinator.serverVersion).toBe(8);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.error instanceof SyncProtocolError &&
          event.error.code === "buffer-count-limit",
      ),
    ).toBe(true);
    coordinator.destroy();
    grid.destroy();
  });

  it("cancels a blocked asynchronous source when destroyed", async () => {
    const { grid, coordinator } = harness();
    const intake = deferred<IteratorResult<VersionedOperation>>();
    let nextCalls = 0;
    let returnCalled = false;
    coordinator.subscribe({
      [Symbol.asyncIterator]() {
        return {
          next() {
            nextCalls += 1;
            return intake.promise;
          },
          async return() {
            returnCalled = true;
            return { done: true, value: undefined };
          },
        };
      },
    });
    await Promise.resolve();
    expect(nextCalls).toBe(1);

    coordinator.destroy();
    expect(returnCalled).toBe(true);
    grid.destroy();
  });

  it("deduplicates remote echoes by mutation ID", async () => {
    const { grid, coordinator } = harness();
    grid.applyTransaction({ patches: [localSet(2)] });

    await coordinator.applyVersionedOperation({
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
    let remoteListener: ((operation: VersionedOperation) => void | Promise<void>) | undefined;
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
    await remoteListener?.({ version: 8, operations: [localSet(4)] });
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
  it("keeps trusted pending limits independent from remote gap buffering", () => {
    expect(DEFAULT_SYNC_COORDINATOR_LIMITS).toMatchObject({
      maxBufferedVersions: 256,
      maxBufferedOperations: 40_000,
      maxBufferedBytes: 32 * 1024 * 1024,
      maxPendingCommits: 10_000,
      maxPendingOperations: 100_000,
      maxPendingEncodedBytes: 128 * 1024 * 1024,
    });
  });

  it("rejects count limit plus one before API or UI mutation and preserves history", async () => {
    const { grid, adapter, coordinator, events } = harness(["m1", "m2"], {
      limits: { maxPendingCommits: 1 },
    });
    const changes: ChangeEvent[] = [];
    let rejectionEvents = 0;
    grid.on("change", (event) => changes.push(event));
    grid.on("mutation-rejected", () => {
      rejectionEvents += 1;
    });

    expect(grid.applyTransaction({ patches: [localSet(2)] }).status).toBe("applied");
    const rejected = grid.applyTransaction({ patches: [localSet(3)] });
    expect(rejected).toMatchObject({
      status: "rejected",
      issues: [{ kind: "resource-limit", resource: "pending-commits", actual: 2, max: 1 }],
    });
    grid.setSelection({
      kind: "cell",
      addr: { sheet: "s1", row: 0, col: 0 },
    });
    grid.actions.clearContents();
    grid.undo();

    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);
    expect(changes).toHaveLength(1);
    expect(rejectionEvents).toBe(3);
    expect(coordinator.pendingCount).toBe(1);
    expect(coordinator.pendingCommits()).toHaveLength(1);
    expect(adapter.requests).toHaveLength(0);
    expect(coordinator.state).toMatchObject({
      pendingCount: 1,
      pendingOperations: 1,
      pendingCapacity: "full",
    });
    const capacityErrors = events.filter(
      (event) => event.type === "error" && event.error instanceof SyncPendingCapacityError,
    );
    expect(capacityErrors).toHaveLength(3);

    const sending = coordinator.sendNext();
    adapter.responses[0]!.resolve({
      status: "applied",
      version: 8,
      clientMutationId: "m1",
    });
    await sending;
    expect(coordinator.state.pendingCapacity).toBe("available");

    grid.undo();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(1);
    expect(coordinator.pendingCommits()[0]?.clientMutationId).toBe("m2");
    coordinator.destroy();
    grid.destroy();
  });

  it("enforces aggregate operation and encoded-byte boundaries inclusively", () => {
    const operationHarness = harness(["ops-1"], {
      limits: { maxPendingOperations: 2 },
    });
    const boundary = operationHarness.grid.applyTransaction({
      patches: [localSet(2), localSet(3)],
    });
    expect(boundary.status).toBe("applied");
    expect(operationHarness.coordinator.state.pendingOperations).toBe(2);
    expect(operationHarness.grid.applyTransaction({ patches: [localSet(4)] })).toMatchObject({
      status: "rejected",
      issues: [{ resource: "pending-operations", actual: 3, max: 2 }],
    });
    operationHarness.coordinator.destroy();
    operationHarness.grid.destroy();

    const encodedBytes = new TextEncoder().encode(JSON.stringify([localSet(2)])).byteLength;
    const byteHarness = harness(["bytes-1"], {
      limits: { maxPendingEncodedBytes: encodedBytes },
    });
    expect(byteHarness.grid.applyTransaction({ patches: [localSet(2)] }).status).toBe("applied");
    expect(byteHarness.coordinator.state.pendingEncodedBytes).toBe(encodedBytes);
    expect(byteHarness.grid.applyTransaction({ patches: [localSet(3)] })).toMatchObject({
      status: "rejected",
      issues: [{ resource: "pending-encoded-bytes", max: encodedBytes }],
    });
    byteHarness.coordinator.destroy();
    byteHarness.grid.destroy();
  });

  it("reserves capacity across reentrant commits and lets remote operations bypass it", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot());
    const adapter = new ControlledAdapter(snapshot());
    let nested = false;
    let nestedOutcome: ApplyTransactionResult | undefined;
    grid.on("change", (event) => {
      if (event.source !== "local" || nested) return;
      nested = true;
      nestedOutcome = grid.applyTransaction({ patches: [localSet(3)] });
    });
    const coordinator = new SyncCoordinator(grid, adapter, {
      documentId: "sync-doc",
      serverVersion: 7,
      createMutationId: () => "reentrant-m1",
      limits: { maxPendingCommits: 1 },
    });

    expect(grid.applyTransaction({ patches: [localSet(2)] }).status).toBe("applied");
    expect(nestedOutcome).toMatchObject({
      status: "rejected",
      issues: [{ resource: "pending-commits" }],
    });
    expect(coordinator.pendingCommits()).toMatchObject([
      { clientMutationId: "reentrant-m1", operations: [localSet(2)] },
    ]);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(2);

    expect(grid.applyRemoteOperations([localSet(9)]).status).toBe("applied");
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(9);
    expect(coordinator.pendingCount).toBe(1);
    coordinator.destroy();
    expect(coordinator.state).toMatchObject({
      pendingCount: 0,
      pendingOperations: 0,
      pendingEncodedBytes: 0,
      pendingCapacity: "destroyed",
    });
    expect(grid.applyTransaction({ patches: [localSet(10)] }).status).toBe("applied");
    expect(coordinator.pendingCount).toBe(0);
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
