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
});
