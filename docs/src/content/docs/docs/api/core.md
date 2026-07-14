---
title: "@sheetwrite/core"
description: "API reference for @sheetwrite/core."
tableOfContents: false
---
<span class="api-status">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core`.

<dl class="api-metadata">
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>176</dd></div>
</dl>

Source entry: `packages/core/src/index.ts`

## Exported symbols

### Classes <span class="api-count">9</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code><span>Transport/auth-neutral comment state with server-owned author and timestamp fields.</span></a>
<a class="api-symbol-card" href="/docs/api/core/incomplete-data-error/"><code>IncompleteDataError</code><span>Error thrown when an operation requires datasource cells that are not loaded.</span></a>
<a class="api-symbol-card" href="/docs/api/core/memory-persistence-adapter/"><code>MemoryPersistenceAdapter</code><span>Executable database-neutral reference adapter for tests, demos, and local workflows.</span></a>
<a class="api-symbol-card" href="/docs/api/core/persistence-error/"><code>PersistenceError</code><span>Typed failure raised by persistence and synchronization flows.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-coordinator/"><code>PresenceCoordinator</code><span>Ephemeral presence lifecycle; it never calls a document mutation API.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-coordinator/"><code>RevisionCoordinator</code><span>Coordinates listing and restoring host-owned workbook revisions.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code><span>Stable public facade and the sole transaction, epoch, policy, and event barrier.</span></a>
<a class="api-symbol-card" href="/docs/api/core/snapshot-validation-error/"><code>SnapshotValidationError</code><span>Path-qualified schema failure found while validating an untrusted snapshot.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code><span>Deterministic, transport-neutral optimistic sync.</span></a>
</div>

### Functions <span class="api-count">32</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core/cell-a1/"><code>cellA1</code><span>0-based (row, col) → A1 cell reference (0, 0 → &quot;A1&quot;).</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-scalar-to-text/"><code>cellScalarToText</code><span>Spreadsheet display text for a resolved scalar.</span></a>
<a class="api-symbol-card" href="/docs/api/core/col-to-a1/"><code>colToA1</code><span>Column index (0-based) → A1 column label (0 → &quot;A&quot;, 26 → &quot;AA&quot;).</span></a>
<a class="api-symbol-card" href="/docs/api/core/create-grid/"><code>createGrid</code><span>Creates and mounts an imperative Grid in the supplied host element.</span></a>
<a class="api-symbol-card" href="/docs/api/core/create-grid-from-snapshot/"><code>createGridFromSnapshot</code><span>Mount a grid over a validated, non-dirty snapshot.</span></a>
<a class="api-symbol-card" href="/docs/api/core/date-to-serial/"><code>dateToSerial</code><span>Convert a real UTC Date to the Excel 1900-system serial.</span></a>
<a class="api-symbol-card" href="/docs/api/core/document-op-target/"><code>documentOpTarget</code><span>Exhaustive stable target identity used by persistence/logging layers.</span></a>
<a class="api-symbol-card" href="/docs/api/core/download-bytes/"><code>downloadBytes</code><span>Browser-only download helper; throws in non-DOM runtimes.</span></a>
<a class="api-symbol-card" href="/docs/api/core/format-number/"><code>formatNumber</code><span>Deterministic Excel-style number/date formatter.</span></a>
<a class="api-symbol-card" href="/docs/api/core/from-csv/"><code>fromCsv</code><span>Parse CSV text into ColumnarData keyed by columns[i].key — the symmetric counterpart to toCsv.</span></a>
<a class="api-symbol-card" href="/docs/api/core/from-xlsx-table/"><code>fromXlsxTable</code><span>Parse the first sheet of .xlsx bytes into ColumnarData.</span></a>
<a class="api-symbol-card" href="/docs/api/core/from-xlsx-workbook/"><code>fromXlsxWorkbook</code><span>Formula-preserving, multi-sheet workbook import through the optional XLSX backend.</span></a>
<a class="api-symbol-card" href="/docs/api/core/init-sheetwrite/"><code>initSheetwrite</code><span>Load the WASM data engine once.</span></a>
<a class="api-symbol-card" href="/docs/api/core/is-sheetwrite-ready/"><code>isSheetwriteReady</code><span>Whether initSheetwrite has completed — the single readiness source.</span></a>
<a class="api-symbol-card" href="/docs/api/core/label-to-col/"><code>labelToCol</code><span>A1 column label → 0-based column index (inverse of colToA1).</span></a>
<a class="api-symbol-card" href="/docs/api/core/parse-cell-input/"><code>parseCellInput</code><span>Coerce raw text input into a CellValue, following spreadsheet input-bar conventions: - blank (after trimming) clears the cell to a null literal; - text longer than one character beginning with = becomes a formula; -…</span></a>
<a class="api-symbol-card" href="/docs/api/core/parse-csv/"><code>parseCsv</code><span>Parse RFC-4180-style CSV into a grid of raw strings: comma-delimited, with &quot;-quoted fields that may embed commas, newlines, and doubled quotes, plus CR / LF / CRLF row breaks.</span></a>
<a class="api-symbol-card" href="/docs/api/core/parse-currency-input/"><code>parseCurrencyInput</code><span>Parse a currency-formatted string into a plain number, or null when the remaining text is not numeric.</span></a>
<a class="api-symbol-card" href="/docs/api/core/parse-date-input/"><code>parseDateInput</code><span>Parse a user-typed date string into a serial, or null when it is not a date.</span></a>
<a class="api-symbol-card" href="/docs/api/core/range-a1/"><code>rangeA1</code><span>Two cell corners → A1 range (&quot;A1:B3&quot;), collapsing to a single ref when equal.</span></a>
<a class="api-symbol-card" href="/docs/api/core/rebase-document-operations/"><code>rebaseDocumentOperations</code><span>Conservative server-ordered rebase for pending offline work.</span></a>
<a class="api-symbol-card" href="/docs/api/core/resolve-theme-from-css/"><code>resolveThemeFromCss</code><span>Read --sheetwrite- CSS custom properties into a partial theme.</span></a>
<a class="api-symbol-card" href="/docs/api/core/serial-to-date/"><code>serialToDate</code><span>Convert a date serial back to a Date.</span></a>
<a class="api-symbol-card" href="/docs/api/core/set-xlsx-table-export-backend/"><code>setXlsxTableExportBackend</code><span>Registers the optional table XLSX export implementation used by core.</span></a>
<a class="api-symbol-card" href="/docs/api/core/set-xlsx-table-import-backend/"><code>setXlsxTableImportBackend</code><span>Registers the optional table XLSX import implementation used by core.</span></a>
<a class="api-symbol-card" href="/docs/api/core/set-xlsx-workbook-backend/"><code>setXlsxWorkbookBackend</code><span>Registers the optional workbook XLSX implementation used by core.</span></a>
<a class="api-symbol-card" href="/docs/api/core/shift-a1-refs/"><code>shiftA1Refs</code><span>Shift relative A1 references in a formula by (dRow, dCol) — used when a formula is filled into other cells.</span></a>
<a class="api-symbol-card" href="/docs/api/core/to-csv/"><code>toCsv</code><span>CSV (UTF-8 BOM, CRLF). String values are injection-hardened (a leading = + - @ \t \r is prefixed with ').</span></a>
<a class="api-symbol-card" href="/docs/api/core/to-tsv/"><code>toTsv</code><span>TSV for a rectangular range (Excel/Sheets clipboard format).</span></a>
<a class="api-symbol-card" href="/docs/api/core/to-xlsx-table/"><code>toXlsxTable</code><span>Exports a table model through the registered optional XLSX backend.</span></a>
<a class="api-symbol-card" href="/docs/api/core/to-xlsx-workbook/"><code>toXlsxWorkbook</code><span>Formula-preserving, multi-sheet workbook export through the optional XLSX backend.</span></a>
<a class="api-symbol-card" href="/docs/api/core/validate-workbook-snapshot/"><code>validateWorkbookSnapshot</code><span>Validate and canonically order a schema-1 snapshot without hydrating runtime state.</span></a>
</div>

### Interfaces <span class="api-count">89</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core/cell-address/"><code>CellAddress</code><span>Zero-based address of one cell on a stable sheet ID.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-block/"><code>CellBlock</code><span>Sparse row-major cells bounded by one rectangular block.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-border/"><code>CellBorder</code><span>Visual border applied to one or more sides of a cell.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-borders/"><code>CellBorders</code><span>Per-side borders; all applies to any side not given its own border.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-change/"><code>CellChange</code><span>One committed cell edit, carrying enough to roll back.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-input-snapshot/"><code>CellInputSnapshot</code><span>View-aware editable snapshot of one cell, for hosts building a detached formula bar or cell inspector.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-note/"><code>CellNote</code><span>Serializable plain-text note anchored to a cell.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-paint-context/"><code>CellPaintContext</code><span>Read-only cell and canvas geometry supplied to a custom renderer.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-renderer/"><code>CellRenderer</code><span>Custom cell renderer hooks for the main-thread canvas or DOM overlay.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-style/"><code>CellStyle</code><span>Serializable formatting applied to a cell or used as a column default.</span></a>
<a class="api-symbol-card" href="/docs/api/core/change-event/"><code>ChangeEvent</code><span>Payload of the change event; flows OUT for API submission/reconcile.</span></a>
<a class="api-symbol-card" href="/docs/api/core/column/"><code>Column</code><span>Schema and default presentation for one workbook column.</span></a>
<a class="api-symbol-card" href="/docs/api/core/columnar-data/"><code>ColumnarData</code><span>Eager column-oriented values used to initialize a sheet.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-adapter/"><code>CommentAdapter</code><span>Host persistence contract for versioned comment threads.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-author-ref/"><code>CommentAuthorRef</code><span>Stable host-provided identity displayed on a comment message.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-coordinator-options/"><code>CommentCoordinatorOptions</code><span>Document identity and initial version for comment coordination.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-list-result/"><code>CommentListResult</code><span>Versioned comment-thread listing returned by a host adapter.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-message/"><code>CommentMessage</code><span>One immutable author message in a comment thread.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-mutation-request/"><code>CommentMutationRequest</code><span>Versioned comment mutation submitted to a host adapter.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-thread/"><code>CommentThread</code><span>Versioned discussion anchored to a document location.</span></a>
<a class="api-symbol-card" href="/docs/api/core/conditional-format-rule/"><code>ConditionalFormatRule</code><span>Ordered condition and style applied to a cell range.</span></a>
<a class="api-symbol-card" href="/docs/api/core/context-menu-context/"><code>ContextMenuContext</code><span>Cell and viewport coordinates resolved for one bundled context-menu opening.</span></a>
<a class="api-symbol-card" href="/docs/api/core/context-menu-item/"><code>ContextMenuItem</code><span>Built-in, separator, or custom callback row in the right-click menu.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-source/"><code>DataSource</code><span>Host callback that asynchronously loads cancellable row pages.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-source-page/"><code>DataSourcePage</code><span>One resolved row page returned by a DataSource.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-source-request/"><code>DataSourceRequest</code><span>Cancellable sheet and row interval requested from a DataSource.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-source-storage-options/"><code>DataSourceStorageOptions</code><span>Dense or allocation-lazy paged storage policy for datasource cells.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-validation-rule/"><code>DataValidationRule</code><span>One stable, range-scoped data-entry rule.</span></a>
<a class="api-symbol-card" href="/docs/api/core/document-validation-error/"><code>DocumentValidationError</code><span>Path-qualified validation failure for a document operation.</span></a>
<a class="api-symbol-card" href="/docs/api/core/grid/"><code>Grid</code><span>Imperative grid handle for document commands, events, rendering, and teardown.</span></a>
<a class="api-symbol-card" href="/docs/api/core/grid-actions/"><code>GridActions</code><span>Imperative operations the toolbar and context menu bind to; also exposed as Grid.actions.</span></a>
<a class="api-symbol-card" href="/docs/api/core/grid-config/"><code>GridConfig</code><span>Toolbar / feature configuration.</span></a>
<a class="api-symbol-card" href="/docs/api/core/grid-events/"><code>GridEvents</code><span>Payload map for events emitted by a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core/grid-options/"><code>GridOptions</code><span>Workbook, data, rendering, policy, and built-in UI options used to create a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core/grid-transaction/"><code>GridTransaction</code><span>An undoable transaction submitted through a Grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core/highlight-range/"><code>HighlightRange</code><span>A highlight target: a range plus an optional per-range color override.</span></a>
<a class="api-symbol-card" href="/docs/api/core/merge-range/"><code>MergeRange</code><span>Inclusive merged-cell rectangle in data-row/column coordinates.</span></a>
<a class="api-symbol-card" href="/docs/api/core/named-range-snapshot/"><code>NamedRangeSnapshot</code><span>Workbook-global or sheet-scoped named range used by formulas and persistence.</span></a>
<a class="api-symbol-card" href="/docs/api/core/packed-cell-block/"><code>PackedCellBlock</code><span>Dense row-major mutation payload.</span></a>
<a class="api-symbol-card" href="/docs/api/core/paged-store-stats/"><code>PagedStoreStats</code><span>Allocation and load statistics for one paged datasource sheet.</span></a>
<a class="api-symbol-card" href="/docs/api/core/pending-commit/"><code>PendingCommit</code><span>Immutable local operation batch awaiting a host acknowledgement.</span></a>
<a class="api-symbol-card" href="/docs/api/core/pending-commit-storage/"><code>PendingCommitStorage</code><span>Host-owned durable queue.</span></a>
<a class="api-symbol-card" href="/docs/api/core/persistence-adapter/"><code>PersistenceAdapter</code><span>Host load and commit contract for versioned workbook persistence.</span></a>
<a class="api-symbol-card" href="/docs/api/core/persistence-commit-request/"><code>PersistenceCommitRequest</code><span>Cancellable pending commit submitted to a persistence adapter.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-actor/"><code>PresenceActor</code><span>Public collaborator identity attached to presence updates.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-coordinator-options/"><code>PresenceCoordinatorOptions</code><span>Identity, privacy, and timing options for presence coordination.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-message/"><code>PresenceMessage</code><span>Ephemeral collaborator selection and activity update.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-overlay/"><code>PresenceOverlay</code><span>Ephemeral collaborator selection rendered above the grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-privacy-options/"><code>PresencePrivacyOptions</code><span>Controls which ephemeral collaborator details may be transmitted.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-transport/"><code>PresenceTransport</code><span>Host transport contract for ephemeral presence messages.</span></a>
<a class="api-symbol-card" href="/docs/api/core/protected-range/"><code>ProtectedRange</code><span>Serializable client UX policy.</span></a>
<a class="api-symbol-card" href="/docs/api/core/protection-request/"><code>ProtectionRequest</code><span>Local operation and protected-range context supplied to the host policy.</span></a>
<a class="api-symbol-card" href="/docs/api/core/range/"><code>Range</code><span>Inclusive rectangular cell range on a stable sheet ID.</span></a>
<a class="api-symbol-card" href="/docs/api/core/rebase-conflict/"><code>RebaseConflict</code><span>Reason and affected operations for an unsafe document rebase.</span></a>
<a class="api-symbol-card" href="/docs/api/core/remote-operation-options/"><code>RemoteOperationOptions</code><span>Classification metadata for host-supplied remote operations.</span></a>
<a class="api-symbol-card" href="/docs/api/core/remote-operation-source/"><code>RemoteOperationSource</code><span>Host subscription contract for ordered versioned operations.</span></a>
<a class="api-symbol-card" href="/docs/api/core/replace-result/"><code>ReplaceResult</code><span>Replacement count and refreshed search state returned by replace-all.</span></a>
<a class="api-symbol-card" href="/docs/api/core/resolved-cell/"><code>ResolvedCell</code><span>Authoritative source value, evaluated value, style, and load state for a cell.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-adapter/"><code>RevisionAdapter</code><span>Host persistence contract for revision history and restore.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-coordinator-options/"><code>RevisionCoordinatorOptions</code><span>Document identity and version options for revision coordination.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-restore-request/"><code>RevisionRestoreRequest</code><span>Versioned restore request submitted to a revision adapter.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-summary/"><code>RevisionSummary</code><span>Host-provided metadata describing a saved workbook revision.</span></a>
<a class="api-symbol-card" href="/docs/api/core/row-group/"><code>RowGroup</code><span>A collapsible row group (data-row range, end-inclusive), Sheets-style.</span></a>
<a class="api-symbol-card" href="/docs/api/core/row-metadata/"><code>RowMetadata</code><span>Persistent display and grouping metadata for one document row.</span></a>
<a class="api-symbol-card" href="/docs/api/core/search-options/"><code>SearchOptions</code><span>Case, whole-cell, sheet, and column constraints for grid search.</span></a>
<a class="api-symbol-card" href="/docs/api/core/search-result/"><code>SearchResult</code><span>Ordered matches and active index produced by a grid search.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sheet/"><code>Sheet</code><span>Workbook sheet schema used when creating a live grid.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code><span>Serializable complete state for one workbook sheet.</span></a>
<a class="api-symbol-card" href="/docs/api/core/snapshot-cell/"><code>SnapshotCell</code><span>Serializable cell value and optional style inside a snapshot block.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sort-key/"><code>SortKey</code><span>One key of a multi-column sort, applied in array order (first = primary).</span></a>
<a class="api-symbol-card" href="/docs/api/core/store/"><code>Store</code><span>Columnar workbook storage, query, transaction, and subscription contract.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-coordinator-options/"><code>SyncCoordinatorOptions</code><span>Document, version, durability, and online options for synchronization.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-mutation-record/"><code>SyncMutationRecord</code><span>Pending commit paired with its current synchronization status.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-state-snapshot/"><code>SyncStateSnapshot</code><span>Immutable observable synchronization state.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-version-gap-request/"><code>SyncVersionGapRequest</code><span>Contiguous-version recovery request produced when remote input skips ahead.</span></a>
<a class="api-symbol-card" href="/docs/api/core/theme/"><code>Theme</code><span>Resolved canvas colors, typography, and geometry used for painting.</span></a>
<a class="api-symbol-card" href="/docs/api/core/toolbar-item/"><code>ToolbarItem</code><span>Built-in, separator, or custom callback item in the grid toolbar.</span></a>
<a class="api-symbol-card" href="/docs/api/core/transaction/"><code>Transaction</code><span>Low-level Store transaction.</span></a>
<a class="api-symbol-card" href="/docs/api/core/transaction-application-options/"><code>TransactionApplicationOptions</code><span>Source and commit classification used when applying a transaction.</span></a>
<a class="api-symbol-card" href="/docs/api/core/versioned-comment-event/"><code>VersionedCommentEvent</code><span>Comment mutation paired with its assigned server version.</span></a>
<a class="api-symbol-card" href="/docs/api/core/versioned-operation/"><code>VersionedOperation</code><span>Remote document operations paired with a contiguous server version.</span></a>
<a class="api-symbol-card" href="/docs/api/core/visible-window-view/"><code>VisibleWindowView</code><span>One rectangular window of resolved cells, returned by Store.getVisibleWindow in a single call.</span></a>
<a class="api-symbol-card" href="/docs/api/core/workbook/"><code>Workbook</code><span>Live workbook schema containing ordered sheets and the active sheet ID.</span></a>
<a class="api-symbol-card" href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code><span>Schema-versioned serializable workbook document.</span></a>
<a class="api-symbol-card" href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code><span>Pluggable first-row-header, first-sheet table export backend.</span></a>
<a class="api-symbol-card" href="/docs/api/core/xlsx-table-import-backend/"><code>XlsxTableImportBackend</code><span>Pluggable table import backend.</span></a>
<a class="api-symbol-card" href="/docs/api/core/xlsx-workbook-backend/"><code>XlsxWorkbookBackend</code><span>Optional backend contract for complete workbook XLSX interchange.</span></a>
<a class="api-symbol-card" href="/docs/api/core/xlsx-workbook-options/"><code>XlsxWorkbookOptions</code><span>Workbook XLSX conversion options passed to the registered backend.</span></a>
<a class="api-symbol-card" href="/docs/api/core/xlsx-workbook-warning/"><code>XlsxWorkbookWarning</code><span>Structured fidelity warning emitted during workbook XLSX conversion.</span></a>
</div>

### Types <span class="api-count">42</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core/aggregate-op/"><code>AggregateOp</code><span>Column aggregate operation for Grid.aggregate / Store data ops.</span></a>
<a class="api-symbol-card" href="/docs/api/core/apply-transaction-result/"><code>ApplyTransactionResult</code><span>Outcome of applying a document transaction, including conflict, rejection, and no-op states.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-align/"><code>CellAlign</code><span>Horizontal text alignment supported by cell styles.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-format/"><code>CellFormat</code><span>How a column's cells are typed, parsed, and rendered: text verbatim, number via its numberFormat, date as an Excel-style serial (see date-serial.ts) rendered by a date numberFormat, and currency as a plain number…</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-load-state/"><code>CellLoadState</code><span>Datasource loading state for a resolved cell.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-scalar/"><code>CellScalar</code><span>A scalar that can be displayed directly.</span></a>
<a class="api-symbol-card" href="/docs/api/core/cell-value/"><code>CellValue</code><span>A cell's persisted input: a literal, a cross-reference, or a formula.</span></a>
<a class="api-symbol-card" href="/docs/api/core/column-filter/"><code>ColumnFilter</code><span>One column's filter predicate.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-anchor/"><code>CommentAnchor</code><span>Document location to which a comment thread is attached.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-coordinator-event/"><code>CommentCoordinatorEvent</code><span>State transition emitted by the comment coordinator.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-mutation/"><code>CommentMutation</code><span>Serializable operation that creates or updates comment state.</span></a>
<a class="api-symbol-card" href="/docs/api/core/comment-mutation-response/"><code>CommentMutationResponse</code><span>Applied, duplicate, or conflict acknowledgement for a comment mutation.</span></a>
<a class="api-symbol-card" href="/docs/api/core/conditional-format-predicate/"><code>ConditionalFormatPredicate</code><span>Predicate used to decide whether a conditional format applies.</span></a>
<a class="api-symbol-card" href="/docs/api/core/context-menu-action-name/"><code>ContextMenuActionName</code><span>Built-in action names accepted by custom context-menu rows.</span></a>
<a class="api-symbol-card" href="/docs/api/core/context-menu-items/"><code>ContextMenuItems</code><span>Static rows or a context-aware factory evaluated each time the menu opens.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-cell/"><code>DataCell</code><span>Datasource cell value with optional cell-specific styling.</span></a>
<a class="api-symbol-card" href="/docs/api/core/data-validation-condition/"><code>DataValidationCondition</code><span>Serializable condition enforced by a data-validation rule.</span></a>
<a class="api-symbol-card" href="/docs/api/core/document-op/"><code>DocumentOp</code><span>Exhaustive serializable operation union for workbook mutations.</span></a>
<a class="api-symbol-card" href="/docs/api/core/document-rebase-result/"><code>DocumentRebaseResult</code><span>Successful rebased operations or a conservative rebase conflict.</span></a>
<a class="api-symbol-card" href="/docs/api/core/document-validation-result/"><code>DocumentValidationResult</code><span>Success or structured errors returned by document validation.</span></a>
<a class="api-symbol-card" href="/docs/api/core/mutation-issue/"><code>MutationIssue</code><span>Structured warning or rejection produced while applying an operation.</span></a>
<a class="api-symbol-card" href="/docs/api/core/mutation-policy-mode/"><code>MutationPolicyMode</code><span>Atomic or partial handling for locally denied operations.</span></a>
<a class="api-symbol-card" href="/docs/api/core/operation-source/"><code>OperationSource</code><span>Whether a committed change originated locally or from remote host input.</span></a>
<a class="api-symbol-card" href="/docs/api/core/persistence-commit-response/"><code>PersistenceCommitResponse</code><span>Applied, duplicate, or conflict acknowledgement from persistence.</span></a>
<a class="api-symbol-card" href="/docs/api/core/persistence-error-code/"><code>PersistenceErrorCode</code><span>Stable category for a persistence failure.</span></a>
<a class="api-symbol-card" href="/docs/api/core/presence-coordinator-event/"><code>PresenceCoordinatorEvent</code><span>Connection or actor transition emitted by presence coordination.</span></a>
<a class="api-symbol-card" href="/docs/api/core/protection-resolver/"><code>ProtectionResolver</code><span>Host-owned client UX permission callback for protected mutations.</span></a>
<a class="api-symbol-card" href="/docs/api/core/query-capability/"><code>QueryCapability</code><span>Whether a query is complete for the currently loaded datasource pages.</span></a>
<a class="api-symbol-card" href="/docs/api/core/rebase-conflict-code/"><code>RebaseConflictCode</code><span>Stable conservative-rebase conflict category.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-coordinator-event/"><code>RevisionCoordinatorEvent</code><span>State or restore transition emitted by revision coordination.</span></a>
<a class="api-symbol-card" href="/docs/api/core/revision-restore-response/"><code>RevisionRestoreResponse</code><span>Applied or conflict acknowledgement for a revision restore.</span></a>
<a class="api-symbol-card" href="/docs/api/core/row-data/"><code>RowData</code><span>Object-shaped datasource row keyed by workbook column keys.</span></a>
<a class="api-symbol-card" href="/docs/api/core/selection/"><code>Selection</code><span>Current cell, range, row, column, or multi-range selection.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sheet-id/"><code>SheetId</code><span>Stable identifier used to address a workbook sheet.</span></a>
<a class="api-symbol-card" href="/docs/api/core/snapshot-grid-options/"><code>SnapshotGridOptions</code><span>Grid creation options accepted when hydrating a validated snapshot.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-activity-state/"><code>SyncActivityState</code><span>Current persistence activity reported by a sync coordinator.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-connection-state/"><code>SyncConnectionState</code><span>Host-controlled online state reported by synchronization.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-coordinator-event/"><code>SyncCoordinatorEvent</code><span>Queue, version, connection, or error transition emitted by synchronization.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sync-mutation-status/"><code>SyncMutationStatus</code><span>Lifecycle state of one local mutation in the synchronization queue.</span></a>
<a class="api-symbol-card" href="/docs/api/core/toolbar-action-name/"><code>ToolbarActionName</code><span>Built-in action names accepted by custom toolbar items.</span></a>
<a class="api-symbol-card" href="/docs/api/core/toolbar-icon/"><code>ToolbarIcon</code><span>Text, DOM node, or node factory used as toolbar icon content.</span></a>
<a class="api-symbol-card" href="/docs/api/core/validation-policy/"><code>ValidationPolicy</code><span>Reject-or-warn policy attached to a data-validation rule.</span></a>
</div>

### Variables <span class="api-count">4</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core/default-theme/"><code>DEFAULT_THEME</code><span>Default canvas theme used before CSS and explicit theme overrides.</span></a>
<a class="api-symbol-card" href="/docs/api/core/ref-cycle/"><code>REF_CYCLE</code><span>Sentinel shown for a reference that participates in a cycle.</span></a>
<a class="api-symbol-card" href="/docs/api/core/sheetwrite-clipboard-mime/"><code>SHEETWRITE_CLIPBOARD_MIME</code><span>Private-format MIME type used for rich Sheetwrite clipboard payloads.</span></a>
<a class="api-symbol-card" href="/docs/api/core/workbook-schema-version/"><code>WORKBOOK_SCHEMA_VERSION</code><span>Current workbook snapshot schema version accepted by Sheetwrite.</span></a>
</div>
