import { SnapshotValidationError, validateWorkbookSnapshot } from "./document-protocol.js";
import { GridImpl } from "./grid.js";
import { SheetwriteStore } from "./store.js";
import type {
  Grid,
  GridOptions,
  PersistenceAdapter,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  WorkbookSnapshot,
} from "./types.js";

export type SnapshotGridOptions = Omit<GridOptions, "workbook" | "data">;

export type PersistenceErrorCode = "aborted" | "invalid-snapshot" | "not-found" | "commit-rejected";

export class PersistenceError extends Error {
  constructor(
    readonly code: PersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PersistenceError";
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
  let store: SheetwriteStore;
  try {
    store = SheetwriteStore.fromSnapshot(snapshot);
  } catch (error) {
    if (error instanceof SnapshotValidationError) {
      throw new PersistenceError("invalid-snapshot", error.message, { cause: error });
    }
    throw error;
  }

  try {
    return new GridImpl(host, { ...options, workbook: store.getWorkbook() }, store, true);
  } catch (error) {
    store.dispose();
    throw error;
  }
}

/** Executable database-neutral reference adapter for tests, demos, and local workflows. */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly documents = new Map<string, WorkbookSnapshot>();

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
      this.documents.set(checked.value.documentId, cloneSnapshot(checked.value));
    }
  }

  async load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot> {
    throwIfAborted(signal);
    const snapshot = this.documents.get(documentId);
    if (!snapshot) throw new PersistenceError("not-found", `Unknown document: ${documentId}`);
    await Promise.resolve();
    throwIfAborted(signal);
    return cloneSnapshot(snapshot);
  }

  async commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse> {
    throwIfAborted(request.signal);
    const snapshot = this.documents.get(request.documentId);
    if (!snapshot) {
      throw new PersistenceError("not-found", `Unknown document: ${request.documentId}`);
    }

    const store = SheetwriteStore.fromSnapshot(snapshot);
    try {
      const outcome = store.applyTransaction(
        { patches: request.operations.slice() },
        { source: "remote", markDirty: false, commitReason: "api" },
      );
      if (
        outcome.status === "conflict" ||
        (outcome.status === "noop" && request.operations.length > 0)
      ) {
        throw new PersistenceError("commit-rejected", "Persistence commit was rejected");
      }
      const next = store.exportSnapshot();
      throwIfAborted(request.signal);
      this.documents.set(request.documentId, cloneSnapshot(next));
      return { outcome, snapshot: cloneSnapshot(next) };
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
