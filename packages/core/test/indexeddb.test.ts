import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import {
  IndexedDbPendingCommitStorage,
  IndexedDbPendingCommitStorageError,
} from "../src/indexeddb.js";
import type { PendingCommit } from "../src/types.js";

const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
const keyRangeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
});

afterEach(() => {
  if (indexedDbDescriptor) Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
  else Reflect.deleteProperty(globalThis, "indexedDB");
  if (keyRangeDescriptor) Object.defineProperty(globalThis, "IDBKeyRange", keyRangeDescriptor);
  else Reflect.deleteProperty(globalThis, "IDBKeyRange");
});

const LOAD_OPTIONS = {
  maxRecords: 256,
  maxOperations: 40_000,
  maxBytes: 32 * 1024 * 1024,
} as const;

function commit(documentId: string, clientMutationId: string, value: string): PendingCommit {
  return {
    documentId,
    clientMutationId,
    baseVersion: 3,
    operations: [
      {
        op: "set",
        addr: { sheet: "s1", row: 0, col: 0 },
        value: { kind: "literal", value },
      },
    ],
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  return promise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  transaction.oncomplete = () => resolve();
  transaction.onabort = transaction.onerror = () => reject(transaction.error);
  return promise;
}

function controlledVersionChangeEvent(type: string): IDBVersionChangeEvent {
  // Bun lacks this DOM constructor; handlers under test do not inspect version fields.
  const event = new Event(type);
  return event as IDBVersionChangeEvent;
}

class ControlledDatabase {
  closeCalls = 0;
  onversionchange: ((this: IDBDatabase, event: IDBVersionChangeEvent) => unknown) | null = null;

  close(): void {
    this.closeCalls++;
  }

  transaction(): IDBTransaction {
    throw new Error("controlled database transaction");
  }

  asDatabase(): IDBDatabase {
    // Lifecycle tests deliberately expose only the IDBDatabase surface used by open().
    return this as unknown as IDBDatabase;
  }

  versionchange(): void {
    const database = this.asDatabase();
    this.onversionchange?.call(database, controlledVersionChangeEvent("versionchange"));
  }
}

class ControlledOpenRequest {
  result!: IDBDatabase;
  error: DOMException | null = null;
  transaction: IDBTransaction | null = null;
  onblocked: ((this: IDBOpenDBRequest, event: IDBVersionChangeEvent) => unknown) | null = null;
  onerror: ((this: IDBRequest, event: Event) => unknown) | null = null;
  onsuccess: ((this: IDBRequest, event: Event) => unknown) | null = null;
  onupgradeneeded: ((this: IDBOpenDBRequest, event: IDBVersionChangeEvent) => unknown) | null =
    null;

  blocked(): void {
    const request = this.asRequest();
    this.onblocked?.call(request, controlledVersionChangeEvent("blocked"));
  }

  failed(message = "controlled open failure"): void {
    this.error = new DOMException(message, "UnknownError");
    const request = this.asRequest();
    this.onerror?.call(request, new Event("error"));
  }

  succeeded(database: ControlledDatabase): void {
    this.result = database.asDatabase();
    const request = this.asRequest();
    this.onsuccess?.call(request, new Event("success"));
  }

  private asRequest(): IDBOpenDBRequest {
    // Lifecycle tests deliberately expose only the IDBOpenDBRequest callbacks used by open().
    return this as unknown as IDBOpenDBRequest;
  }
}

class ControlledIndexedDbFactory {
  readonly requests: ControlledOpenRequest[] = [];

  open(): IDBOpenDBRequest {
    const request = new ControlledOpenRequest();
    this.requests.push(request);
    // Lifecycle tests deliberately expose only the IDBFactory.open contract.
    return request as unknown as IDBOpenDBRequest;
  }
}

function installControlledFactory(): ControlledIndexedDbFactory {
  const factory = new ControlledIndexedDbFactory();
  const indexedDbFactory = factory as unknown as IDBFactory;
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDbFactory });
  return factory;
}

async function seedRecords(
  databaseName: string,
  records: readonly Record<string, unknown>[],
): Promise<void> {
  const request = indexedDB.open(databaseName, 1);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore("pending-commits", {
      keyPath: ["documentId", "clientMutationId"],
    });
    store.createIndex("by-document", "documentId");
    request.result.createObjectStore("pending-commits-meta", { keyPath: "documentId" });
  };
  const database = await requestResult(request);
  const transaction = database.transaction("pending-commits", "readwrite");
  const store = transaction.objectStore("pending-commits");
  for (const record of records) store.put(record);
  await transactionDone(transaction);
  database.close();
}

async function storedRecords(databaseName: string): Promise<Array<Record<string, unknown>>> {
  const database = await requestResult(indexedDB.open(databaseName));
  const transaction = database.transaction("pending-commits", "readonly");
  const records = await requestResult(transaction.objectStore("pending-commits").getAll());
  await transactionDone(transaction);
  database.close();
  return records as Array<Record<string, unknown>>;
}

describe("IndexedDbPendingCommitStorage", () => {
  it("preserves queue order across overwrite/reopen and removes only the acknowledged commit", async () => {
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "ordered-queue" });
    const first = commit("document-a", "mutation-a", "first");
    const second = commit("document-a", "mutation-b", "second");
    const other = commit("document-b", "mutation-c", "other");

    await storage.put(first);
    await storage.put(second);
    await storage.put(other);
    const firstOperation = first.operations[0]!;
    if (firstOperation.op !== "set") throw new Error("Expected set operation fixture");
    (first.operations as Array<typeof firstOperation>)[0] = {
      ...firstOperation,
      value: { kind: "literal", value: "mutated" },
    };
    await storage.put(commit("document-a", "mutation-a", "updated"));

    expect(
      (await storage.load("document-a", LOAD_OPTIONS)).map((item) => item.clientMutationId),
    ).toEqual(["mutation-a", "mutation-b"]);
    expect(await storage.load("document-a", LOAD_OPTIONS)).toMatchObject([
      { operations: [{ value: { value: "updated" } }] },
      { operations: [{ value: { value: "second" } }] },
    ]);
    expect(await storage.load("document-b", LOAD_OPTIONS)).toHaveLength(1);

    await storage.remove("document-a", "mutation-a");
    expect(
      (await storage.load("document-a", LOAD_OPTIONS)).map((item) => item.clientMutationId),
    ).toEqual(["mutation-b"]);
    storage.close();
    expect(
      (await storage.load("document-a", LOAD_OPTIONS)).map((item) => item.clientMutationId),
    ).toEqual(["mutation-b"]);
    storage.close();
  });

  it("reopens more than 256 pending commits in insertion order", async () => {
    const databaseName = "large-offline-queue";
    const storage = new IndexedDbPendingCommitStorage({ databaseName });
    const ids = Array.from(
      { length: 300 },
      (_, index) => `mutation-${String(index).padStart(3, "0")}`,
    );
    for (const id of ids) await storage.put(commit("document-a", id, id));
    storage.close();

    const reopened = new IndexedDbPendingCommitStorage({ databaseName });
    const loaded = await reopened.load("document-a", {
      maxRecords: 10_000,
      maxOperations: 100_000,
      maxBytes: 128 * 1024 * 1024,
    });
    expect(loaded.map((item) => item.clientMutationId)).toEqual(ids);
    expect(loaded).toHaveLength(300);
    reopened.close();
  });

  it("enforces cursor load bounds at the exact record, operation, and byte boundary", async () => {
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "bounded-cursor" });
    const first = commit("document-a", "mutation-a", "first");
    const second = commit("document-a", "mutation-b", "second");
    await storage.put(first);
    await storage.put(second);
    const bytes =
      new TextEncoder().encode(JSON.stringify(first.operations)).byteLength +
      new TextEncoder().encode(JSON.stringify(second.operations)).byteLength;

    await expect(
      storage.load("document-a", {
        maxRecords: 2,
        maxOperations: 2,
        maxBytes: bytes,
      }),
    ).resolves.toHaveLength(2);
    for (const options of [
      { maxRecords: 1, maxOperations: 2, maxBytes: bytes },
      { maxRecords: 2, maxOperations: 1, maxBytes: bytes },
      { maxRecords: 2, maxOperations: 2, maxBytes: bytes - 1 },
    ]) {
      await expect(storage.load("document-a", options)).rejects.toMatchObject({
        code: "limit",
      });
    }
    expect(await storedRecords("bounded-cursor")).toHaveLength(2);
    await expect(
      storage.load("document-a", {
        maxRecords: 2,
        maxOperations: 2,
        maxBytes: bytes,
      }),
    ).resolves.toHaveLength(2);
    storage.close();
  });

  it("loads through ordered cursors without calling getAll", async () => {
    const databaseName = "cursor-only";
    const storage = new IndexedDbPendingCommitStorage({ databaseName });
    await storage.put(commit("document-a", "mutation-a", "first"));
    const probe = await requestResult(indexedDB.open(databaseName));
    const transaction = probe.transaction("pending-commits", "readonly");
    const prototype = Object.getPrototypeOf(transaction.objectStore("pending-commits")) as {
      getAll: IDBObjectStore["getAll"];
    };
    const originalGetAll = prototype.getAll;
    prototype.getAll = () => {
      throw new Error("getAll must not be used by pending queue load");
    };
    await transactionDone(transaction);
    probe.close();

    try {
      await expect(storage.load("document-a", LOAD_OPTIONS)).resolves.toHaveLength(1);
    } finally {
      prototype.getAll = originalGetAll;
      storage.close();
    }
  });

  it("atomically replaces only the expected ordered queue", async () => {
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "atomic-replace" });
    const first = commit("document-a", "mutation-a", "first");
    const second = commit("document-a", "mutation-b", "second");
    await storage.put(first);
    await storage.put(second);
    const replacements = [
      { ...first, baseVersion: 10 },
      { ...second, baseVersion: 11 },
    ];

    await storage.replace("document-a", ["mutation-a", "mutation-b"], replacements);
    expect(await storage.load("document-a", LOAD_OPTIONS)).toMatchObject([
      { clientMutationId: "mutation-a", baseVersion: 10 },
      { clientMutationId: "mutation-b", baseVersion: 11 },
    ]);
    await expect(
      storage.replace("document-a", ["mutation-b"], [{ ...second, baseVersion: 20 }]),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await storage.load("document-a", LOAD_OPTIONS)).toMatchObject([
      { clientMutationId: "mutation-a", baseVersion: 10 },
      { clientMutationId: "mutation-b", baseVersion: 11 },
    ]);
    storage.close();
  });

  it("persists legacy migration schema and queue order across reopen", async () => {
    await seedRecords("legacy-queue", [
      {
        documentId: "document-a",
        clientMutationId: "legacy-c",
        baseVersion: 1,
        operations: commit("document-a", "legacy-c", "third").operations,
      },
      {
        documentId: "document-a",
        clientMutationId: "legacy-a",
        baseVersion: 3,
        operations: commit("document-a", "legacy-a", "first").operations,
      },
      {
        documentId: "document-a",
        clientMutationId: "legacy-b",
        baseVersion: 2,
        operations: commit("document-a", "legacy-b", "second").operations,
      },
    ]);
    const migrating = new IndexedDbPendingCommitStorage({ databaseName: "legacy-queue" });
    const migratedOrder = (await migrating.load("document-a", LOAD_OPTIONS)).map(
      (item) => item.clientMutationId,
    );
    expect(migratedOrder).toEqual(["legacy-c", "legacy-b", "legacy-a"]);
    migrating.close();

    const persisted = await storedRecords("legacy-queue");
    expect(persisted.map((record) => record.queueSchemaVersion)).toEqual([1, 1, 1]);
    expect(
      persisted
        .map((record) => record.sequence)
        .sort((left, right) => Number(left) - Number(right)),
    ).toEqual([1, 2, 3]);

    const reopened = new IndexedDbPendingCommitStorage({ databaseName: "legacy-queue" });
    expect(
      (await reopened.load("document-a", LOAD_OPTIONS)).map((item) => item.clientMutationId),
    ).toEqual(migratedOrder);
    expect(await reopened.load("document-a", LOAD_OPTIONS)).toMatchObject([
      { operations: [{ value: { value: "third" } }] },
      { operations: [{ value: { value: "second" } }] },
      { operations: [{ value: { value: "first" } }] },
    ]);
    reopened.close();
  });

  it("rejects pending records from a newer schema", async () => {
    await seedRecords("future-queue", [
      {
        queueSchemaVersion: 2,
        sequence: 1,
        documentId: "document-a",
        clientMutationId: "future",
        baseVersion: 1,
        operations: [],
      },
    ]);
    const future = new IndexedDbPendingCommitStorage({ databaseName: "future-queue" });
    await expect(future.load("document-a", LOAD_OPTIONS)).rejects.toMatchObject({
      code: "unsupported-schema",
    });
    future.close();
  });

  it("aborts active requests and transactions with the host reason", async () => {
    const requestStorage = new IndexedDbPendingCommitStorage({
      databaseName: "active-request-abort",
    });
    await requestStorage.put(commit("document-a", "seed", "seed"));
    const requestAbort = new AbortController();
    const pendingPut = requestStorage.put(
      commit("document-a", "mutation-a", "value"),
      requestAbort.signal,
    );
    requestAbort.abort(new Error("cancel active request"));
    await expect(pendingPut).rejects.toMatchObject({
      code: "aborted",
      cause: requestAbort.signal.reason,
    });
    requestStorage.close();

    const transactionStorage = new IndexedDbPendingCommitStorage({
      databaseName: "active-transaction-abort",
    });
    await transactionStorage.put(commit("document-a", "mutation-a", "value"));
    const transactionAbort = new AbortController();
    const pendingRemove = transactionStorage.remove(
      "document-a",
      "mutation-a",
      transactionAbort.signal,
    );
    transactionAbort.abort(new Error("cancel active transaction"));
    await expect(pendingRemove).rejects.toMatchObject({
      code: "aborted",
      cause: transactionAbort.signal.reason,
    });
    transactionStorage.close();
  });

  it("fails deterministically for pre-aborted operations and unavailable browser storage", async () => {
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "abort-queue" });
    const controller = new AbortController();
    controller.abort(new Error("cancelled by host"));
    await expect(
      storage.put(commit("document-a", "mutation-a", "value"), controller.signal),
    ).rejects.toMatchObject({
      code: "aborted",
      cause: controller.signal.reason,
    });

    Reflect.deleteProperty(globalThis, "indexedDB");
    await expect(storage.load("document-a", LOAD_OPTIONS)).rejects.toEqual(
      new IndexedDbPendingCommitStorageError(
        "unavailable",
        "IndexedDB is unavailable; use a host PendingCommitStorage adapter",
      ),
    );
    storage.close();
  });
  it("closes a blocked attempt's late database and permits a retry", async () => {
    const factory = installControlledFactory();
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "blocked-open" });
    const blockedLoad = storage.load("document-a", LOAD_OPTIONS);
    const blockedRequest = factory.requests[0]!;
    blockedRequest.blocked();
    await expect(blockedLoad).rejects.toMatchObject({ code: "blocked" });

    const lateDatabase = new ControlledDatabase();
    blockedRequest.succeeded(lateDatabase);
    await Promise.resolve();
    expect(lateDatabase.closeCalls).toBe(1);

    const retry = storage.load("document-a", LOAD_OPTIONS);
    expect(factory.requests).toHaveLength(2);
    factory.requests[1]!.failed("retry failure");
    await expect(retry).rejects.toMatchObject({
      code: "transaction",
      cause: expect.objectContaining({ message: "retry failure" }),
    });
    storage.close();
  });

  it("clears a failed open so the next operation starts a fresh attempt", async () => {
    const factory = installControlledFactory();
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "retry-open" });
    const first = storage.load("document-a", LOAD_OPTIONS);
    factory.requests[0]!.failed();
    await expect(first).rejects.toMatchObject({ code: "transaction" });

    const second = storage.load("document-a", LOAD_OPTIONS);
    expect(factory.requests).toHaveLength(2);
    factory.requests[1]!.failed("second failure");
    await expect(second).rejects.toMatchObject({ code: "transaction" });
    storage.close();
  });

  it("rejects close during open and closes a database delivered afterward", async () => {
    const factory = installControlledFactory();
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "close-during-open" });
    const load = storage.load("document-a", LOAD_OPTIONS);
    const request = factory.requests[0]!;
    storage.close();
    const lateDatabase = new ControlledDatabase();
    request.succeeded(lateDatabase);

    await expect(load).rejects.toMatchObject({ code: "aborted" });
    expect(lateDatabase.closeCalls).toBe(1);
  });

  it("consumes close after rejection without retaining a late connection", async () => {
    const factory = installControlledFactory();
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "close-after-rejection" });
    const load = storage.load("document-a", LOAD_OPTIONS);
    const request = factory.requests[0]!;
    request.blocked();
    await expect(load).rejects.toMatchObject({ code: "blocked" });
    storage.close();

    const lateDatabase = new ControlledDatabase();
    request.succeeded(lateDatabase);
    await Promise.resolve();
    expect(lateDatabase.closeCalls).toBe(1);
  });

  it("drops a versionchanged connection and successfully starts a replacement open", async () => {
    const factory = installControlledFactory();
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "versionchange-open" });
    const firstLoad = storage.load("document-a", LOAD_OPTIONS);
    const firstDatabase = new ControlledDatabase();
    factory.requests[0]!.succeeded(firstDatabase);
    await expect(firstLoad).rejects.toThrow("controlled database transaction");

    firstDatabase.versionchange();
    expect(firstDatabase.closeCalls).toBe(1);
    const reopenedLoad = storage.load("document-a", LOAD_OPTIONS);
    expect(factory.requests).toHaveLength(2);
    const replacement = new ControlledDatabase();
    factory.requests[1]!.succeeded(replacement);
    await expect(reopenedLoad).rejects.toThrow("controlled database transaction");
    storage.close();
    await Promise.resolve();
    expect(replacement.closeCalls).toBe(1);
  });
});
