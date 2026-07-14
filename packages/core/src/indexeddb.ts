import type { PendingCommitStorage } from "./sync.js";
import type { PendingCommit } from "./types/transaction.js";

const DATABASE_VERSION = 1;
const RECORD_SCHEMA_VERSION = 1;
const DEFAULT_DATABASE = "sheetwrite-offline";
const DEFAULT_STORE = "pending-commits";

/** Stable category for an IndexedDB pending-storage failure. */
export type IndexedDbPendingCommitStorageErrorCode =
  | "unavailable"
  | "blocked"
  | "aborted"
  | "quota"
  | "unsupported-schema"
  | "transaction";

/** Typed IndexedDB failure raised by durable pending-commit storage. */
export class IndexedDbPendingCommitStorageError extends Error {
  constructor(
    readonly code: IndexedDbPendingCommitStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "IndexedDbPendingCommitStorageError";
  }
}

/** Database and store naming options for durable pending commits. */
export interface IndexedDbPendingCommitStorageOptions {
  databaseName?: string;
  storeName?: string;
}

interface StoredPendingCommit extends PendingCommit {
  queueSchemaVersion?: number;
  sequence?: number;
}

interface QueueMeta {
  documentId: string;
  nextSequence: number;
}

/**
 * Browser-only durable pending queue. Import it from `@sheetwrite/core/browser`;
 * the package's root entrypoint never evaluates IndexedDB globals.
 */
export class IndexedDbPendingCommitStorage implements PendingCommitStorage {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly metaStoreName: string;
  private databasePromise?: Promise<IDBDatabase>;

  constructor(options: IndexedDbPendingCommitStorageOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE;
    this.storeName = options.storeName ?? DEFAULT_STORE;
    this.metaStoreName = `${this.storeName}-meta`;
  }

  async load(documentId: string, signal?: AbortSignal): Promise<readonly PendingCommit[]> {
    throwIfAborted(signal);
    const database = await this.open(signal);
    const transaction = database.transaction(this.storeName, "readonly");
    const store = transaction.objectStore(this.storeName);
    const index = store.index("by-document");
    const records = await requestResult<StoredPendingCommit[]>(
      index.getAll(IDBKeyRange.only(documentId)),
      signal,
      transaction,
    );
    await transactionDone(transaction, signal);

    const migrations: StoredPendingCommit[] = [];
    for (const record of records) {
      const version = record.queueSchemaVersion ?? 0;
      if (version > RECORD_SCHEMA_VERSION) {
        throw new IndexedDbPendingCommitStorageError(
          "unsupported-schema",
          `Pending queue record schema ${version} is newer than ${RECORD_SCHEMA_VERSION}`,
        );
      }
      if (version === 0 || record.sequence === undefined) migrations.push(record);
    }
    for (const record of migrations) {
      await this.put(record, signal);
    }

    const reloaded = migrations.length > 0 ? await this.readCurrent(documentId, signal) : records;
    return reloaded
      .slice()
      .sort((a, b) => (a.sequence ?? a.baseVersion) - (b.sequence ?? b.baseVersion))
      .map(({ documentId: id, baseVersion, clientMutationId, operations }) => ({
        documentId: id,
        baseVersion,
        clientMutationId,
        operations: cloneJsonValue(operations),
      }));
  }

  async put(commit: PendingCommit, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const database = await this.open(signal);
    const transaction = database.transaction([this.storeName, this.metaStoreName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const metaStore = transaction.objectStore(this.metaStoreName);
    const key: [string, string] = [commit.documentId, commit.clientMutationId];

    try {
      const existing = await requestResult<StoredPendingCommit | undefined>(
        store.get(key),
        signal,
        transaction,
      );
      let sequence = existing?.sequence;
      if (sequence === undefined) {
        const meta = await requestResult<QueueMeta | undefined>(
          metaStore.get(commit.documentId),
          signal,
          transaction,
        );
        sequence = meta?.nextSequence ?? 1;
        metaStore.put({
          documentId: commit.documentId,
          nextSequence: sequence + 1,
        } satisfies QueueMeta);
      }
      store.put({
        queueSchemaVersion: RECORD_SCHEMA_VERSION,
        sequence,
        documentId: commit.documentId,
        baseVersion: commit.baseVersion,
        clientMutationId: commit.clientMutationId,
        operations: cloneJsonValue(commit.operations),
      } satisfies StoredPendingCommit);
      await transactionDone(transaction, signal);
    } catch (error) {
      throw storageError(error, "Unable to persist pending Sheetwrite commit");
    }
  }

  async remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const database = await this.open(signal);
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).delete([documentId, clientMutationId]);
    try {
      await transactionDone(transaction, signal);
    } catch (error) {
      throw storageError(error, "Unable to remove acknowledged Sheetwrite commit");
    }
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = undefined;
  }

  private async readCurrent(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<StoredPendingCommit[]> {
    const database = await this.open(signal);
    const transaction = database.transaction(this.storeName, "readonly");
    const records = await requestResult<StoredPendingCommit[]>(
      transaction
        .objectStore(this.storeName)
        .index("by-document")
        .getAll(IDBKeyRange.only(documentId)),
      signal,
      transaction,
    );
    await transactionDone(transaction, signal);
    return records;
  }

  private open(signal?: AbortSignal): Promise<IDBDatabase> {
    throwIfAborted(signal);
    if (typeof indexedDB === "undefined") {
      throw new IndexedDbPendingCommitStorageError(
        "unavailable",
        "IndexedDB is unavailable; use a host PendingCommitStorage adapter",
      );
    }
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const transaction = request.transaction;
        if (!transaction) return;
        const store = database.objectStoreNames.contains(this.storeName)
          ? transaction.objectStore(this.storeName)
          : database.createObjectStore(this.storeName, {
              keyPath: ["documentId", "clientMutationId"],
            });
        if (!store.indexNames.contains("by-document")) {
          store.createIndex("by-document", "documentId", { unique: false });
        }
        if (!database.objectStoreNames.contains(this.metaStoreName)) {
          database.createObjectStore(this.metaStoreName, { keyPath: "documentId" });
        }
      };
      request.onblocked = () => {
        reject(
          new IndexedDbPendingCommitStorageError(
            "blocked",
            `IndexedDB upgrade for ${this.databaseName} is blocked by another tab`,
          ),
        );
      };
      request.onerror = () => reject(storageError(request.error, "Unable to open IndexedDB"));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
    return this.databasePromise;
  }
}

function requestResult<T>(
  request: IDBRequest<T>,
  signal: AbortSignal | undefined,
  transaction: IDBTransaction,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete; the signal still wins.
      }
      reject(
        new IndexedDbPendingCommitStorageError("aborted", "IndexedDB operation was aborted", {
          cause: signal?.reason,
        }),
      );
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    request.onsuccess = () => {
      signal?.removeEventListener("abort", abort);
      resolve(request.result);
    };
    request.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(storageError(request.error, "IndexedDB request failed"));
    };
  });
}

function transactionDone(transaction: IDBTransaction, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete; the signal still wins.
      }
      reject(
        new IndexedDbPendingCommitStorageError("aborted", "IndexedDB transaction was aborted", {
          cause: signal?.reason,
        }),
      );
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    transaction.oncomplete = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    transaction.onabort = transaction.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(storageError(transaction.error, "IndexedDB transaction failed"));
    };
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new IndexedDbPendingCommitStorageError("aborted", "IndexedDB operation was aborted", {
      cause: signal.reason,
    });
  }
}

function storageError(error: unknown, message: string): IndexedDbPendingCommitStorageError {
  if (error instanceof IndexedDbPendingCommitStorageError) return error;
  const name = error instanceof DOMException ? error.name : "";
  const code: IndexedDbPendingCommitStorageErrorCode =
    name === "QuotaExceededError" ? "quota" : name === "AbortError" ? "aborted" : "transaction";
  return new IndexedDbPendingCommitStorageError(code, message, { cause: error });
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
