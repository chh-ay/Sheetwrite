import { boundedJsonByteLength, JsonByteLengthError, SheetwriteError } from "./errors.js";
import type { PendingCommitLoadOptions, PendingCommitStorage } from "./sync.js";
import type { PendingCommit } from "./types/transaction.js";

const DATABASE_VERSION = 2;
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
  | "transaction"
  | "conflict"
  | "limit";

/** Typed IndexedDB failure raised by durable pending-commit storage. */
export class IndexedDbPendingCommitStorageError extends SheetwriteError {
  override readonly name = "IndexedDbPendingCommitStorageError";

  constructor(
    code: IndexedDbPendingCommitStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(code, "pending-storage", message, { cause: options?.cause });
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

interface DatabaseOpenAttempt {
  readonly promise: Promise<IDBDatabase>;
  readonly resolve: (database: IDBDatabase) => void;
  readonly reject: (error: unknown) => void;
  active: boolean;
  settled: boolean;
  database?: IDBDatabase;
}
/**
 * Browser-only durable pending queue. Import it from `@sheetwrite/core/browser`;
 * the package's root entrypoint never evaluates IndexedDB globals.
 */
export class IndexedDbPendingCommitStorage implements PendingCommitStorage {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly metaStoreName: string;
  private databaseAttempt?: DatabaseOpenAttempt;

  constructor(options: IndexedDbPendingCommitStorageOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE;
    this.storeName = options.storeName ?? DEFAULT_STORE;
    this.metaStoreName = `${this.storeName}-meta`;
  }

  async load(
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<readonly PendingCommit[]> {
    assertLoadOptions(options);
    throwIfAborted(options.signal);
    const database = await this.open(options.signal);
    const legacy = await this.inspectForLegacy(database, documentId, options);
    if (legacy.records.length > 0) {
      legacy.records.sort(
        (left, right) =>
          left.baseVersion - right.baseVersion ||
          left.clientMutationId.localeCompare(right.clientMutationId),
      );
      await this.ensureSequenceFloor(database, documentId, legacy.maxSequence + 1, options.signal);
      for (const record of legacy.records) await this.put(record, options.signal);
    }
    return this.readOrdered(database, documentId, options);
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
  async replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    if (
      commits.some((commit) => commit.documentId !== documentId) ||
      new Set(commits.map((commit) => commit.clientMutationId)).size !== commits.length
    ) {
      throw new IndexedDbPendingCommitStorageError(
        "transaction",
        "Replacement commits must be unique and belong to the target document",
      );
    }
    const database = await this.open(signal);
    const transaction = database.transaction([this.storeName, this.metaStoreName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const metaStore = transaction.objectStore(this.metaStoreName);
    const range = IDBKeyRange.bound([documentId, 0], [documentId, Number.MAX_SAFE_INTEGER]);
    const request = store.index("by-document-sequence").openCursor(range);
    const completion = transactionDone(transaction, signal);
    const currentIds: string[] = [];
    const prepared = Promise.withResolvers<void>();
    request.onerror = () =>
      prepared.reject(storageError(request.error, "Unable to inspect pending queue"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        currentIds.push((cursor.value as StoredPendingCommit).clientMutationId);
        cursor.continue();
        return;
      }
      try {
        if (
          currentIds.length !== expectedClientMutationIds.length ||
          currentIds.some((id, index) => id !== expectedClientMutationIds[index])
        ) {
          throw new IndexedDbPendingCommitStorageError(
            "conflict",
            "Pending queue changed before atomic replacement",
          );
        }
        for (const id of currentIds) store.delete([documentId, id]);
        for (let index = 0; index < commits.length; index++) {
          const commit = commits[index]!;
          store.put({
            queueSchemaVersion: RECORD_SCHEMA_VERSION,
            sequence: index + 1,
            documentId,
            baseVersion: commit.baseVersion,
            clientMutationId: commit.clientMutationId,
            operations: cloneJsonValue(commit.operations),
          } satisfies StoredPendingCommit);
        }
        metaStore.put({
          documentId,
          nextSequence: commits.length + 1,
        } satisfies QueueMeta);
        prepared.resolve();
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have failed.
        }
        prepared.reject(error);
      }
    };
    try {
      await prepared.promise;
      await completion;
    } catch (error) {
      void completion.catch(() => {});
      throw storageError(error, "Unable to atomically replace pending Sheetwrite commits");
    }
  }

  close(): void {
    const attempt = this.databaseAttempt;
    if (!attempt) return;
    this.databaseAttempt = undefined;
    attempt.active = false;
    if (attempt.database) {
      attempt.database.close();
    } else if (!attempt.settled) {
      attempt.settled = true;
      attempt.reject(
        new IndexedDbPendingCommitStorageError(
          "aborted",
          `IndexedDB open for ${this.databaseName} was closed`,
        ),
      );
    }
    void attempt.promise.then(
      () => undefined,
      () => undefined,
    );
  }

  private async inspectForLegacy(
    database: IDBDatabase,
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<{ records: StoredPendingCommit[]; maxSequence: number }> {
    const transaction = database.transaction(this.storeName, "readonly");
    const request = transaction
      .objectStore(this.storeName)
      .index("by-document")
      .openCursor(IDBKeyRange.only(documentId));
    const completion = transactionDone(transaction, options.signal);
    const stats: LoadStats = { records: 0, operations: 0, bytes: 0 };
    const records: StoredPendingCommit[] = [];
    let maxSequence = 0;
    try {
      await walkCursor(request, transaction, options.signal, (record) => {
        accountStoredRecord(record, options, stats);
        if (record.sequence === undefined || (record.queueSchemaVersion ?? 0) === 0) {
          records.push(record);
        } else {
          maxSequence = Math.max(maxSequence, record.sequence);
        }
      });
      await completion;
      return { records, maxSequence };
    } catch (error) {
      void completion.catch(() => {});
      throw error;
    }
  }

  private async ensureSequenceFloor(
    database: IDBDatabase,
    documentId: string,
    minimum: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const transaction = database.transaction(this.metaStoreName, "readwrite");
    const store = transaction.objectStore(this.metaStoreName);
    const current = await requestResult<QueueMeta | undefined>(
      store.get(documentId),
      signal,
      transaction,
    );
    if ((current?.nextSequence ?? 1) < minimum) {
      store.put({ documentId, nextSequence: minimum } satisfies QueueMeta);
    }
    await transactionDone(transaction, signal);
  }

  private async readOrdered(
    database: IDBDatabase,
    documentId: string,
    options: PendingCommitLoadOptions,
  ): Promise<PendingCommit[]> {
    const transaction = database.transaction(this.storeName, "readonly");
    const range = IDBKeyRange.bound([documentId, 0], [documentId, Number.MAX_SAFE_INTEGER]);
    const request = transaction
      .objectStore(this.storeName)
      .index("by-document-sequence")
      .openCursor(range);
    const completion = transactionDone(transaction, options.signal);
    const stats: LoadStats = { records: 0, operations: 0, bytes: 0 };
    const records: PendingCommit[] = [];
    try {
      await walkCursor(request, transaction, options.signal, (record) => {
        accountStoredRecord(record, options, stats);
        records.push({
          documentId: record.documentId,
          baseVersion: record.baseVersion,
          clientMutationId: record.clientMutationId,
          operations: record.operations,
        });
      });
      await completion;
      return records;
    } catch (error) {
      void completion.catch(() => {});
      throw error;
    }
  }

  private open(signal?: AbortSignal): Promise<IDBDatabase> {
    throwIfAborted(signal);
    if (typeof indexedDB === "undefined") {
      throw new IndexedDbPendingCommitStorageError(
        "unavailable",
        "IndexedDB is unavailable; use a host PendingCommitStorage adapter",
      );
    }
    if (this.databaseAttempt) return this.databaseAttempt.promise;

    const deferred = Promise.withResolvers<IDBDatabase>();
    const attempt: DatabaseOpenAttempt = {
      promise: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
      active: true,
      settled: false,
    };
    this.databaseAttempt = attempt;
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
      if (!store.indexNames.contains("by-document-sequence")) {
        store.createIndex("by-document-sequence", ["documentId", "sequence"], {
          unique: false,
        });
      }
      if (!database.objectStoreNames.contains(this.metaStoreName)) {
        database.createObjectStore(this.metaStoreName, { keyPath: "documentId" });
      }
    };
    request.onblocked = () => {
      this.rejectOpenAttempt(
        attempt,
        new IndexedDbPendingCommitStorageError(
          "blocked",
          `IndexedDB upgrade for ${this.databaseName} is blocked by another tab`,
        ),
      );
    };
    request.onerror = () => {
      this.rejectOpenAttempt(attempt, storageError(request.error, "Unable to open IndexedDB"));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (!attempt.active || this.databaseAttempt !== attempt) {
        database.close();
        return;
      }
      attempt.database = database;
      attempt.settled = true;
      database.onversionchange = () => {
        database.close();
        attempt.active = false;
        if (this.databaseAttempt === attempt) this.databaseAttempt = undefined;
      };
      attempt.resolve(database);
    };
    return attempt.promise;
  }

  private rejectOpenAttempt(attempt: DatabaseOpenAttempt, error: unknown): void {
    if (!attempt.active || attempt.settled) return;
    attempt.active = false;
    attempt.settled = true;
    if (this.databaseAttempt === attempt) this.databaseAttempt = undefined;
    attempt.reject(error);
  }
}

interface LoadStats {
  records: number;
  operations: number;
  bytes: number;
}

function assertLoadOptions(options: PendingCommitLoadOptions): void {
  if (
    !options ||
    !Number.isSafeInteger(options.maxRecords) ||
    options.maxRecords < 0 ||
    !Number.isSafeInteger(options.maxOperations) ||
    options.maxOperations < 0 ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes < 0
  ) {
    throw new IndexedDbPendingCommitStorageError(
      "limit",
      "Pending commit load limits must be nonnegative safe integers",
    );
  }
}

function accountStoredRecord(
  value: unknown,
  options: PendingCommitLoadOptions,
  stats: LoadStats,
): asserts value is StoredPendingCommit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IndexedDbPendingCommitStorageError("transaction", "Pending queue record is invalid");
  }
  const record = value as StoredPendingCommit;
  const version = record.queueSchemaVersion ?? 0;
  if (version > RECORD_SCHEMA_VERSION) {
    throw new IndexedDbPendingCommitStorageError(
      "unsupported-schema",
      `Pending queue record schema ${version} is newer than ${RECORD_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(record.operations)) {
    throw new IndexedDbPendingCommitStorageError(
      "transaction",
      "Pending queue record operations are invalid",
    );
  }
  if (stats.records + 1 > options.maxRecords) {
    throw new IndexedDbPendingCommitStorageError(
      "limit",
      `Pending queue exceeds the ${options.maxRecords} record limit`,
    );
  }
  if (stats.operations + record.operations.length > options.maxOperations) {
    throw new IndexedDbPendingCommitStorageError(
      "limit",
      `Pending queue exceeds the ${options.maxOperations} operation limit`,
    );
  }
  let bytes: number;
  try {
    bytes = boundedJsonByteLength(record.operations, options.maxBytes - stats.bytes);
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "limit") {
      throw new IndexedDbPendingCommitStorageError(
        "limit",
        `Pending queue exceeds the ${options.maxBytes} byte limit`,
        { cause: error },
      );
    }
    throw new IndexedDbPendingCommitStorageError(
      "transaction",
      "Pending queue record is not JSON-safe",
      { cause: error },
    );
  }
  stats.records += 1;
  stats.operations += record.operations.length;
  stats.bytes += bytes;
}

async function walkCursor(
  request: IDBRequest<IDBCursorWithValue | null>,
  transaction: IDBTransaction,
  signal: AbortSignal | undefined,
  visit: (value: unknown) => void,
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let settled = false;
  const cleanup = () => signal?.removeEventListener("abort", abort);
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    try {
      transaction.abort();
    } catch {
      // A completed transaction does not need cancellation.
    }
    reject(error);
  };
  const abort = () =>
    fail(
      new IndexedDbPendingCommitStorageError("aborted", "IndexedDB operation was aborted", {
        cause: signal?.reason,
      }),
    );
  if (signal?.aborted) {
    abort();
    return promise;
  }
  signal?.addEventListener("abort", abort, { once: true });
  request.onerror = () => fail(storageError(request.error, "IndexedDB cursor failed"));
  request.onsuccess = () => {
    if (settled) return;
    const cursor = request.result;
    if (!cursor) {
      settled = true;
      cleanup();
      resolve();
      return;
    }
    try {
      visit(cursor.value);
      cursor.continue();
    } catch (error) {
      fail(error);
    }
  };
  return promise;
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
