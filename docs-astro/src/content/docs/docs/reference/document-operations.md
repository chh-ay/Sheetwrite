---
title: Document operations
description: Transaction boundaries, local and remote application, snapshot validation, and conservative rebase.
---

`DocumentOp` is the exhaustive serializable mutation union used by Store/Grid transactions, persistence, sync, undo/redo, and document rebase. Operations address stable sheet IDs and explicit row/column coordinates; structural operations also rebase formula references and related metadata.

## Local transactions

`grid.applyTransaction({ patches })` participates in read-only/protection policy, undo/redo, and committed `change` events. Its `ApplyTransactionResult` is `applied`, `rejected`, `conflict`, or `noop`, with warnings/rejections where applicable. `store.applyTransaction` is the lower-level epoch boundary and intentionally bypasses Grid policy/history.

## Remote input

Apply sequenced host input through the remote operation path so events carry `source: "remote"` and are not re-enqueued as local output. Versions must be contiguous: gaps require reload or an explicit `SyncVersionGapRequest` recovery flow.

## Snapshots and rebase

Validate untrusted JSON with the snapshot validator before hydration. `SnapshotValidationError` identifies the failing path. `rebaseDocumentOperations` accepts only cases it can establish as non-overlapping; conflicts preserve the original pending queue for host resolution.

- [`DocumentOp`](/docs/api/core/document-op/)
- [`Grid.applyTransaction`](/docs/api/core/grid/#applytransaction)
- [`ApplyTransactionResult`](/docs/api/core/apply-transaction-result/)
- [`WorkbookSnapshot`](/docs/api/core/workbook-snapshot/)
- [Persistence and recovery](/docs/guides/persistence/)
