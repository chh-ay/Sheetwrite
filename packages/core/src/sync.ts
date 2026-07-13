import type {
  DocumentOp,
  Grid,
  PersistenceAdapter,
  PersistenceCommitResponse,
  RemoteOperationSource,
  SyncMutationRecord,
  VersionedOperation,
  WorkbookSnapshot,
} from "./types.js";

export interface SyncCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  createMutationId?: () => string;
}

export type SyncCoordinatorEvent =
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
    }
  | { type: "reloaded"; serverVersion: number; pending: readonly SyncMutationRecord[] }
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
  private readonly disposeGrid: () => void;
  private readonly resumeDirtyTracking: () => void;
  private disposeRemote?: () => void;
  private destroyed = false;
  private version: number;

  constructor(
    private readonly grid: Grid,
    private readonly adapter: PersistenceAdapter,
    private readonly options: SyncCoordinatorOptions,
  ) {
    this.version = options.serverVersion;
    this.resumeDirtyTracking = grid.store.suspendDirtyTracking?.() ?? (() => {});
    this.disposeGrid = grid.on("change", (event) => {
      if (event.source !== "local" || event.transaction.patches.length === 0) return;
      this.enqueue(event.transaction.patches);
    });
  }

  get serverVersion(): number {
    return this.version;
  }

  get pendingCount(): number {
    return this.records.size;
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

  subscribe(source: RemoteOperationSource): () => void {
    this.disposeRemote?.();
    const dispose = source.subscribe(
      (operation) => this.applyVersionedOperation(operation),
      this.abortController.signal,
    );
    this.disposeRemote = typeof dispose === "function" ? dispose : undefined;
    return () => {
      if (this.disposeRemote === dispose) this.disposeRemote = undefined;
      if (typeof dispose === "function") dispose();
    };
  }

  async sendNext(): Promise<PersistenceCommitResponse | null> {
    const record = this.order
      .map((id) => this.records.get(id))
      .find((candidate) => candidate?.status === "pending");
    return record ? this.send(record.clientMutationId) : null;
  }

  /** Explicit host-controlled retry; the original mutation ID is retained. */
  retry(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    return this.send(clientMutationId);
  }

  async send(clientMutationId: string): Promise<PersistenceCommitResponse | null> {
    if (this.destroyed) return null;
    const record = this.records.get(clientMutationId);
    if (!record || record.status === "conflicted" || record.status === "sending") return null;
    record.status = "sending";
    this.emit({ type: "sending", mutation: cloneRecord(record) });

    try {
      const response = await this.adapter.commit({
        documentId: record.documentId,
        baseVersion: record.baseVersion,
        clientMutationId: record.clientMutationId,
        operations: record.operations,
        signal: this.abortController.signal,
      });
      if (!this.destroyed) this.handleResponse(response, clientMutationId);
      return response;
    } catch (error) {
      const current = this.records.get(clientMutationId);
      if (current?.status === "sending") current.status = "pending";
      if (!this.destroyed) this.emit({ type: "error", error, clientMutationId });
      throw error;
    }
  }

  /** Public for transports that deliver responses independently of send promises. */
  handleResponse(response: PersistenceCommitResponse, requestedMutationId?: string): void {
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

    if (response.status === "applied" && response.canonicalOperations?.length) {
      this.grid.applyRemoteOperations(response.canonicalOperations);
    }
    this.grid.store.acknowledgeOperations?.(record.operations);
    this.version = Math.max(this.version, response.version);
    this.records.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    this.acknowledged.add(id);
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
      this.handleResponse({
        status: "applied",
        version: operation.version,
        clientMutationId: mutationId,
      });
      return;
    }
    if (mutationId && this.acknowledged.has(mutationId)) return;
    if (operation.version <= this.version) return;
    if (operation.version !== this.version + 1) {
      this.emit({
        type: "reload-required",
        expectedVersion: this.version + 1,
        receivedVersion: operation.version,
      });
      return;
    }

    this.grid.applyRemoteOperations(operation.operations);
    this.version = operation.version;
    this.emit({ type: "remote-applied", operation: cloneVersionedOperation(operation) });
  }

  /**
   * Resume only after the host replaced/reloaded document state and reapplied
   * retained local operations. No structural merge is attempted here.
   */
  resumeAfterReload(snapshot: WorkbookSnapshot): void {
    if (this.destroyed) return;
    this.version = snapshot.version ?? 0;
    let baseVersion = this.version;
    for (const id of this.order) {
      const record = this.records.get(id);
      if (!record) continue;
      record.baseVersion = baseVersion;
      record.status = "pending";
      baseVersion += 1;
    }
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
    this.resumeDirtyTracking();
    this.disposeRemote?.();
    this.disposeRemote = undefined;
    this.abortController.abort("Sheetwrite sync coordinator destroyed");
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
      status: "pending",
    };
    this.records.set(clientMutationId, record);
    this.order.push(clientMutationId);
    this.emit({ type: "pending", mutation: cloneRecord(record) });
  }

  private emit(event: SyncCoordinatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
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
