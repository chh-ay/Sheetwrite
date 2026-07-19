// Transaction, persistence, synchronization, and change-event contracts.
// No runtime values live here.

import type { CellStyle, CellValue } from "./cell.js";
import type { CellAddress } from "./coordinates.js";
import type { CommitReason, DocumentOp, MutationIssue, WorkbookSnapshot } from "./document.js";

/**
 * Public ceilings shared by transaction producers, persistence, transport,
 * and replay. Limits measure the submitted operation array itself, not the
 * logical cell area covered by compact operations.
 */
export interface TransactionResourceLimits {
  /** Maximum number of DocumentOp objects in one atomic transaction. */
  maxOperations: number;
  /** Maximum UTF-8 bytes in the JSON-encoded DocumentOp array. */
  maxEncodedBytes: number;
}

/**
 * Low-level Store transaction. `epoch` provides optional optimistic
 * concurrency at the storage boundary.
 *
 * Calling `Store.applyTransaction` bypasses Grid read-only checks and Grid
 * undo/redo history. Host-driven edits should use `Grid.applyTransaction`.
 */
export interface Transaction {
  /** Ordered document operations submitted as one store commit. */
  patches: DocumentOp[];
  /** Expected current store epoch; a mismatch returns a conflict without applying patches. */
  epoch?: number;
}

/** Outcome of applying a document transaction, including conflict, rejection, and no-op states. */
export type ApplyTransactionResult =
  | {
      status: "applied";
      epoch: number;
      transaction: Transaction;
      warnings?: MutationIssue[];
      rejections?: MutationIssue[];
    }
  | { status: "conflict"; expectedEpoch: number; actualEpoch: number }
  | {
      status: "rejected";
      epoch: number;
      issues: MutationIssue[];
    }
  | {
      status: "noop";
      epoch: number;
      reason: "empty" | "out-of-bounds" | "incomplete-data" | "read-only";
    };

/** Whether a committed change originated locally or from remote host input. */
export type OperationSource = "local" | "remote";

/** Source and commit classification used when applying a transaction. */
export interface TransactionApplicationOptions {
  /** Distinguishes host persistence input from local user/API output. */
  source?: OperationSource;
  /** Event classification; defaults to `api`. */
  commitReason?: CommitReason;
}

/** Classification metadata for host-supplied remote operations. */
export interface RemoteOperationOptions {
  commitReason?: CommitReason;
}

/** Immutable local operation batch awaiting a host acknowledgement. */
export interface PendingCommit {
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  readonly operations: readonly DocumentOp[];
}

/** Lifecycle state of one local mutation in the synchronization queue. */
export type SyncMutationStatus =
  | "persisting"
  | "pending"
  | "sending"
  | "conflicted"
  | "storage-error";

/** Pending commit paired with its current synchronization status. */
export interface SyncMutationRecord extends PendingCommit {
  status: SyncMutationStatus;
}

/** Remote document operations paired with a contiguous server version. */
export interface VersionedOperation {
  version: number;
  readonly operations: readonly DocumentOp[];
  clientMutationId?: string;
}

/** Cancellable pending commit submitted to a persistence adapter. */
export interface PersistenceCommitRequest extends PendingCommit {
  signal?: AbortSignal;
}

/**
 * Applied, duplicate, or conflict acknowledgement from persistence. `applied`
 * confirms the submitted operations unchanged; normalization must conflict.
 */
export type PersistenceCommitResponse =
  | { status: "applied"; version: number; clientMutationId: string }
  | { status: "duplicate"; version: number; clientMutationId: string }
  | {
      status: "conflict";
      currentVersion: number;
      operationsSinceBase?: readonly VersionedOperation[];
      snapshot?: WorkbookSnapshot;
    };

/** Host load and commit contract for versioned workbook persistence. */
export interface PersistenceAdapter {
  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse>;
}

/**
 * Host subscription contract for ordered versioned operations. Sources that
 * can pause intake should await the listener promise to preserve backpressure.
 */
export interface RemoteOperationSource {
  subscribe(
    listener: (operation: VersionedOperation) => void | Promise<void>,
    signal?: AbortSignal,
  ): undefined | (() => void);
}

/**
 * An undoable transaction submitted through a Grid.
 *
 * Grid transactions deliberately have no epoch: optimistic reconciliation is
 * a low-level Store concern, while Grid commits are normal host-driven edits
 * that participate in read-only policy and undo/redo history.
 */
export interface GridTransaction {
  patches: DocumentOp[];
}

/** One committed cell edit, carrying enough to roll back. */
export interface CellChange {
  addr: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  oldStyle?: CellStyle;
  newStyle?: CellStyle;
}

/** Payload of the `change` event; flows OUT for API submission/reconcile. */
export interface ChangeEvent {
  /** Operations that actually committed after policy and bounds filtering. */
  transaction: Transaction;
  /** Cell-level before/after effects; empty for commits that only change metadata. */
  changes: CellChange[];
  /** What produced this commit — see {@link CommitReason}. */
  commitReason: CommitReason;
  /** Remote input is observable but never belongs in outgoing local persistence. */
  source: OperationSource;
  /** Store epoch after the commit; emitted store and grid changes include it. */
  epoch?: number;
}
