// Transaction, persistence, synchronization, and change-event contracts.
// No runtime values live here.

import type { CellStyle, CellValue } from "./cell.js";
import type { CellAddress } from "./coordinates.js";
import type { CommitReason, DocumentOp, MutationIssue, WorkbookSnapshot } from "./document.js";

/**
 * Low-level Store transaction. `epoch` provides optional optimistic
 * concurrency at the storage boundary.
 *
 * Calling `Store.applyTransaction` bypasses Grid read-only checks and Grid
 * undo/redo history. Host-driven edits should use `Grid.applyTransaction`.
 */
export interface Transaction {
  patches: DocumentOp[];
  epoch?: number;
}

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

export type OperationSource = "local" | "remote";

export interface TransactionApplicationOptions {
  /** Distinguishes host persistence input from local user/API output. */
  source?: OperationSource;
  /** Event classification; defaults to `api`. */
  commitReason?: CommitReason;
}

export interface RemoteOperationOptions {
  commitReason?: CommitReason;
}

export interface PendingCommit {
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  readonly operations: readonly DocumentOp[];
}

export type SyncMutationStatus =
  | "persisting"
  | "pending"
  | "sending"
  | "conflicted"
  | "storage-error";

export interface SyncMutationRecord extends PendingCommit {
  status: SyncMutationStatus;
}

export interface VersionedOperation {
  version: number;
  readonly operations: readonly DocumentOp[];
  clientMutationId?: string;
}

export interface PersistenceCommitRequest extends PendingCommit {
  signal?: AbortSignal;
}

export type PersistenceCommitResponse =
  | {
      status: "applied";
      version: number;
      clientMutationId: string;
      canonicalOperations?: readonly DocumentOp[];
    }
  | { status: "duplicate"; version: number; clientMutationId: string }
  | {
      status: "conflict";
      currentVersion: number;
      operationsSinceBase?: readonly VersionedOperation[];
      snapshot?: WorkbookSnapshot;
    };

export interface PersistenceAdapter {
  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse>;
}

export interface RemoteOperationSource {
  subscribe(
    listener: (operation: VersionedOperation) => void,
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
  transaction: Transaction;
  changes: CellChange[];
  /** What produced this commit — see {@link CommitReason}. */
  commitReason: CommitReason;
  /** Remote input is observable but never belongs in outgoing local persistence. */
  source: OperationSource;
  epoch?: number;
}
