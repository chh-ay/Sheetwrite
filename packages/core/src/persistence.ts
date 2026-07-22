import { SheetwriteError } from "./errors.js";
import {
  SnapshotResourceError,
  type SnapshotResourceLimits,
  SnapshotValidationError,
  validateWorkbookSnapshot,
} from "./document-protocol.js";
import { GridImpl } from "./grid.js";
import { SheetwriteStore } from "./store.js";
import type { WorkbookSnapshot } from "./types/document.js";
import type { Grid, GridOptions } from "./types/grid.js";
import type {
  PersistenceAdapter,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  VersionedOperation,
} from "./types/transaction.js";

/** Grid creation options accepted when hydrating a validated snapshot. */
export type SnapshotGridOptions = Omit<GridOptions, "workbook" | "data"> & {
  /** Overrides canonical validation/allocation ceilings for this snapshot load. */
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
};

/** Stable category for a persistence failure. */
export type PersistenceErrorCode =
  | "aborted"
  | "invalid-snapshot"
  | "resource-limit"
  | "not-found"
  | "commit-rejected";

/** Typed failure raised by persistence and synchronization flows. */
export class PersistenceError extends SheetwriteError {
  override readonly name = "PersistenceError";

  constructor(code: PersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(code, "persistence", message, { cause: options?.cause });
  }
}

/**
 * Mount a grid over a validated, non-dirty snapshot. The grid owns and disposes
 * the hydrated store just like one created through `createGrid`.
 */
export function createGridFromSnapshot(
  host: HTMLElement,
  snapshot: unknown,
  options: SnapshotGridOptions = {},
): Grid {
  const { snapshotResourceLimits, ...gridOptions } = options;
  let store: SheetwriteStore;
  try {
    store = SheetwriteStore.fromSnapshot(snapshot, {
      storage: gridOptions.datasourceStorage?.mode ?? "dense",
      chunkRows: gridOptions.datasourceStorage?.chunkRows,
      cacheBytes: gridOptions.datasourceStorage?.cacheBytes,
      dirtyCellLimit: gridOptions.datasourceStorage?.dirtyCellLimit,
      protectionResolver: gridOptions.protectionResolver,
      mutationPolicy: gridOptions.mutationPolicy,
      snapshotResourceLimits,
      transactionResourceLimits: gridOptions.transactionResourceLimits,
    });
  } catch (error) {
    if (error instanceof SnapshotValidationError) {
      const code = error.errors.some((issue) => issue.code === "resource-limit")
        ? "resource-limit"
        : "invalid-snapshot";
      throw new PersistenceError(code, error.message, { cause: error });
    }
    throw error;
  }

  try {
    return new GridImpl(host, { ...gridOptions, workbook: store.getWorkbook() }, store, true);
  } catch (error) {
    store.dispose();
    if (error instanceof SnapshotResourceError || error instanceof RangeError) {
      throw new PersistenceError("resource-limit", error.message, { cause: error });
    }
    throw error;
  }
}

/** Executable database-neutral reference adapter for tests, demos, and local workflows. */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly documents = new Map<
    string,
    {
      snapshot: WorkbookSnapshot;
      version: number;
      initialVersion: number;
      log: VersionedOperation[];
      applied: Map<string, number>;
    }
  >();

  constructor(...snapshots: readonly WorkbookSnapshot[]) {
    for (const snapshot of snapshots) {
      const checked = validateWorkbookSnapshot(snapshot);
      if (!checked.ok) {
        const cause = new SnapshotValidationError(checked.errors);
        throw new PersistenceError("invalid-snapshot", cause.message, { cause });
      }
      if (!checked.value.documentId) {
        throw new PersistenceError("invalid-snapshot", "Memory snapshots require documentId");
      }
      const version = checked.value.version ?? 0;
      this.documents.set(checked.value.documentId, {
        snapshot: cloneSnapshot({ ...checked.value, version }),
        version,
        initialVersion: version,
        log: [],
        applied: new Map(),
      });
    }
  }

  async load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    throwIfAborted(signal);
    const document = this.documents.get(documentId);
    if (!document) throw new PersistenceError("not-found", `Unknown document: ${documentId}`);
    await Promise.resolve();
    throwIfAborted(signal);
    return cloneSnapshot(document.snapshot);
  }

  async commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    throwIfAborted(request.signal);
    const document = this.documents.get(request.documentId);
    if (!document) {
      throw new PersistenceError("not-found", `Unknown document: ${request.documentId}`);
    }
    const appliedVersion = document.applied.get(request.clientMutationId);
    if (appliedVersion !== undefined) {
      return {
        status: "duplicate",
        version: appliedVersion,
        clientMutationId: request.clientMutationId,
      };
    }
    if (request.baseVersion !== document.version) {
      const operationsSinceBase =
        request.baseVersion >= document.initialVersion
          ? document.log.filter((entry) => entry.version > request.baseVersion)
          : undefined;
      return {
        status: "conflict",
        currentVersion: document.version,
        ...(operationsSinceBase &&
        operationsSinceBase.length === document.version - request.baseVersion
          ? { operationsSinceBase: cloneJsonValue(operationsSinceBase) }
          : { snapshot: cloneSnapshot(document.snapshot) }),
      };
    }

    const store = SheetwriteStore.fromSnapshot(document.snapshot);
    try {
      const outcome = store.applyTransaction(
        { patches: request.operations.slice() },
        { source: "remote", commitReason: "api" },
      );
      if (
        outcome.status === "conflict" ||
        (outcome.status === "noop" && request.operations.length > 0)
      ) {
        throw new PersistenceError("commit-rejected", "Persistence commit was rejected");
      }
      const version = document.version + 1;
      const next = { ...store.exportSnapshot(), version };
      throwIfAborted(request.signal);
      document.snapshot = cloneSnapshot(next);
      document.version = version;
      document.applied.set(request.clientMutationId, version);
      document.log.push({
        version,
        operations: cloneJsonValue(request.operations),
        clientMutationId: request.clientMutationId,
      });
      return {
        status: "applied",
        version,
        clientMutationId: request.clientMutationId,
      };
    } finally {
      store.dispose();
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PersistenceError("aborted", "Persistence operation aborted", {
      cause: signal.reason,
    });
  }
}

function cloneSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as WorkbookSnapshot;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
