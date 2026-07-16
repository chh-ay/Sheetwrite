---
title: Events and errors
description: Event direction, reset readiness, validation failures, and incomplete-data behavior.
---

## Event direction

`change` is the committed transaction stream. `ChangeEvent.source` is `local` for user/API output that a host may persist and `remote` for already-persisted input that must not be enqueued again. Selection, search, renderer fallback, and other UI events remain observational.

Framework `onGridChange`/`grid-change` callbacks carry the same committed event. Adapter readiness is `{ grid, generation, reason }`; `reason` distinguishes `initial`, `input-reset`, and `renderer-reset`. The imperative ref, exposed handle, or binding is assigned before readiness and cleared on replacement.

## Validation and persistence failures

- `SnapshotValidationError` rejects malformed workbook snapshots with a path/code/message rather than hydrating partial state.
- `DocumentValidationError` reports invalid document operations and policy failures.
- `PersistenceError` classifies host load/commit failures.
- `IndexedDbPendingCommitStorageError` classifies durable pending-queue failures in the browser entry point.
- `IncompleteDataError` means an operation requires datasource cells that paged storage has not loaded; load the required pages or avoid a full-sheet operation.

Worker startup and capability failures switch to the canvas renderer and emit `renderer-fallback`; observe `grid.rendererKind` to report the active renderer, not the requested option.

- [`GridEvents`](/docs/api/core/grid-events/)
- [`SnapshotValidationError`](/docs/api/core/snapshot-validation-error/)
- [`IncompleteDataError`](/docs/api/core/incomplete-data-error/)
- [Framework lifecycle](/docs/frameworks/lifecycle/)
