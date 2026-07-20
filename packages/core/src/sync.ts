import {
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  validateDocumentOperationShape,
  validateWorkbookSnapshot,
} from "./document-protocol.js";
import { boundedJsonByteLength, JsonByteLengthError } from "./json-byte-length.js";
import {
  type GridTransactionAdmissionDecision,
  registerGridTransactionAdmission,
} from "./transaction-admission.js";
import type { DocumentOp, MutationIssue, WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type {
  PendingCommit,
  PersistenceAdapter,
  PersistenceCommitResponse,
  RemoteOperationSource,
  SyncMutationRecord,
  VersionedOperation,
} from "./types/transaction.js";

/** Mandatory bounds for one durable pending-commit restore. */
export interface PendingCommitLoadOptions {
  signal?: AbortSignal;
  /** Maximum records returned for one document queue. */
  maxRecords: number;
  /** Maximum aggregate operation count returned for one document queue. */
  maxOperations: number;
  /** Maximum aggregate UTF-8 bytes of the JSON-encoded operation arrays. */
  maxBytes: number;
}

/** Host-owned durable queue. Browser storage lives in the optional `./browser` entrypoint. */
export interface PendingCommitStorage {
  load(documentId: string, options: PendingCommitLoadOptions): Promise<readonly PendingCommit[]>;
  put(commit: PendingCommit, signal?: AbortSignal): Promise<void>;
  remove(documentId: string, clientMutationId: string, signal?: AbortSignal): Promise<void>;
  /**
   * Atomically replaces one document queue only if its ordered IDs still match
   * the caller's expected view.
   */
  replace(
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ): Promise<void>;
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
/** Whether the durable local queue can currently admit another transaction. */
export type SyncPendingCapacityState =
  | "hydrating"
  | "available"
  | "full"
  | "restore-error"
  | "destroyed";

/** Immutable observable synchronization state. */
export interface SyncStateSnapshot {
  connection: SyncConnectionState;
  activity: SyncActivityState;
  /** Pending local commits, including synchronous pre-commit reservations. */
  pendingCount: number;
  /** Aggregate DocumentOp count, including synchronous pre-commit reservations. */
  pendingOperations: number;
  /** Aggregate UTF-8 bytes of pending JSON-encoded operation arrays. */
  pendingEncodedBytes: number;
  /** Current local transaction admission state. */
  pendingCapacity: SyncPendingCapacityState;
  /** Last accepted contiguous remote server version. */
  serverVersion: number;
}

/** Contiguous-version recovery request produced when remote input skips ahead. */
export interface SyncVersionGapRequest {
  documentId: string;
  expectedVersion: number;
  receivedVersion: number;
  signal: AbortSignal;
}

/** Aggregate ceilings for local commits retained until durable acknowledgement. */
export interface SyncPendingQueueLimits {
  /** Maximum number of pending local commits, including synchronous reservations. */
  maxPendingCommits: number;
  /** Maximum aggregate DocumentOp count across pending local commits. */
  maxPendingOperations: number;
  /** Maximum aggregate UTF-8 bytes across JSON-encoded pending operation arrays. */
  maxPendingEncodedBytes: number;
}

/** Resource ceilings applied independently to remote collaboration input and local durability. */
export interface SyncCoordinatorLimits extends SyncPendingQueueLimits {
  /** Maximum UTF-8 bytes in a remote or pending client mutation ID. */
  maxMutationIdBytes: number;
  /** Maximum operations accepted in one hostile remote version. */
  maxOperationsPerVersion: number;
  /** Maximum encoded operation bytes accepted in one hostile remote version. */
  maxVersionPayloadBytes: number;
  /** Maximum allowed version distance ahead of the contiguous remote head. */
  maxFutureVersionDistance: number;
  /** Maximum remote future versions retained in the gap buffer. */
  maxBufferedVersions: number;
  /** Maximum aggregate operations retained in the remote gap buffer. */
  maxBufferedOperations: number;
  /** Maximum aggregate encoded bytes retained in the remote gap buffer. */
  maxBufferedBytes: number;
  /**
   * Recently acknowledged mutation IDs retained for echo deduplication. Once
   * an ID expires, a stale operation carrying it is treated as a protocol
   * violation that requires reload; its operations are never reapplied.
   */
  maxRecentAcknowledgements: number;
}

/** Conservative synchronization limits suitable for untrusted collaboration input and offline work. */
export const DEFAULT_SYNC_COORDINATOR_LIMITS: Readonly<SyncCoordinatorLimits> = Object.freeze({
  maxMutationIdBytes: 256,
  maxOperationsPerVersion: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations,
  maxVersionPayloadBytes: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes,
  maxFutureVersionDistance: 1_024,
  maxBufferedVersions: 256,
  maxBufferedOperations: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxOperations * 4,
  maxBufferedBytes: DEFAULT_TRANSACTION_RESOURCE_LIMITS.maxEncodedBytes * 4,
  maxRecentAcknowledgements: 4_096,
  maxPendingCommits: 10_000,
  maxPendingOperations: 100_000,
  maxPendingEncodedBytes: 128 * 1024 * 1024,
});

/** Stable category identifying which synchronization protocol bound was violated. */
export type SyncProtocolErrorCode =
  | "invalid-limits"
  | "invalid-version"
  | "invalid-id"
  | "invalid-operations"
  | "operation-limit"
  | "payload-limit"
  | "response-id-mismatch"
  | "future-distance-limit"
  | "buffer-count-limit"
  | "buffer-operation-limit"
  | "buffer-byte-limit"
  | "pending-count-limit"
  | "pending-operation-limit"
  | "pending-byte-limit"
  | "late-echo"
  | "remote-operations-rejected";

/** Typed rejection of malformed or resource-exhausting synchronization input. */
export class SyncProtocolError extends Error {
  override readonly name = "SyncProtocolError";

  constructor(
    readonly code: SyncProtocolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Typed local transaction rejection produced when the durable queue cannot reserve capacity. */
export class SyncPendingCapacityError extends RangeError {
  override readonly name = "SyncPendingCapacityError";
  readonly code = "pending-capacity";

  constructor(readonly issue: Extract<MutationIssue, { kind: "resource-limit" }>) {
    super(issue.message);
  }
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
  /** Overrides remote collaboration and durable local pending-queue ceilings. */
  limits?: Partial<SyncCoordinatorLimits>;
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
  private readonly recordBytes = new Map<string, number>();
  private readonly localReservations: LocalPendingReservation[] = [];
  private readonly order: string[] = [];
  private readonly acknowledged = new Set<string>();
  private readonly acknowledgementOrder: string[] = [];
  private readonly listeners = new Set<SyncListener>();
  private readonly abortController = new AbortController();
  private readonly activeSends = new Map<string, AbortController>();
  private readonly persistence = new Map<string, Promise<void>>();
  private readonly storageErrors = new Map<string, unknown>();
  private readonly ambiguousRestores = new Set<string>();
  private readonly gapBuffer = new Map<number, BufferedVersionedOperation>();
  private readonly limits: Readonly<SyncCoordinatorLimits>;
  private readonly disposeGrid: () => void;
  private readonly readyPromise: Promise<void>;
  private disposeRemote?: () => void;
  private destroyed = false;
  private hydrating: boolean;
  private hydrationError: unknown;
  private recoveryPromise?: Promise<void>;
  private inboundTail: Promise<void> = Promise.resolve();
  private persistenceTail: Promise<void> = Promise.resolve();
  private flushPromise?: Promise<readonly PersistenceCommitResponse[]>;
  private connection: SyncConnectionState;
  private version: number;
  private bufferedVersions = 0;
  private bufferedOperations = 0;
  private bufferedBytes = 0;
  private pendingCommitTotal = 0;
  private pendingOperationTotal = 0;
  private pendingEncodedByteTotal = 0;

  constructor(
    private readonly grid: Grid,
    private readonly adapter: PersistenceAdapter,
    private readonly options: SyncCoordinatorOptions,
  ) {
    this.limits = resolveLimits(options.limits);
    assertDocumentId(options.documentId);
    assertVersion(options.serverVersion, "serverVersion");
    this.version = options.serverVersion;
    this.connection = options.initialConnection ?? "online";
    this.hydrating = options.pendingStorage !== undefined;
    this.disposeGrid = registerGridTransactionAdmission(grid, {
      reserve: (operations) => this.reserveLocalTransaction(operations),
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
    return this.pendingCommitTotal;
  }

  get state(): SyncStateSnapshot {
    return {
      connection: this.destroyed ? "destroyed" : this.connection,
      activity: this.activity(),
      pendingCount: this.pendingCommitTotal,
      pendingOperations: this.pendingOperationTotal,
      pendingEncodedBytes: this.pendingEncodedByteTotal,
      pendingCapacity: this.pendingCapacity(),
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
        const dispose = source.subscribe((operation) => {
          const intake = this.applyVersionedOperation(operation);
          void intake.catch((error: unknown) =>
            this.handleRemoteIntakeError(error, controller.signal),
          );
          return intake;
        }, controller.signal);
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
    await this.schedulePersistence(record);
    return !this.storageErrors.has(clientMutationId);
  }

  async send(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    if (this.destroyed || this.connection !== "online") return null;
    if (this.hydrating) await this.readyPromise;
    const head = this.order.find((id) => this.records.has(id));
    if (head !== clientMutationId) return null;
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
  handleResponse(response: PersistenceCommitResponse, requestedMutationId?: string): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.enqueueInbound(async () => {
      const previousVersion = this.version;
      await this.processResponse(response, requestedMutationId);
      if (response.status !== "conflict" && this.version > previousVersion) {
        await this.drainGapBuffer();
      }
    });
  }

  private async processResponse(
    response: PersistenceCommitResponse,
    requestedMutationId?: string,
  ): Promise<void> {
    if (this.destroyed) return;
    assertPersistenceResponse(response, this.limits);
    if (requestedMutationId !== undefined) {
      assertMutationId(requestedMutationId, this.limits);
    }
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
      assertConflictRecovery(response, record.baseVersion);
      record.status = "conflicted";
      this.version = Math.max(this.version, response.currentVersion);
      this.emitState();
      this.emit({ type: "conflict", mutation: cloneRecord(record), response });
      return;
    }
    if (requestedMutationId !== undefined && response.clientMutationId !== requestedMutationId) {
      throw new SyncProtocolError(
        "response-id-mismatch",
        `Persistence response for ${response.clientMutationId} does not match requested mutation ${requestedMutationId}`,
      );
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

    const operations =
      response.status === "applied" && this.ambiguousRestores.has(id)
        ? record.operations
        : undefined;
    if (operations && operations.length > 0) {
      assertOperations(operations, this.limits);
      const outcome = this.grid.applyRemoteOperations(operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        outcome.status === "noop"
      ) {
        const error = new SyncProtocolError(
          "remote-operations-rejected",
          `Sheetwrite sync canonical operations for ${id} were not applied`,
        );
        this.rejectInbound(error, response.version);
        throw error;
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
    if (this.records.get(id) !== record) return;

    if (!this.destroyed) this.version = Math.max(this.version, response.version);
    const encodedBytes = this.recordBytes.get(id);
    if (encodedBytes === undefined) {
      throw new Error(`Pending mutation ${id} is missing resource accounting`);
    }
    this.pendingCommitTotal -= 1;
    this.pendingOperationTotal -= record.operations.length;
    this.pendingEncodedByteTotal -= encodedBytes;
    this.recordBytes.delete(id);
    this.records.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    this.ambiguousRestores.delete(id);
    this.storageErrors.delete(id);
    this.persistence.delete(id);
    if (this.destroyed) return;
    this.retainAcknowledgement(id);
    this.emitState();
    this.emit({
      type: "acknowledged",
      clientMutationId: id,
      version: response.version,
      duplicate: response.status === "duplicate",
    });
  }

  applyVersionedOperation(operation: VersionedOperation): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    let inspected: InspectedVersionedOperation;
    try {
      inspected = inspectVersionedOperation(operation, this.limits);
    } catch (error) {
      this.rejectInbound(
        asSyncProtocolError(error),
        validReceivedVersion((operation as { version?: unknown } | null)?.version),
      );
      return Promise.resolve();
    }
    if (
      inspected.version > this.version &&
      inspected.version - this.version > this.limits.maxFutureVersionDistance
    ) {
      this.clearGapBuffer();
      this.rejectInbound(
        new SyncProtocolError(
          "future-distance-limit",
          `Remote version ${inspected.version} exceeds the future-version distance limit`,
        ),
        inspected.version,
      );
      return Promise.resolve();
    }
    const preflightError = this.inboundLimitError(inspected.operations.length, inspected.bytes);
    if (preflightError) {
      this.clearGapBuffer();
      this.rejectInbound(preflightError, inspected.version);
      return Promise.resolve();
    }
    let validated: BufferedVersionedOperation;
    try {
      validated = {
        operation: {
          version: inspected.version,
          operations: cloneJsonValue(inspected.operations),
          ...(inspected.clientMutationId !== undefined
            ? { clientMutationId: inspected.clientMutationId }
            : {}),
        },
        bytes: inspected.bytes,
      };
    } catch (error) {
      this.rejectInbound(asSyncProtocolError(error), inspected.version);
      return Promise.resolve();
    }
    const reservationError = this.reserveInbound(validated);
    if (reservationError) {
      this.clearGapBuffer();
      this.rejectInbound(reservationError, inspected.version);
      return Promise.resolve();
    }
    return this.enqueueInbound(() => this.processVersionedOperation(validated)).finally(() => {
      if (!validated.retained) this.releaseBuffered(validated);
    });
  }

  /**
   * Resume only after the host remounted/reloaded document state and reapplied
   * retained local operations. No lossy structural merge is attempted here.
   */
  async resumeAfterReload(snapshot: WorkbookSnapshot): Promise<void> {
    if (this.destroyed) return;
    const version = snapshot.version ?? 0;
    assertVersion(version, "snapshot.version");
    const records = this.order
      .map((id) => this.records.get(id))
      .filter((record): record is SyncMutationRecord => record !== undefined);
    let baseVersion = version;
    const replacements = records.map((record) => {
      const replacement: PendingCommit = {
        documentId: record.documentId,
        baseVersion,
        clientMutationId: record.clientMutationId,
        operations: record.operations,
      };
      baseVersion = incrementVersion(baseVersion);
      return replacement;
    });
    if (this.options.pendingStorage) {
      try {
        await this.scheduleQueueReplacement(
          records.map((record) => record.clientMutationId),
          replacements,
        );
      } catch (error) {
        if (!this.destroyed) this.emit({ type: "storage-error", error });
        throw error;
      }
    }
    if (this.destroyed) return;
    this.version = version;
    this.clearGapBuffer();
    for (let index = 0; index < records.length; index++) {
      records[index]!.baseVersion = replacements[index]!.baseVersion;
      records[index]!.status = "pending";
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
    this.clearGapBuffer();
    this.records.clear();
    this.recordBytes.clear();
    this.order.length = 0;
    this.localReservations.length = 0;
    this.pendingCommitTotal = 0;
    this.pendingOperationTotal = 0;
    this.pendingEncodedByteTotal = 0;
    this.acknowledged.clear();
    this.acknowledgementOrder.length = 0;
    this.connection = "destroyed";
    this.emitState();
    this.listeners.clear();
  }

  private reserveLocalTransaction(
    operations: readonly DocumentOp[],
  ): GridTransactionAdmissionDecision {
    if (this.destroyed || this.hydrating || this.hydrationError !== undefined) {
      const reason = this.destroyed
        ? "destroyed"
        : this.hydrating
          ? "restoring durable records"
          : "unavailable after a restore failure";
      return this.rejectPendingCapacity(
        "pending-commits",
        this.limits.maxPendingCommits + 1,
        this.limits.maxPendingCommits,
        `The pending sync queue is ${reason}`,
      );
    }
    if (this.pendingCommitTotal + 1 > this.limits.maxPendingCommits) {
      return this.rejectPendingCapacity(
        "pending-commits",
        this.pendingCommitTotal + 1,
        this.limits.maxPendingCommits,
        `Pending sync commits exceed the ${this.limits.maxPendingCommits} commit limit`,
      );
    }
    const operationTotal = this.pendingOperationTotal + operations.length;
    if (operationTotal > this.limits.maxPendingOperations) {
      return this.rejectPendingCapacity(
        "pending-operations",
        operationTotal,
        this.limits.maxPendingOperations,
        `Pending sync operations exceed the ${this.limits.maxPendingOperations} operation limit`,
      );
    }

    let encodedBytes: number;
    try {
      encodedBytes = boundedJsonByteLength(
        operations,
        this.limits.maxPendingEncodedBytes - this.pendingEncodedByteTotal,
      );
    } catch (error) {
      if (error instanceof JsonByteLengthError && error.code === "limit") {
        return this.rejectPendingCapacity(
          "pending-encoded-bytes",
          this.pendingEncodedByteTotal +
            (error.actual ?? this.limits.maxPendingEncodedBytes - this.pendingEncodedByteTotal + 1),
          this.limits.maxPendingEncodedBytes,
          `Pending sync operations exceed the ${this.limits.maxPendingEncodedBytes} encoded-byte limit`,
        );
      }
      throw error;
    }

    assertVersion(this.version + this.pendingCommitTotal, "pending baseVersion");
    const reservation: LocalPendingReservation = {
      status: "reserved",
      clientMutationId: "",
      operations: immutableOperations(operations),
      operationCount: operations.length,
      encodedBytes,
    };
    this.localReservations.push(reservation);
    this.pendingCommitTotal += 1;
    this.pendingOperationTotal += reservation.operationCount;
    this.pendingEncodedByteTotal += encodedBytes;

    try {
      const clientMutationId =
        this.options.createMutationId?.() ?? `sheetwrite-${Date.now()}-${nextMutation++}`;
      assertMutationId(clientMutationId, this.limits);
      if (
        this.records.has(clientMutationId) ||
        this.acknowledged.has(clientMutationId) ||
        this.localReservations.some(
          (candidate) =>
            candidate !== reservation && candidate.clientMutationId === clientMutationId,
        )
      ) {
        throw new Error(`Duplicate client mutation ID: ${clientMutationId}`);
      }
      reservation.clientMutationId = clientMutationId;
    } catch (error) {
      reservation.status = "cancelled";
      this.drainLocalReservations();
      this.emit({ type: "error", error });
      throw error;
    }

    return {
      ok: true,
      reservation: {
        cancel: () => {
          if (reservation.status !== "reserved") return;
          reservation.status = "cancelled";
          this.drainLocalReservations();
        },
        finish: (outcome) => {
          if (reservation.status !== "reserved") return;
          if (outcome.status !== "applied") {
            reservation.status = "cancelled";
          } else {
            reservation.status = "applied";
            reservation.appliedOperations = immutableOperations(outcome.transaction.patches);
            reservation.appliedEncodedBytes = boundedJsonByteLength(
              reservation.appliedOperations,
              this.limits.maxPendingEncodedBytes,
            );
          }
          this.drainLocalReservations();
        },
      },
    };
  }

  private drainLocalReservations(): void {
    while (this.localReservations[0]?.status !== "reserved") {
      const reservation = this.localReservations.shift();
      if (!reservation) return;
      if (reservation.status === "cancelled") {
        this.pendingCommitTotal -= 1;
        this.pendingOperationTotal -= reservation.operationCount;
        this.pendingEncodedByteTotal -= reservation.encodedBytes;
        if (!this.destroyed) this.emitState();
        continue;
      }
      const operations = reservation.appliedOperations!;
      const encodedBytes = reservation.appliedEncodedBytes!;
      this.pendingOperationTotal += operations.length - reservation.operationCount;
      this.pendingEncodedByteTotal += encodedBytes - reservation.encodedBytes;
      const record: SyncMutationRecord = {
        documentId: this.options.documentId,
        baseVersion: this.version + this.records.size,
        clientMutationId: reservation.clientMutationId,
        operations,
        status: this.options.pendingStorage ? "persisting" : "pending",
      };
      this.records.set(record.clientMutationId, record);
      this.recordBytes.set(record.clientMutationId, encodedBytes);
      this.order.push(record.clientMutationId);

      if (this.options.pendingStorage) {
        this.emitState();
        this.emit({ type: "persisting", mutation: cloneRecord(record) });
        const pending = this.schedulePersistence(record);
        this.persistence.set(record.clientMutationId, pending);
      } else {
        this.emitState();
        this.emit({ type: "pending", mutation: cloneRecord(record) });
      }
    }
  }

  private rejectPendingCapacity(
    resource: Extract<MutationIssue, { kind: "resource-limit" }>["resource"],
    actual: number,
    max: number,
    message: string,
  ): GridTransactionAdmissionDecision {
    const issue: Extract<MutationIssue, { kind: "resource-limit" }> = {
      kind: "resource-limit",
      severity: "error",
      resource,
      actual,
      max,
      message,
    };
    this.emitState();
    this.emit({ type: "error", error: new SyncPendingCapacityError(issue) });
    return { ok: false, issue };
  }

  private async restorePending(): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage) return;
    const loaded = await storage.load(this.options.documentId, {
      signal: this.abortController.signal,
      maxRecords: this.limits.maxPendingCommits,
      maxOperations: this.limits.maxPendingOperations,
      maxBytes: this.limits.maxPendingEncodedBytes,
    });
    if (this.destroyed) return;
    if (!Array.isArray(loaded)) {
      throw new SyncProtocolError("invalid-operations", "Durable queue did not return an array");
    }
    if (loaded.length > this.limits.maxPendingCommits) {
      throw new SyncProtocolError(
        "pending-count-limit",
        "Durable queue record count exceeds the pending commit limit",
      );
    }

    const restoredBytesByIndex: number[] = [];
    const mutationIds = new Set<string>();
    let restoredOperations = 0;
    let restoredBytes = 0;
    for (const pending of loaded) {
      const bytes = assertPendingCommit(pending, this.options.documentId, this.limits);
      restoredBytesByIndex.push(bytes);
      restoredOperations += pending.operations.length;
      restoredBytes += bytes;
      if (restoredOperations > this.limits.maxPendingOperations) {
        throw new SyncProtocolError(
          "pending-operation-limit",
          "Durable queue operations exceed the aggregate pending limit",
        );
      }
      if (restoredBytes > this.limits.maxPendingEncodedBytes) {
        throw new SyncProtocolError(
          "pending-byte-limit",
          "Durable queue bytes exceed the aggregate pending limit",
        );
      }
      if (mutationIds.has(pending.clientMutationId)) {
        throw new SyncProtocolError(
          "invalid-id",
          `Durable queue contains duplicate mutation ID ${pending.clientMutationId}`,
        );
      }
      mutationIds.add(pending.clientMutationId);
    }

    const prepared = loaded.map((pending, index) => ({
      record: {
        ...clonePendingCommit(pending),
        status: "pending" as const,
      },
      bytes: restoredBytesByIndex[index]!,
    }));
    let firstAmbiguousBase: number | undefined;
    let ambiguousSequence = false;
    const ambiguousIds = new Set<string>();
    for (const { record } of prepared) {
      incrementVersion(record.baseVersion);
      if (ambiguousSequence || record.baseVersion < this.version) {
        ambiguousSequence = true;
        ambiguousIds.add(record.clientMutationId);
        firstAmbiguousBase ??= record.baseVersion;
      }
    }

    for (const { record } of prepared) {
      if (ambiguousIds.has(record.clientMutationId)) continue;
      const outcome = this.grid.applyRemoteOperations(record.operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        (outcome.status === "noop" && record.operations.length > 0)
      ) {
        throw new Error(`Durable mutation ${record.clientMutationId} could not be restored`);
      }
    }
    if (this.destroyed) return;

    for (const { record, bytes } of prepared) {
      this.records.set(record.clientMutationId, record);
      this.recordBytes.set(record.clientMutationId, bytes);
      this.order.push(record.clientMutationId);
      if (ambiguousIds.has(record.clientMutationId)) {
        this.ambiguousRestores.add(record.clientMutationId);
      }
    }
    this.pendingCommitTotal = prepared.length;
    this.pendingOperationTotal = restoredOperations;
    this.pendingEncodedByteTotal = restoredBytes;
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

  private schedulePersistence(record: SyncMutationRecord, waitUntilReady = false): Promise<void> {
    const scheduled = this.persistenceTail.then(async () => {
      if (waitUntilReady) await this.readyPromise;
      await this.persistRecord(record);
    });
    this.persistenceTail = scheduled.catch(() => {});
    return scheduled;
  }

  private scheduleQueueReplacement(
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
  ): Promise<void> {
    const storage = this.options.pendingStorage;
    if (!storage) return Promise.resolve();
    const scheduled = this.persistenceTail.then(() =>
      storage.replace(
        this.options.documentId,
        expectedClientMutationIds,
        commits.map(clonePendingCommit),
        this.abortController.signal,
      ),
    );
    this.persistenceTail = scheduled.catch(() => {});
    return scheduled;
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

  private enqueueInbound(task: () => void | Promise<void>): Promise<void> {
    const queued = this.inboundTail.then(async () => {
      if (!this.destroyed) await task();
    });
    this.inboundTail = queued.catch(() => {});
    return queued;
  }

  private async processVersionedOperation(input: BufferedVersionedOperation): Promise<void> {
    const { operation } = input;
    const mutationId = operation.clientMutationId;
    if (operation.version <= this.version) {
      if (mutationId && this.records.has(mutationId)) {
        await this.processResponse({
          status: "applied",
          version: operation.version,
          clientMutationId: mutationId,
        });
      } else if (mutationId && !this.acknowledged.has(mutationId)) {
        this.rejectInbound(
          new SyncProtocolError(
            "late-echo",
            `Remote mutation ${mutationId} is older than the retained acknowledgement window`,
          ),
          operation.version,
          false,
        );
      }
      return;
    }

    if (mutationId && this.acknowledged.has(mutationId)) {
      this.rejectInbound(
        new SyncProtocolError(
          "late-echo",
          `Acknowledged mutation ${mutationId} arrived at an unexpected future version`,
        ),
        operation.version,
        false,
      );
      return;
    }

    const expectedVersion = incrementVersion(this.version);
    if (operation.version !== expectedVersion) {
      const distance = operation.version - this.version;
      if (distance > this.limits.maxFutureVersionDistance) {
        this.clearGapBuffer();
        this.rejectInbound(
          new SyncProtocolError(
            "future-distance-limit",
            `Remote version ${operation.version} exceeds the future-version distance limit`,
          ),
          operation.version,
        );
        return;
      }
      if (!this.gapBuffer.has(operation.version)) {
        input.retained = true;
        this.gapBuffer.set(operation.version, input);
      }
      this.emitReloadRequired(operation.version);
      this.requestGapRecovery(operation.version);
      return;
    }

    if (await this.applyContiguousOperation(operation)) {
      await this.drainGapBuffer();
    }
  }

  private async applyContiguousOperation(operation: VersionedOperation): Promise<boolean> {
    const mutationId = operation.clientMutationId;
    if (mutationId && this.records.has(mutationId)) {
      await this.processResponse({
        status: "applied",
        version: operation.version,
        clientMutationId: mutationId,
      });
      return this.version >= operation.version;
    }

    if (operation.operations.length > 0) {
      const outcome = this.grid.applyRemoteOperations(operation.operations);
      if (
        outcome.status === "conflict" ||
        outcome.status === "rejected" ||
        outcome.status === "noop"
      ) {
        this.rejectInbound(
          new SyncProtocolError(
            "remote-operations-rejected",
            `Remote operation ${operation.version} was not applied by the grid`,
          ),
          operation.version,
        );
        return false;
      }
    }

    this.version = operation.version;
    this.emitState();
    this.emit({ type: "remote-applied", operation: cloneVersionedOperation(operation) });
    return true;
  }

  private inboundLimitError(operationCount: number, bytes: number): SyncProtocolError | undefined {
    if (this.bufferedVersions >= this.limits.maxBufferedVersions) {
      return new SyncProtocolError("buffer-count-limit", "Inbound version count limit exceeded");
    }
    if (this.bufferedOperations + operationCount > this.limits.maxBufferedOperations) {
      return new SyncProtocolError(
        "buffer-operation-limit",
        "Inbound operation count limit exceeded",
      );
    }
    if (this.bufferedBytes + bytes > this.limits.maxBufferedBytes) {
      return new SyncProtocolError("buffer-byte-limit", "Inbound byte limit exceeded");
    }
    return undefined;
  }

  private reserveInbound(input: BufferedVersionedOperation): SyncProtocolError | undefined {
    const error = this.inboundLimitError(input.operation.operations.length, input.bytes);
    if (error) return error;
    this.bufferedVersions += 1;
    this.bufferedOperations += input.operation.operations.length;
    this.bufferedBytes += input.bytes;
    return undefined;
  }

  private releaseBuffered(input: BufferedVersionedOperation): void {
    input.retained = false;
    this.bufferedVersions -= 1;
    this.bufferedOperations -= input.operation.operations.length;
    this.bufferedBytes -= input.bytes;
  }

  private emitReloadRequired(receivedVersion: number): void {
    this.emit({
      type: "reload-required",
      expectedVersion: incrementVersion(this.version),
      receivedVersion,
    });
  }

  private rejectInbound(error: SyncProtocolError, receivedVersion?: number, recover = true): void {
    if (this.destroyed) return;
    this.emit({ type: "error", error });
    if (receivedVersion === undefined) return;
    this.emitReloadRequired(receivedVersion);
    if (recover && receivedVersion >= incrementVersion(this.version)) {
      this.requestGapRecovery(receivedVersion);
    }
  }

  private retainAcknowledgement(clientMutationId: string): void {
    if (this.acknowledged.has(clientMutationId)) return;
    this.acknowledged.add(clientMutationId);
    this.acknowledgementOrder.push(clientMutationId);
    if (this.acknowledgementOrder.length <= this.limits.maxRecentAcknowledgements) return;
    const expired = this.acknowledgementOrder.shift();
    if (expired !== undefined) this.acknowledged.delete(expired);
  }

  private clearGapBuffer(): void {
    for (const input of this.gapBuffer.values()) this.releaseBuffered(input);
    this.gapBuffer.clear();
  }

  private requestGapRecovery(receivedVersion: number): void {
    const recover = this.options.recoverVersionGap;
    if (!recover || this.recoveryPromise || this.destroyed) return;
    const expectedVersion = incrementVersion(this.version);
    this.recoveryPromise = recover({
      documentId: this.options.documentId,
      expectedVersion,
      receivedVersion,
      signal: this.abortController.signal,
    })
      .then(async (recovery) => {
        if (this.destroyed) return;
        if (Array.isArray(recovery)) {
          if (recovery.length > this.limits.maxFutureVersionDistance) {
            throw new SyncProtocolError(
              "future-distance-limit",
              "Version-gap recovery returned too many operations",
            );
          }
          for (const operation of recovery) {
            assertVersion((operation as { version?: unknown } | null)?.version, "version");
          }
          const ordered = recovery.slice().sort((a, b) => a.version - b.version);
          for (const operation of ordered) await this.applyVersionedOperation(operation);
          return;
        }
        const snapshot = recovery as WorkbookSnapshot;
        this.emit({
          type: "reload-required",
          expectedVersion: incrementVersion(this.version),
          receivedVersion,
          snapshot: cloneJsonValue(snapshot),
        });
      })
      .catch((error: unknown) => {
        this.handleRemoteIntakeError(error, this.abortController.signal);
      })
      .finally(() => {
        this.recoveryPromise = undefined;
      });
  }

  private async drainGapBuffer(): Promise<void> {
    while (!this.destroyed) {
      const expectedVersion = incrementVersion(this.version);
      const next = this.gapBuffer.get(expectedVersion);
      if (!next) return;
      if (!(await this.applyContiguousOperation(next.operation))) return;
      this.gapBuffer.delete(expectedVersion);
      this.releaseBuffered(next);
    }
  }

  private async consumeRemote(
    source: AsyncIterable<VersionedOperation>,
    signal: AbortSignal,
  ): Promise<void> {
    const iterator = source[Symbol.asyncIterator]();
    let closing = false;
    const close = () => {
      if (closing || !iterator.return) return;
      closing = true;
      try {
        void iterator.return().catch((error: unknown) => {
          this.handleRemoteIntakeError(error, signal);
        });
      } catch (error) {
        this.handleRemoteIntakeError(error, signal);
      }
    };
    signal.addEventListener("abort", close, { once: true });
    try {
      while (!signal.aborted && !this.destroyed) {
        const next = await iterator.next();
        if (next.done || signal.aborted || this.destroyed) break;
        await this.applyVersionedOperation(next.value);
      }
    } catch (error) {
      this.handleRemoteIntakeError(error, signal);
      close();
    } finally {
      signal.removeEventListener("abort", close);
      if (signal.aborted || this.destroyed) close();
    }
  }

  private handleRemoteIntakeError(error: unknown, signal: AbortSignal): void {
    if (signal.aborted || this.destroyed) return;
    this.connection = "error";
    this.emitState();
    this.emit({ type: "error", error });
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

  private pendingCapacity(): SyncPendingCapacityState {
    if (this.destroyed) return "destroyed";
    if (this.hydrating) return "hydrating";
    if (this.hydrationError !== undefined) return "restore-error";
    if (
      this.pendingCommitTotal >= this.limits.maxPendingCommits ||
      this.pendingOperationTotal >= this.limits.maxPendingOperations ||
      this.pendingEncodedByteTotal >= this.limits.maxPendingEncodedBytes
    ) {
      return "full";
    }
    return "available";
  }

  private emitState(): void {
    this.emit({ type: "state", state: this.state });
  }

  private emit(event: SyncCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

interface LocalPendingReservation {
  status: "reserved" | "applied" | "cancelled";
  clientMutationId: string;
  operations: readonly DocumentOp[];
  operationCount: number;
  encodedBytes: number;
  appliedOperations?: readonly DocumentOp[];
  appliedEncodedBytes?: number;
}

interface BufferedVersionedOperation {
  operation: VersionedOperation;
  bytes: number;
  retained?: boolean;
}
interface InspectedVersionedOperation {
  version: number;
  operations: readonly DocumentOp[];
  clientMutationId?: string;
  bytes: number;
}

type PlainRecord = Record<string, unknown>;

const LIMIT_KEYS: Record<keyof SyncCoordinatorLimits, true> = {
  maxMutationIdBytes: true,
  maxOperationsPerVersion: true,
  maxVersionPayloadBytes: true,
  maxFutureVersionDistance: true,
  maxBufferedVersions: true,
  maxBufferedOperations: true,
  maxBufferedBytes: true,
  maxRecentAcknowledgements: true,
  maxPendingCommits: true,
  maxPendingOperations: true,
  maxPendingEncodedBytes: true,
};

const DOCUMENT_OPERATION_KINDS: Record<DocumentOp["op"], true> = {
  set: true,
  setRange: true,
  setBlock: true,
  setRangeStyle: true,
  clearRange: true,
  addRows: true,
  removeRows: true,
  moveRows: true,
  addColumns: true,
  removeColumns: true,
  moveColumns: true,
  setColumn: true,
  setRowMeta: true,
  addMerge: true,
  removeMerge: true,
  addSheet: true,
  removeSheet: true,
  renameSheet: true,
  moveSheet: true,
  setSheetMeta: true,
  setValidationRule: true,
  removeValidationRule: true,
  setProtectedRange: true,
  removeProtectedRange: true,
  setNote: true,
  setNamedRange: true,
  removeNamedRange: true,
};

function assertPendingCommit(
  commit: PendingCommit,
  documentId: string,
  limits: Readonly<SyncCoordinatorLimits>,
): number {
  const record = assertPlainRecord(commit, "Durable queue returned an invalid pending commit");
  if (ownDataValue(record, "documentId") !== documentId) {
    throw new SyncProtocolError(
      "invalid-id",
      "Durable queue returned a commit for the wrong document",
    );
  }
  assertVersion(ownDataValue(record, "baseVersion"), "pending baseVersion");
  assertMutationId(ownDataValue(record, "clientMutationId"), limits);
  return assertOperationResources(
    ownDataValue(record, "operations"),
    limits.maxPendingOperations,
    limits.maxPendingEncodedBytes,
  );
}

function resolveLimits(
  overrides: Partial<SyncCoordinatorLimits> | undefined,
): Readonly<SyncCoordinatorLimits> {
  if (overrides === undefined) return DEFAULT_SYNC_COORDINATOR_LIMITS;
  const record = assertPlainRecord(overrides, "Sync limits must be a plain object");
  const resolved: SyncCoordinatorLimits = { ...DEFAULT_SYNC_COORDINATOR_LIMITS };
  for (const key in record) {
    if (!Object.hasOwn(LIMIT_KEYS, key)) {
      throw new SyncProtocolError("invalid-limits", `Unknown sync limit ${key}`);
    }
    const value = ownDataValue(record, key);
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new SyncProtocolError(
        "invalid-limits",
        `Sync limit ${key} must be a positive safe integer`,
      );
    }
    (resolved as unknown as Record<string, number>)[key] = value as number;
  }
  return Object.freeze(resolved);
}

function assertDocumentId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SyncProtocolError("invalid-id", "documentId must be a nonempty string");
  }
}

function assertVersion(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SyncProtocolError("invalid-version", `${field} must be a nonnegative safe integer`);
  }
}

function incrementVersion(version: number): number {
  if (version >= Number.MAX_SAFE_INTEGER) {
    throw new SyncProtocolError("invalid-version", "Server version cannot advance safely");
  }
  return version + 1;
}

function assertMutationId(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8ByteLength(value, limits.maxMutationIdBytes) > limits.maxMutationIdBytes
  ) {
    throw new SyncProtocolError(
      "invalid-id",
      `clientMutationId must be nonempty and at most ${limits.maxMutationIdBytes} UTF-8 bytes`,
    );
  }
}

function assertOperations(value: unknown, limits: Readonly<SyncCoordinatorLimits>): number {
  return assertOperationResources(
    value,
    limits.maxOperationsPerVersion,
    limits.maxVersionPayloadBytes,
  );
}

function assertOperationResources(
  value: unknown,
  maxOperations: number,
  maxEncodedBytes: number,
): number {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new SyncProtocolError("invalid-operations", "operations must be an array");
  }
  if (value.length > maxOperations) {
    throw new SyncProtocolError(
      "operation-limit",
      `operations exceeds the ${maxOperations} operation limit`,
    );
  }
  const encodedBytes = jsonEncodedByteLength(value, maxEncodedBytes);
  for (let index = 0; index < value.length; index++) {
    const operation = value[index];
    const record = assertPlainRecord(operation, "Each document operation must be a plain object");
    const kind = ownDataValue(record, "op");
    if (typeof kind !== "string" || !Object.hasOwn(DOCUMENT_OPERATION_KINDS, kind)) {
      throw new SyncProtocolError("invalid-operations", "Document operation kind is invalid");
    }
    const errors = validateDocumentOperationShape(operation, `operations[${index}]`);
    if (errors.length > 0) {
      const error = errors[0]!;
      throw new SyncProtocolError(
        "invalid-operations",
        `Invalid document operation at ${error.path}: ${error.message}`,
      );
    }
  }
  return encodedBytes;
}

function inspectVersionedOperation(
  value: unknown,
  limits: Readonly<SyncCoordinatorLimits>,
): InspectedVersionedOperation {
  const record = assertPlainRecord(value, "Versioned operation must be a plain object");
  const version = ownDataValue(record, "version");
  assertVersion(version, "version");
  const operations = ownDataValue(record, "operations");
  const bytes = assertOperations(operations, limits);
  const mutationId = optionalOwnDataValue(record, "clientMutationId");
  if (mutationId !== undefined) assertMutationId(mutationId, limits);
  return {
    version,
    operations: operations as readonly DocumentOp[],
    ...(mutationId !== undefined ? { clientMutationId: mutationId } : {}),
    bytes,
  };
}

function assertPersistenceResponse(
  value: PersistenceCommitResponse,
  limits: Readonly<SyncCoordinatorLimits>,
): void {
  const record = assertPlainRecord(value, "Persistence response must be a plain object");
  const status = ownDataValue(record, "status");
  if (status === "conflict") {
    assertVersion(ownDataValue(record, "currentVersion"), "currentVersion");
    const snapshot = optionalOwnDataValue(record, "snapshot");
    if (snapshot !== undefined) {
      const validation = validateWorkbookSnapshot(snapshot, {
        storage: "paged",
        resourceLimits: { maxSerializedBytes: limits.maxBufferedBytes },
      });
      if (!validation.ok) {
        throw new SyncProtocolError(
          validation.errors.some((error) => error.code === "resource-limit")
            ? "buffer-byte-limit"
            : "invalid-operations",
          validation.errors[0]?.message ?? "Conflict snapshot is invalid",
        );
      }
    }
    const operationsSinceBase = optionalOwnDataValue(record, "operationsSinceBase");
    if (operationsSinceBase === undefined) return;
    if (
      !Array.isArray(operationsSinceBase) ||
      Object.getPrototypeOf(operationsSinceBase) !== Array.prototype
    ) {
      throw new SyncProtocolError("invalid-operations", "operationsSinceBase must be an array");
    }
    if (operationsSinceBase.length > limits.maxBufferedVersions) {
      throw new SyncProtocolError(
        "buffer-count-limit",
        "Conflict operation tail exceeds the version count limit",
      );
    }
    let operationCount = 0;
    let byteCount = 0;
    for (const operation of operationsSinceBase) {
      const inspected = inspectVersionedOperation(operation, limits);
      operationCount += inspected.operations.length;
      byteCount += inspected.bytes;
      if (operationCount > limits.maxBufferedOperations) {
        throw new SyncProtocolError(
          "buffer-operation-limit",
          "Conflict operation tail exceeds the operation count limit",
        );
      }
      if (byteCount > limits.maxBufferedBytes) {
        throw new SyncProtocolError(
          "buffer-byte-limit",
          "Conflict operation tail exceeds the byte limit",
        );
      }
    }
    return;
  }
  if (status !== "applied" && status !== "duplicate") {
    throw new SyncProtocolError("invalid-operations", "Persistence response status is invalid");
  }
  assertVersion(ownDataValue(record, "version"), "version");
  assertMutationId(ownDataValue(record, "clientMutationId"), limits);
  if (Object.getOwnPropertyDescriptor(record, "canonicalOperations") !== undefined) {
    throw new SyncProtocolError(
      "invalid-operations",
      "Persistence responses cannot contain canonical operations",
    );
  }
}

function assertConflictRecovery(
  response: Extract<PersistenceCommitResponse, { status: "conflict" }>,
  baseVersion: number,
): void {
  if (response.currentVersion < baseVersion) {
    throw new SyncProtocolError(
      "invalid-version",
      "Conflict currentVersion cannot precede the pending baseVersion",
    );
  }
  if (
    response.snapshot !== undefined &&
    (response.snapshot.version ?? 0) !== response.currentVersion
  ) {
    throw new SyncProtocolError(
      "invalid-version",
      "Conflict snapshot version must equal currentVersion",
    );
  }
  const tail = response.operationsSinceBase;
  if (tail === undefined) return;
  if (tail.length === 0) {
    if (response.currentVersion !== baseVersion) {
      throw new SyncProtocolError(
        "invalid-version",
        "An empty conflict operation tail cannot advance currentVersion",
      );
    }
    return;
  }
  let expectedVersion = incrementVersion(baseVersion);
  for (let index = 0; index < tail.length; index++) {
    if (tail[index]!.version !== expectedVersion) {
      throw new SyncProtocolError(
        "invalid-version",
        "Conflict operationsSinceBase must be contiguous from the pending baseVersion",
      );
    }
    if (index + 1 < tail.length) expectedVersion = incrementVersion(expectedVersion);
  }
  if (tail.at(-1)!.version !== response.currentVersion) {
    throw new SyncProtocolError(
      "invalid-version",
      "Conflict operationsSinceBase must end at currentVersion",
    );
  }
}

function assertPlainRecord(value: unknown, message: string): PlainRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new SyncProtocolError("invalid-operations", message);
  }
  return value as PlainRecord;
}

function ownDataValue(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) {
    throw new SyncProtocolError("invalid-operations", `${key} must be an enumerable data field`);
  }
  return descriptor.value;
}

function optionalOwnDataValue(record: PlainRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new SyncProtocolError("invalid-operations", `${key} must be an enumerable data field`);
  }
  return descriptor.value;
}

function validReceivedVersion(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

function asSyncProtocolError(error: unknown): SyncProtocolError {
  return error instanceof SyncProtocolError
    ? error
    : new SyncProtocolError("invalid-operations", "Synchronization input is invalid");
}

function utf8ByteLength(value: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > stopAfter) return bytes;
  }
  return bytes;
}

function jsonEncodedByteLength(value: unknown, limit: number): number {
  try {
    return boundedJsonByteLength(value, limit);
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "limit") {
      throw new SyncProtocolError(
        "payload-limit",
        `Encoded operation payload exceeds the ${limit} byte limit`,
      );
    }
    throw new SyncProtocolError("invalid-operations", "Operations must contain JSON-safe values");
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
