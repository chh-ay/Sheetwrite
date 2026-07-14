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

async function seedRecord(databaseName: string, record: Record<string, unknown>): Promise<void> {
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
  transaction.objectStore("pending-commits").put(record);
  await transactionDone(transaction);
  database.close();
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

    expect((await storage.load("document-a")).map((item) => item.clientMutationId)).toEqual([
      "mutation-a",
      "mutation-b",
    ]);
    expect(await storage.load("document-a")).toMatchObject([
      { operations: [{ value: { value: "updated" } }] },
      { operations: [{ value: { value: "second" } }] },
    ]);
    expect(await storage.load("document-b")).toHaveLength(1);

    await storage.remove("document-a", "mutation-a");
    expect((await storage.load("document-a")).map((item) => item.clientMutationId)).toEqual([
      "mutation-b",
    ]);
    storage.close();
    expect((await storage.load("document-a")).map((item) => item.clientMutationId)).toEqual([
      "mutation-b",
    ]);
    storage.close();
  });

  it("migrates legacy queue records but rejects records from a newer schema", async () => {
    await seedRecord("legacy-queue", {
      documentId: "document-a",
      clientMutationId: "legacy",
      baseVersion: 1,
      operations: commit("document-a", "legacy", "legacy").operations,
    });
    const legacy = new IndexedDbPendingCommitStorage({ databaseName: "legacy-queue" });
    expect(await legacy.load("document-a")).toMatchObject([
      { clientMutationId: "legacy", operations: [{ value: { value: "legacy" } }] },
    ]);
    // A second read proves migration persisted a current schema/sequence instead
    // of merely tolerating the old record in memory.
    expect(await legacy.load("document-a")).toHaveLength(1);
    legacy.close();

    await seedRecord("future-queue", {
      queueSchemaVersion: 2,
      sequence: 1,
      documentId: "document-a",
      clientMutationId: "future",
      baseVersion: 1,
      operations: [],
    });
    const future = new IndexedDbPendingCommitStorage({ databaseName: "future-queue" });
    await expect(future.load("document-a")).rejects.toMatchObject({ code: "unsupported-schema" });
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
    await expect(storage.load("document-a")).rejects.toEqual(
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
    const blockedLoad = storage.load("document-a");
    const blockedRequest = factory.requests[0]!;
    blockedRequest.blocked();
    await expect(blockedLoad).rejects.toMatchObject({ code: "blocked" });

    const lateDatabase = new ControlledDatabase();
    blockedRequest.succeeded(lateDatabase);
    await Promise.resolve();
    expect(lateDatabase.closeCalls).toBe(1);

    const retry = storage.load("document-a");
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
    const first = storage.load("document-a");
    factory.requests[0]!.failed();
    await expect(first).rejects.toMatchObject({ code: "transaction" });

    const second = storage.load("document-a");
    expect(factory.requests).toHaveLength(2);
    factory.requests[1]!.failed("second failure");
    await expect(second).rejects.toMatchObject({ code: "transaction" });
    storage.close();
  });

  it("rejects close during open and closes a database delivered afterward", async () => {
    const factory = installControlledFactory();
    const storage = new IndexedDbPendingCommitStorage({ databaseName: "close-during-open" });
    const load = storage.load("document-a");
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
    const load = storage.load("document-a");
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
    const firstLoad = storage.load("document-a");
    const firstDatabase = new ControlledDatabase();
    factory.requests[0]!.succeeded(firstDatabase);
    await expect(firstLoad).rejects.toThrow("controlled database transaction");

    firstDatabase.versionchange();
    expect(firstDatabase.closeCalls).toBe(1);
    const reopenedLoad = storage.load("document-a");
    expect(factory.requests).toHaveLength(2);
    const replacement = new ControlledDatabase();
    factory.requests[1]!.succeeded(replacement);
    await expect(reopenedLoad).rejects.toThrow("controlled database transaction");
    storage.close();
    await Promise.resolve();
    expect(replacement.closeCalls).toBe(1);
  });
});
