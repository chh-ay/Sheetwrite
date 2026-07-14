import type { DocumentOp, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type {
  PendingCommit,
  PersistenceAdapter,
  PersistenceCommitResponse,
  RemoteOperationSource,
  SyncMutationRecord,
  VersionedOperation,
} from "./types/transaction.js";

/** Host-owned durable queue. Browser storage lives in the optional `./browser` entrypoint. */
export interface PendingCommitStorage {
  load(documentId: string, signal?: AbortSignal): Promise<readonly PendingCommit[]>;
  put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
  remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void>;
}

/** Host-controlled online state reported by synchronization. */
export type SyncConnectionState = "offline" | "connecting" | "online" | "error" | "destroyed";
/** Current persistence activity reported by a sync coordinator. */
export type SyncActivityState =
  | "hydrating"
  | "idle"
  | "persisting"
  | "pending"
  | "sending"
  | "conflict"
  | "error"
  | "destroyed";

/** Immutable observable synchronization state. */
export interface SyncStateSnapshot {
  connection: SyncConnectionState;
  activity: SyncActivityState;
  pendingCount: number;
  serverVersion: number;
}

/** Contiguous-version recovery request produced when remote input skips ahead. */
export interface SyncVersionGapRequest {
  documentId: string;
  expectedVersion: number;
  receivedVersion: number;
  signal: AbortSignal;
}

/** Document, version, durability, and online options for synchronization. */
export interface SyncCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  createMutationId?: () => string;
  pendingStorage?: PendingCommitStorage;
  initialConnection?: "offline" | "online";
  /**
   * Optional host recovery hook. Return the missing ordered operations, or a
   * snapshot for the host to remount before calling `resumeAfterReload`.
   */
  recoverVersionGap?: (
    request: SyncVersionGapRequest,
  ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
}

/** Queue, version, connection, or error transition emitted by synchronization. */
export type SyncCoordinatorEvent =
  | { type: "state"; state: SyncStateSnapshot }
  | { type: "restored"; pending: readonly SyncMutationRecord[] }
  | { type: "persisting"; mutation: SyncMutationRecord }
  | { type: "pending"; mutation: SyncMutationRecord }
  | { type: "sending"; mutation: SyncMutationRecord }
  | {
      type: "acknowledged";
      clientMutationId: string;
      version: number;
      duplicate: boolean;
    }
  | {
      type: "conflict";
      mutation: SyncMutationRecord;
      response: Extract<PersistenceCommitResponse, { status: "conflict" }>;
    }
  | { type: "remote-applied"; operation: VersionedOperation }
  | {
      type: "reload-required";
      expectedVersion: number;
      receivedVersion: number;
      snapshot?: WorkbookSnapshot;
    }
  | { type: "reloaded"; serverVersion: number; pending: readonly SyncMutationRecord[] }
  | { type: "storage-error"; error: unknown; clientMutationId?: string }
  | { type: "error"; error: unknown; clientMutationId?: string };

type SyncListener = (event: SyncCoordinatorEvent) => void;

let nextMutation = 1;

/**
 * Deterministic, transport-neutral optimistic sync. Local rendering is never
 * blocked: changes queue immediately, while hosts explicitly call `sendNext`
 * or `retry` to perform network work.
 */
export class SyncCoordinator {
  private readonly records = new Map<string, SyncMutationRecord>();
  private readonly order: string[] = [];
  private readonly acknowledged = new Set<string>();
  private readonly listeners = new Set<SyncListener>();
  private readonly abortController = new AbortController();
  private readonly activeSends = new Map<string, AbortController>();
  private readonly persistence = new Map<string, Promise<void>>();
  private readonly storageErrors = new Map<string, unknown>();
  private readonly ambiguousRestores = new Set<string>();
  private readonly gapBuffer = new Map<number, VersionedOperation>();
  private readonly disposeGrid: () => void;
  private readonly readyPromise: Promise<void>;
  private disposeRemote?: () => void;
  private destroyed = false;
  private hydrating: boolean;
  private hydrationError: unknown;
  private recoveryPromise?: Promise<void>;
  private flushPromise?: Promise<readonly PersistenceCommitResponse[]>;
  private connection: SyncConnectionState;
  private version: number;

  constructor(
    private readonly grid: Grid,
    private readonly adapter: PersistenceAdapter,
    private readonly options: SyncCoordinatorOptions,
  ) {
    this.version = options.serverVersion;
    this.connection = options.initialConnection ?? "online";
    this.hydrating = options.pendingStorage !== undefined;
    this.disposeGrid = grid.on("change", (event) => {
      if (event.source !== "local" || event.transaction.patches.length === 0) return;
      this.enqueue(event.transaction.patches);
    });
    this.readyPromise = this.hydrating
      ? Promise.resolve()
          .then(() => this.restorePending())
          .catch((error: unknown) => {
            this.hydrationError = error;
            this.hydrating = false;
            this.emitState();
            this.emit({ type: "storage-error", error });
          })
      : Promise.resolve();
    if (this.hydrating) {
      void this.readyPromise.then(() => {
        if (!this.destroyed && this.connection === "online" && this.ambiguousRestores.size > 0) {
          void this.flush().catch(() => {});
        }
      });
    }
  }

  get serverVersion(): number {
    return this.version;
  }

  get pendingCount(): number {
    return this.records.size;
  }

  get state(): SyncStateSnapshot {
    return {
      connection: this.destroyed ? "destroyed" : this.connection,
      activity: this.activity(),
      pendingCount: this.records.size,
      serverVersion: this.version,
    };
  }

  pendingCommits(): readonly SyncMutationRecord[] {
    return this.order
      .map((id) => this.records.get(id))
      .filter((record): record is SyncMutationRecord => record !== undefined)
      .map(cloneRecord);
  }

  on(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves after durable work is restored and every startup commit is visible locally. */
  async ready(): Promise<void> {
    await this.readyPromise;
    await Promise.all(this.persistence.values());
    if (this.hydrationError !== undefined) throw this.hydrationError;
    const storageError = this.storageErrors.values().next();
    if (!storageError.done) throw storageError.value;
  }

  /**
   * Update connectivity. Reconnection drains durable work in order; going
   * offline aborts in-flight requests so retries retain their mutation IDs.
   */
  setOnline(online: boolean): void {
    if (this.destroyed) return;
    const next: SyncConnectionState = online ? "online" : "offline";
    if (this.connection === next) return;
    this.connection = next;
    if (!online) {
      for (const controller of this.activeSends.values()) {
        controller.abort("Sheetwrite sync disconnected");
      }
    }
    this.emitState();
    if (online) void this.flush().catch(() => {});
  }

  subscribe(source: RemoteOperationSource | AsyncIterable<VersionedOperation>): () => void {
    this.disposeRemote?.();
    const controller = new AbortController();
    let disposeSource: (() => void) | undefined;
    let disposed = false;
    this.connection = "connecting";
    this.emitState();

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      controller.abort("Sheetwrite remote subscription disposed");
      disposeSource?.();
      if (this.disposeRemote === cleanup) {
        this.disposeRemote = undefined;
        if (!this.destroyed) {
          this.connection = "offline";
          this.emitState();
        }
      }
    };

    try {
      if (isAsyncIterable(source)) {
        void this.consumeRemote(source, controller.signal);
      } else {
        const dispose = source.subscribe(
          (operation) => this.applyVersionedOperation(operation),
          controller.signal,
        );
        disposeSource = typeof dispose === "function" ? dispose : undefined;
      }
      this.disposeRemote = cleanup;
      this.connection = "online";
      this.emitState();
      void this.flush().catch(() => {});
      return cleanup;
    } catch (error) {
      cleanup();
      this.connection = "error";
      this.emitState();
      this.emit({ type: "error", error });
      throw error;
    }
  }

  async flush(): Promise<readonly PersistenceCommitResponse[]> {
    if (this.flushPromise) return this.flushPromise;
    const run = async (): Promise<readonly PersistenceCommitResponse[]> => {
      await this.ready();
      const responses: PersistenceCommitResponse[] = [];
      while (!this.destroyed && this.connection === "online") {
        const response = await this.sendNext();
        if (!response) break;
        responses.push(response);
        if (response.status === "conflict") break;
      }
      return responses;
    };
    const promise = run().finally(() => {
      if (this.flushPromise === promise) this.flushPromise = undefined;
    });
    this.flushPromise = promise;
    return promise;
  }

  async sendNext(): Promise<PersistenceCommitResponse | null> {
    if (this.hydrating) await this.readyPromise;
    if (this.hydrationError !== undefined) throw this.hydrationError;
    const record = this.order.map((id) => this.records.get(id)).find(Boolean);
    if (!record) return null;
    if (record.status === "persisting") {
      await this.persistence.get(record.clientMutationId);
      return this.sendNext();
    }
    const storageError = this.storageErrors.get(record.clientMutationId);
    if (storageError !== undefined) throw storageError;
    return record.status === "pending" ? this.send(record.clientMutationId) : null;
  }

  /** Explicit retry; the original mutation ID and durable record are retained. */
  retry(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    return this.send(clientMutationId);
  }

  async retryPersistence(clientMutationId: string): Promise<boolean> {
    await this.readyPromise;
    const record = this.records.get(clientMutationId);
    if (!record || !this.options.pendingStorage || record.status !== "storage-error") return false;
    await this.persistRecord(record);
    return !this.storageErrors.has(clientMutationId);
  }

  async send(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    if (this.destroyed || this.connection !== "online") return null;
    if (this.hydrating) await this.readyPromise;
    let record = this.records.get(clientMutationId);
    if (record?.status === "persisting") {
      await this.persistence.get(clientMutationId);
      record = this.records.get(clientMutationId);
    }
    const storageError = this.storageErrors.get(clientMutationId);
    if (storageError !== undefined) throw storageError;
    if (!record || record.status === "conflicted" || record.status === "sending") return null;
    record.status = "sending";
    this.emitState();
    this.emit({ type: "sending", mutation: cloneRecord(record) });
    const controller = new AbortController();
    this.activeSends.set(clientMutationId, controller);

    try {
      const response = await this.adapter.commit({
        documentId: record.documentId,
        baseVersion: record.baseVersion,
        clientMutationId: record.clientMutationId,
        operations: record.operations,
        signal: controller.signal,
      });
      await this.handleResponse(response, clientMutationId);
      return response;
    } catch (error) {
      const current = this.records.get(clientMutationId);
      if (current?.status === "sending") current.status = "pending";
      if (!this.destroyed) {
        this.emitState();
        this.emit({ type: "error", error, clientMutationId });
      }
      throw error;
    } finally {
      if (this.activeSends.get(clientMutationId) === controller) {
        this.activeSends.delete(clientMutationId);
      }
    }
  }

  /** Public for transports that deliver responses independently of send promises. */
  async handleResponse(
    response: PersistenceCommitResponse,
    requestedMutationId?: string,
  ): Promise<void> {
    if (this.destroyed) return;
    if (response.status === "conflict") {
      const id = requestedMutationId;
      const record = id ? this.records.get(id) : undefined;
      if (!record) {
        this.emit({
          type: "error",
          error: new Error("Sheetwrite sync conflict did not identify a pending mutation"),
          ...(id ? { clientMutationId: id } : {}),
        });
        return;
      }
      record.status = "conflicted";
      this.version = Math.max(this.version, response.currentVersion);
      this.emitState();
      this.emit({ type: "conflict", mutation: cloneRecord(record), response });
      return;
    }

    const id = response.clientMutationId;
    const record = this.records.get(id);
    if (!record) {
      if (!this.acknowledged.has(id)) {
        this.emit({
          type: "error",
          error: new Error(`Sheetwrite sync response references unknown mutation ${id}`),
          clientMutationId: id,
        });
      }
      return;
    }

    const canonical = response.status === "applied" ? response.canonicalOperations : undefined;
    const operations =
      canonical && canonical.length > 0
        ? canonical
        : response.status === "applied" && this.ambiguousRestores.has(id)
          ? record.operations
          : undefined;
    if (operations && operations.length > 0) {
      const outcome = this.grid.applyRemoteOperations(operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        outcome.status === "noop"
      ) {
        throw new Error(`Sheetwrite sync canonical operations for ${id} were not applied`);
      }
    }
    this.grid.store.acknowledgeOperations?.(record.operations);

    const storage = this.options.pendingStorage;
    if (storage) {
      try {
        await storage.remove(record.documentId, id);
      } catch (error) {
        if (!this.destroyed) {
          this.emitState();
          this.emit({ type: "storage-error", error, clientMutationId: id });
        }
        throw error;
      }
    }

    this.version = Math.max(this.version, response.version);
    this.records.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    this.ambiguousRestores.delete(id);
    this.acknowledged.add(id);
    this.storageErrors.delete(id);
    this.persistence.delete(id);
    if (this.destroyed) return;
    this.emitState();
    this.emit({
      type: "acknowledged",
      clientMutationId: id,
      version: response.version,
      duplicate: response.status === "duplicate",
    });
  }

  applyVersionedOperation(operation: VersionedOperation): void {
    if (this.destroyed) return;
    const mutationId = operation.clientMutationId;
    if (mutationId && this.records.has(mutationId)) {
      void this.handleResponse({
        status: "applied",
        version: operation.version,
        clientMutationId: mutationId,
      }).catch((error: unknown) => {
        if (!this.destroyed) this.emit({ type: "error", error, clientMutationId: mutationId });
      });
      return;
    }
    if (mutationId && this.acknowledged.has(mutationId)) return;
    if (operation.version <= this.version) return;
    if (operation.version !== this.version + 1) {
      this.gapBuffer.set(operation.version, cloneVersionedOperation(operation));
      this.emit({
        type: "reload-required",
        expectedVersion: this.version + 1,
        receivedVersion: operation.version,
      });
      this.requestGapRecovery(operation.version);
      return;
    }

    const outcome = this.grid.applyRemoteOperations(operation.operations);
    if (outcome.status === "conflict" || outcome.status === "rejected") {
      this.emit({
        type: "error",
        error: new Error(`Remote operation ${operation.version} was rejected by the grid`),
      });
      return;
    }
    this.version = operation.version;
    this.emitState();
    this.emit({ type: "remote-applied", operation: cloneVersionedOperation(operation) });
    this.drainGapBuffer();
  }

  /**
   * Resume only after the host remounted/reloaded document state and reapplied
   * retained local operations. No lossy structural merge is attempted here.
   */
  resumeAfterReload(snapshot: WorkbookSnapshot): void {
    if (this.destroyed) return;
    this.version = snapshot.version ?? 0;
    this.gapBuffer.clear();
    let baseVersion = this.version;
    for (const id of this.order) {
      const record = this.records.get(id);
      if (!record) continue;
      record.baseVersion = baseVersion;
      record.status = this.options.pendingStorage ? "persisting" : "pending";
      baseVersion += 1;
      if (this.options.pendingStorage) {
        const pending = this.persistRecord(record);
        this.persistence.set(id, pending);
      }
    }
    this.emitState();
    this.emit({
      type: "reloaded",
      serverVersion: this.version,
      pending: this.pendingCommits(),
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disposeGrid();
    this.disposeRemote?.();
    this.disposeRemote = undefined;
    this.abortController.abort("Sheetwrite sync coordinator destroyed");
    for (const controller of this.activeSends.values()) {
      controller.abort("Sheetwrite sync coordinator destroyed");
    }
    this.activeSends.clear();
    this.connection = "destroyed";
    this.emitState();
    this.listeners.clear();
  }

  private enqueue(operations: readonly DocumentOp[]): void {
    const clientMutationId =
      this.options.createMutationId?.() ?? `sheetwrite-${Date.now()}-${nextMutation++}`;
    if (this.records.has(clientMutationId) || this.acknowledged.has(clientMutationId)) {
      this.emit({
        type: "error",
        error: new Error(`Duplicate client mutation ID: ${clientMutationId}`),
        clientMutationId,
      });
      return;
    }
    const record: SyncMutationRecord = {
      documentId: this.options.documentId,
      baseVersion: this.version + this.records.size,
      clientMutationId,
      operations: immutableOperations(operations),
      status: this.options.pendingStorage ? "persisting" : "pending",
    };
    this.records.set(clientMutationId, record);
    this.order.push(clientMutationId);

    if (this.options.pendingStorage) {
      this.emitState();
      this.emit({ type: "persisting", mutation: cloneRecord(record) });
      const pending = this.readyPromise.then(() => this.persistRecord(record));
      this.persistence.set(clientMutationId, pending);
    } else {
      this.emitState();
      this.emit({ type: "pending", mutation: cloneRecord(record) });
    }
  }

  private async restorePending(): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage) return;
    const loaded = await storage.load(this.options.documentId, this.abortController.signal);
    const localOrder = this.order.slice();
    const restoredOrder: string[] = [];
    let nextBase = this.version;
    let firstAmbiguousBase: number | undefined;
    let ambiguousSequence = false;

    for (const pending of loaded) {
      assertPendingCommit(pending, this.options.documentId);
      if (this.records.has(pending.clientMutationId)) {
        throw new Error(`Durable queue contains duplicate mutation ID ${pending.clientMutationId}`);
      }
      const record: SyncMutationRecord = {
        ...clonePendingCommit(pending),
        status: "pending",
      };
      this.records.set(record.clientMutationId, record);
      restoredOrder.push(record.clientMutationId);
      nextBase = Math.max(nextBase, record.baseVersion + 1);

      if (ambiguousSequence || record.baseVersion < this.version) {
        ambiguousSequence = true;
        this.ambiguousRestores.add(record.clientMutationId);
        firstAmbiguousBase ??= record.baseVersion;
        continue;
      }
      const outcome = this.grid.applyRemoteOperations(record.operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        (outcome.status === "noop" && record.operations.length > 0)
      ) {
        throw new Error(`Durable mutation ${record.clientMutationId} could not be restored`);
      }
    }

    this.order.splice(0, this.order.length, ...restoredOrder, ...localOrder);
    for (const id of localOrder) {
      const record = this.records.get(id);
      if (!record) continue;
      record.baseVersion = nextBase;
      nextBase += 1;
    }
    this.hydrating = false;
    this.emitState();
    this.emit({ type: "restored", pending: this.pendingCommits() });
    if (firstAmbiguousBase !== undefined && this.connection !== "online") {
      this.emit({
        type: "reload-required",
        expectedVersion: firstAmbiguousBase + 1,
        receivedVersion: this.version,
      });
    }
  }

  private async persistRecord(record: SyncMutationRecord): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage || this.destroyed) return;
    record.status = "persisting";
    this.storageErrors.delete(record.clientMutationId);
    try {
      await storage.put(clonePendingCommit(record), this.abortController.signal);
      if (this.destroyed || !this.records.has(record.clientMutationId)) return;
      record.status = "pending";
      this.emitState();
      this.emit({ type: "pending", mutation: cloneRecord(record) });
    } catch (error) {
      if (this.destroyed) return;
      record.status = "storage-error";
      this.storageErrors.set(record.clientMutationId, error);
      this.emitState();
      this.emit({ type: "storage-error", error, clientMutationId: record.clientMutationId });
    }
  }

  private requestGapRecovery(receivedVersion: number): void {
    const recover = this.options.recoverVersionGap;
    if (!recover || this.recoveryPromise || this.destroyed) return;
    const expectedVersion = this.version + 1;
    this.recoveryPromise = recover({
      documentId: this.options.documentId,
      expectedVersion,
      receivedVersion,
      signal: this.abortController.signal,
    })
      .then((recovery) => {
        if (this.destroyed) return;
        if (Array.isArray(recovery)) {
          const ordered = recovery.slice().sort((a, b) => a.version - b.version);
          for (const operation of ordered) this.applyVersionedOperation(operation);
          this.drainGapBuffer();
          return;
        }
        const snapshot = recovery as WorkbookSnapshot;
        this.emit({
          type: "reload-required",
          expectedVersion: this.version + 1,
          receivedVersion,
          snapshot: cloneJsonValue(snapshot),
        });
      })
      .catch((error: unknown) => {
        if (this.destroyed) return;
        this.connection = "error";
        this.emitState();
        this.emit({ type: "error", error });
      })
      .finally(() => {
        this.recoveryPromise = undefined;
      });
  }

  private drainGapBuffer(): void {
    let next = this.gapBuffer.get(this.version + 1);
    while (next) {
      this.gapBuffer.delete(next.version);
      this.applyVersionedOperation(next);
      next = this.gapBuffer.get(this.version + 1);
    }
  }

  private async consumeRemote(
    source: AsyncIterable<VersionedOperation>,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      for await (const operation of source) {
        if (signal.aborted || this.destroyed) break;
        this.applyVersionedOperation(operation);
      }
    } catch (error) {
      if (signal.aborted || this.destroyed) return;
      this.connection = "error";
      this.emitState();
      this.emit({ type: "error", error });
    }
  }

  private activity(): SyncActivityState {
    if (this.destroyed) return "destroyed";
    if (this.hydrating) return "hydrating";
    if (this.hydrationError !== undefined || this.storageErrors.size > 0) return "error";
    let pending = false;
    for (const record of this.records.values()) {
      if (record.status === "conflicted") return "conflict";
      if (record.status === "sending") return "sending";
      if (record.status === "persisting") return "persisting";
      if (record.status === "pending") pending = true;
    }
    return pending ? "pending" : "idle";
  }

  private emitState(): void {
    this.emit({ type: "state", state: this.state });
  }

  private emit(event: SyncCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function assertPendingCommit(commit: PendingCommit, documentId: string): void {
  if (
    !commit ||
    commit.documentId !== documentId ||
    !Number.isInteger(commit.baseVersion) ||
    commit.baseVersion < 0 ||
    typeof commit.clientMutationId !== "string" ||
    commit.clientMutationId.length === 0 ||
    !Array.isArray(commit.operations)
  ) {
    throw new Error("Durable queue returned an invalid pending commit");
  }
}

function clonePendingCommit(commit: PendingCommit): PendingCommit {
  return {
    documentId: commit.documentId,
    baseVersion: commit.baseVersion,
    clientMutationId: commit.clientMutationId,
    operations: cloneJsonValue(commit.operations),
  };
}

function isAsyncIterable(
  source: RemoteOperationSource | AsyncIterable<VersionedOperation>,
): source is AsyncIterable<VersionedOperation> {
  return Symbol.asyncIterator in source;
}

function immutableOperations(operations: readonly DocumentOp[]): readonly DocumentOp[] {
  return deepFreeze(cloneJsonValue(operations));
}

function cloneRecord(record: SyncMutationRecord): SyncMutationRecord {
  return {
    documentId: record.documentId,
    baseVersion: record.baseVersion,
    clientMutationId: record.clientMutationId,
    operations: cloneJsonValue(record.operations),
    status: record.status,
  };
}

function cloneVersionedOperation(operation: VersionedOperation): VersionedOperation {
  return {
    version: operation.version,
    operations: cloneJsonValue(operation.operations),
    ...(operation.clientMutationId ? { clientMutationId: operation.clientMutationId } : {}),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
