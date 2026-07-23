---
title: Error handling
description: Typed failures, stable codes, recovery paths, event direction, validation, and incomplete-data behavior.
---

## Event direction

`change` is the committed transaction stream. `ChangeEvent.source` is `local` for user/API output that a host may persist and `remote` for already-persisted input that must not be enqueued again. Selection, search, renderer fallback, and other UI events remain observational.

Framework `onGridChange`/`grid-change` callbacks carry the same committed event. Adapter readiness is `{ grid, generation, reason }`; `reason` distinguishes `initial`, `input-reset`, and `renderer-reset`. The imperative ref, exposed handle, or binding is assigned before readiness and cleared on replacement.

## Stable failure envelope

Every consumer-visible initialization, datasource, renderer, export, persistence,
snapshot, synchronization, collaboration, CSV, and XLSX failure is a
`SheetwriteError`. Use `code` and `operation` for control flow; `message` is
diagnostic text and may become more specific. `context` contains
serialization-safe boundary details, `retryable` is present only when
Sheetwrite can determine it, and `cause` retains the original exception in the
current realm. `toJSON()` omits `cause`.

```ts prelude="wasm" partial="requires application-specific WASM URLs" title="Initialization recovery"
import { initSheetwrite, isSheetwriteError } from "@sheetwrite/core";
declare const wasmUrl: URL;
declare const correctedWasmUrl: URL;
declare function showInitializationError(message: string): void;


try {
  await initSheetwrite(wasmUrl);
} catch (error) {
  if (!isSheetwriteError(error) || error.code !== "initialization-failed") throw error;
  showInitializationError(error.message);
  // A failed source does not poison readiness. Retry with corrected input.
  await initSheetwrite(correctedWasmUrl);
}
```

The guard also recognizes validated cross-realm and serialized envelopes. A
serialized envelope is structural; code that requires `Error` identity should
construct or receive a live `SheetwriteError`.

```ts prelude="wasm" partial="requires surrounding host state" title="Operational recovery"
declare function retryVisibleRows(request: {
  readonly sheet: string;
  readonly start: number;
  readonly end: number;
  readonly revision: number;
}): void;
declare function reportDegradedRendering(code: string): void;
declare function promptToEnableXlsx(): void;

grid.on("datasource-error", ({ request, error }) => {
  if (error.retryable !== false) {
    retryVisibleRows(request);
  }
});

grid.on("renderer-fallback", ({ error }) => {
  reportDegradedRendering(error.code);
  // Canvas rendering is already active; do not remount the Grid.
});

grid.on("export-error", ({ error }) => {
  if (error.code === "optional-backend-unavailable") {
    promptToEnableXlsx();
  }
});
```

Framework initialization callbacks and Grid operational events carry the same
class identity exported by `@sheetwrite/core` and `@sheetwrite/core/adapter`.
Normal mutation denials remain `mutation-rejected` results/events, and
incomplete paged queries retain their explicit capability/result contracts;
they are not converted into generic exceptions.

## Typed error index

Start with [`SheetwriteError`](/docs/api/core/sheetwrite-error/) and
[`isSheetwriteError`](/docs/api/core/is-sheetwrite-error/). Branch on the stable
`code` and `operation` fields; use the boundary-specific classes below only when
their structured fields are needed.

The complete enums are [`SheetwriteErrorCode`](/docs/api/core/sheetwrite-error-code/)
and [`SheetwriteErrorOperation`](/docs/api/core/sheetwrite-error-operation/);
their runtime value sets are
[`SHEETWRITE_ERROR_CODES`](/docs/api/core/sheetwrite-error-codes/) and
[`SHEETWRITE_ERROR_OPERATIONS`](/docs/api/core/sheetwrite-error-operations/).

<div class="error-catalog">
<a href="/docs/api/core/snapshot-validation-error/"><code>SnapshotValidationError</code><span>Malformed workbook snapshot; inspect path-qualified <code>errors</code>.</span></a>
<a href="/docs/api/core/snapshot-resource-error/"><code>SnapshotResourceError</code><span>Workbook construction exceeded a configured resource ceiling.</span></a>
<a href="/docs/api/core/incomplete-data-error/"><code>IncompleteDataError</code><span>A query needs datasource pages that are not loaded yet.</span></a>
<a href="/docs/api/core/delimited-text-options-error/"><code>DelimitedTextOptionsError</code><span>A CSV/TSV resource-limit option is invalid.</span></a>
<a href="/docs/api/core/delimited-text-resource-error/"><code>DelimitedTextResourceError</code><span>CSV/TSV parsing or encoding exceeded a declared limit.</span></a>
<a href="/docs/api/core/xlsx-resource-error/"><code>XlsxResourceError</code><span>XLSX import or export exceeded a codec resource ceiling.</span></a>
<a href="/docs/api/core/persistence-error/"><code>PersistenceError</code><span>Host load, commit, or recovery failed with a stable persistence code.</span></a>
<a href="/docs/api/core-browser/indexed-db-pending-commit-storage-error/"><code>IndexedDbPendingCommitStorageError</code><span>Browser durable-queue storage is unavailable, blocked, aborted, corrupt, or over quota.</span></a>
<a href="/docs/api/core/sync-protocol-error/"><code>SyncProtocolError</code><span>Remote synchronization input is malformed or exceeds a protocol bound.</span></a>
<a href="/docs/api/core/sync-pending-capacity-error/"><code>SyncPendingCapacityError</code><span>The durable local queue cannot reserve capacity for another transaction.</span></a>
</div>

## Recovery by boundary

- `SnapshotValidationError` rejects malformed workbooks before partial hydration. Inspect its path-qualified `errors`; fix or reject the source instead of retrying unchanged bytes.
- `SnapshotResourceError` reports bounded workbook construction. Reduce the document or explicitly raise the named host-controlled ceiling.
- `DelimitedTextOptionsError` rejects an invalid CSV/TSV ceiling before work starts. Correct the option; retrying the same configuration cannot succeed.
- `DelimitedTextResourceError` and `XlsxResourceError` retain `resource`, `limit`, and `actual`. Reduce the input/output or explicitly change the applicable limit.
- `IncompleteDataError` identifies datasource pages required by the operation. Load those pages or use a visible-window operation; do not treat unloaded cells as empty.
- `PersistenceError` retains the host load/commit `cause`; its code distinguishes aborted work, invalid snapshots, resource limits, missing state, and rejected commits.
- `IndexedDbPendingCommitStorageError` distinguishes unavailable, blocked, aborted, corrupt, and quota-limited browser storage.
- `SyncProtocolError` rejects malformed or resource-violating remote input. Fix the producer; do not replay the same payload.
- `SyncPendingCapacityError` rejects a new local transaction before it can exceed the durable queue ceiling. Drain or reconcile pending work before retrying.

Worker startup and capability failures switch to the canvas renderer and emit `renderer-fallback`; observe `grid.rendererKind` to report the active renderer, not the requested option.

- [`GridEvents`](/docs/api/core/grid-events/)
- [`SnapshotValidationError`](/docs/api/core/snapshot-validation-error/)
- [`IncompleteDataError`](/docs/api/core/incomplete-data-error/)
- [`SheetwriteError`](/docs/api/core/sheetwrite-error/)
- [`isSheetwriteError`](/docs/api/core/is-sheetwrite-error/)
- [Framework lifecycle](/docs/frameworks/lifecycle/)
