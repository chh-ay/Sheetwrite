---
title: Events and errors
description: Stable failure envelopes, event direction, recovery, validation, and incomplete-data behavior.
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

## Validation and persistence failures

- `SnapshotValidationError` is a `SheetwriteError` with `code: "invalid-snapshot"` and rejects malformed workbook snapshots rather than hydrating partial state.
- `SnapshotResourceError` reports bounded snapshot allocation failures.
- `PersistenceError` classifies host load/commit failures while retaining the original `cause`.
- `IndexedDbPendingCommitStorageError` classifies durable pending-queue failures from `@sheetwrite/core/browser`.
- `IncompleteDataError` means an operation requires datasource cells that paged storage has not loaded; load the required pages or avoid a full-sheet operation.
- `DelimitedTextResourceError` and `XlsxResourceError` retain their resource/limit/actual fields while sharing the canonical envelope.

Worker startup and capability failures switch to the canvas renderer and emit `renderer-fallback`; observe `grid.rendererKind` to report the active renderer, not the requested option.

- [`GridEvents`](/docs/api/core/grid-events/)
- [`SnapshotValidationError`](/docs/api/core/snapshot-validation-error/)
- [`IncompleteDataError`](/docs/api/core/incomplete-data-error/)
- [`SheetwriteError`](/docs/api/core/sheetwrite-error/)
- [`isSheetwriteError`](/docs/api/core/is-sheetwrite-error/)
- [Framework lifecycle](/docs/frameworks/lifecycle/)
