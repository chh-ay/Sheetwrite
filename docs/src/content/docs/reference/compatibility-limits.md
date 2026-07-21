---
title: Compatibility and limits
description: Explicit compatibility boundaries, resource ceilings, tuning defaults, limit behavior, and override paths.
---

| Area | Supported contract | Boundary |
| --- | --- | --- |
| Data | Eager columnar data or cancellable datasource pages; dense and allocation-lazy paged storage | Full-sheet queries and exports are incomplete until required pages load |
| Formulas | Persisted formula source, A1/range references, named ranges, supported deterministic functions | No dynamic arrays/spills, external `IMPORT*`, custom JavaScript, random functions, charts, or pivots |
| Protection | Serializable client interaction policy with atomic/partial local mutation behavior | Never server authorization; remote operations bypass local UX policy |
| Collaboration | Host sequencing, stable mutation IDs, durable optimistic edits, ordered remote operations, presence/comments/revisions, conservative rebase | No bundled server, CRDT, or general OT; ambiguous structural/formula conflicts require host UX |
| Worker | OffscreenCanvas rendering with capability/startup fallback | Custom function renderers cannot transfer to the worker |
| XLSX | Table interchange plus supported workbook formulas/styles/merges/dimensions/frozen panes/names and Sheetwrite metadata | Unsupported workbook features are warned, flattened, or dropped; not full Excel fidelity |
| Accessibility | ARIA grid mirror for the visible virtualized window with keyboard-driven updates | The full document is not duplicated into hidden DOM |

Compatibility statements are feature contracts, not claims of Excel or Google Sheets parity.

The tables below describe the owning source definition, not generated API signatures. Ceilings are inclusive unless a row says otherwise. MiB means 1,048,576 bytes. “Compatibility” identifies an external or product boundary; “resource defense” identifies bounded allocation or retained state; “interaction tuning” identifies a non-failing operational default.

## Rendering, interaction, and paged data

| Owner / resource | Default and unit | Why / evidence class | Behavior at the boundary | Supported override |
| --- | --- | --- | --- | --- |
| `GridOptions.overscan` / `DEFAULT_OVERSCAN` | 6 row and visible-column positions per viewport edge | Interaction tuning: keep the virtual paint and ARIA windows close to the viewport | It is not a document ceiling; the window is clipped to available rows/columns | `GridOptions.overscan` or `grid.setOverscan()`; `0` disables the buffer |
| `measureMaxElementHeight` | Measured browser clamp minus 4,096 CSS px; 15,000,000 CSS px fallback | Compatibility: browser layout and scroll-offset clamps vary | Taller logical sheets use scaled scrolling while the DOM sizer stays at the safe clamp | Not configurable |
| `AUTO_FIT_CHUNK_CELLS` | 16,384 cells per store read | Resource defense: bound one synchronous auto-fit read | Larger scans continue in frame-scheduled chunks and commit after the scan | Not configurable |
| `DEFAULT_COL_WIDTH` | 100 CSS px | Interaction tuning: keep synthesized sheet and padding columns consistent | Used for generated columns; it is not a width ceiling | No global setting; supply or update individual column widths |
| [`DEFAULT_SIMPLE_COLUMN_WIDTH`](/docs/api/core-adapter/default-simple-column-width/) | 120 CSS px | Interaction tuning: give adapter-created schemas an explicit usable width | Used only when a simple column omits `width` | `SimpleColumn.width` |
| `DataSourceStorageOptions.chunkRows` / `DEFAULT_PAGE_CHUNK_ROWS` | 4,096 rows per chunk | Resource defense: allocation-lazy page granularity | Chunks allocate on load/edit; a positive non-power-of-two value is rounded up to a power of two | `GridOptions.datasourceStorage.chunkRows` or `SheetwriteStoreOptions.chunkRows` |
| `DataSourceStorageOptions.cacheBytes` / `DEFAULT_PAGED_CACHE_BYTES` | 32 MiB per paged sheet | Resource defense: bound clean cached chunks | Before a new chunk would exceed the budget, the least-recent clean, unpinned chunks are evicted; dirty/visible chunks may exceed it | `GridOptions.datasourceStorage.cacheBytes` or `SheetwriteStoreOptions.cacheBytes`; `0` disables eviction |
| `DataSourceStorageOptions.dirtyCellLimit` / `DEFAULT_PAGED_DIRTY_CELL_LIMIT` | 1,000,000 sparse local cells per paged sheet | Resource defense: bound dirty overlay memory independently of clean cached chunks | A transaction that would add cell 1,000,001 is rejected atomically with a `paged-dirty-cells` resource-limit issue; rewrites of already-dirty cells do not consume more capacity | `GridOptions.datasourceStorage.dirtyCellLimit` or `SheetwriteStoreOptions.dirtyCellLimit` |
| `Grid.distinctValues` | 1,000 distinct values | Resource defense: bound the default filter-menu result | Returns the first 1,000 distinct resolved values in first-seen order | Pass `limit`; `0` requests an uncapped scan |
| `UndoManager` | 200 transactions | Resource defense: bound retained undo resources | Pushing entry 201 disposes the oldest undo entry | Not configurable through the public `Grid` API |

The accessibility mirror uses the same virtual window and overscan as the canvas; it has no separate full-document DOM budget. See [datasource paging and storage](/docs/guides/configuration/#datasource-pages), [data operations](/docs/guides/data-operations/), and [the visible-window accessibility limit](/docs/guides/accessibility/#limitation-the-mirror-reflects-the-visible-window).

## Formula evaluation

| Owner / resource | Default and unit | Why / evidence class | Behavior at the boundary | Supported override |
| --- | --- | --- | --- | --- |
| `PARSE_RECURSION_LIMIT` | 256 nested parser levels | Resource defense: bound recursive formula parsing | Deeper syntax is a malformed formula and resolves to `#VALUE!` | Not configurable |
| `FORMULA_RECURSION_LIMIT` | 256 dependency/evaluation levels | Resource defense: bound recursive dependency evaluation | A deeper dependency or expression resolves to `#NUM!` | Not configurable |
| `RANGE_CELL_LIMIT` | 1,000,000 materialized cells per formula range | Resource defense: bound range/matrix allocation | An oversized range resolves to `#NUM!` | Not configurable |

See [formula functions, errors, and compatibility](/docs/guides/formulas/).

## Transactions and snapshots

[`DEFAULT_TRANSACTION_RESOURCE_LIMITS`](/docs/api/core/default-transaction-resource-limits/) owns the atomic mutation defaults. A transaction at the ceiling is accepted; exceeding either ceiling returns a `resource-limit` rejection and applies none of an atomic transaction.

| Owner / resource | Default and unit | Why / evidence class | Behavior above the ceiling | Supported override |
| --- | --- | --- | --- | --- |
| `maxOperations` | 10,000 `DocumentOp` objects per transaction | Resource defense: bound object-heavy validation and dispatch | Transaction is rejected | `GridOptions.transactionResourceLimits`, `SheetwriteStoreOptions.transactionResourceLimits`, or an explicit limit passed to `validateTransactionResources` |
| `maxEncodedBytes` | 8 MiB of UTF-8 JSON per operation array | Resource defense: bound exact payload inspection | Transaction is rejected | Same paths as `maxOperations` |

[`DEFAULT_SNAPSHOT_RESOURCE_LIMITS`](/docs/api/core/default-snapshot-resource-limits/) owns validation and allocation defaults. Exceeding one produces a path-qualified validation error or `SnapshotResourceError` before store allocation; an allocation failure within a configured ceiling still surfaces as a resource failure.

| Owner / resource | Default and unit | Why / evidence class | Behavior above the ceiling | Supported override |
| --- | --- | --- | --- | --- |
| `maxSheets` | 256 sheets per workbook | Resource defense: bound sheet-indexed schema/store state | Snapshot or direct workbook construction is rejected | `SnapshotValidationOptions.resourceLimits`, `SheetwriteStoreOptions.snapshotResourceLimits`, or `SnapshotGridOptions.snapshotResourceLimits` |
| `maxRowsPerSheet` | 1,000,000 rows per sheet | Compatibility: million-row allocation-lazy sheet contract | Rejected before allocation | Same snapshot resource-limit paths |
| `maxColumnsPerSheet` | 16,384 columns per sheet | Compatibility: worksheet width shared with XLSX | Rejected before allocation | Same snapshot resource-limit paths |
| `maxMetadataEntries` | 1,000,000 aggregate entries | Resource defense: bound names and sheet metadata collections | Rejected during resource preflight | Same snapshot resource-limit paths |
| `maxSerializedBytes` | 64 MiB of UTF-8 JSON | Resource defense: bound snapshot JSON-safety inspection | Validation returns a resource-limit error | Same snapshot resource-limit paths |
| `maxLogicalCellsPerSheet` | 4,294,967,295 row-by-column cells per sheet | Resource defense: cap logical area even when paged storage defers allocation | Rejected before dense or paged allocation | Same snapshot resource-limit paths |
| `maxDenseCells` | 5,000,000 aggregate cells per dense workbook | Resource defense: bound eager allocation | Dense construction is rejected; paged storage does not consume this budget | Same snapshot resource-limit paths; choose `storage: "paged"` for allocation-lazy data |

See [persistence and recovery](/docs/guides/persistence/) and [document operations](/docs/reference/document-operations/).

## Delimited text

[`DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS`](/docs/api/core/default-delimited-text-resource-limits/) owns synchronous CSV/TSV defaults. Except for the writer window, exceeding a ceiling throws `DelimitedTextResourceError` before the next oversized parse/encode allocation; no partial string is returned.

| Resource | Default and unit | Why / evidence class | Behavior at or above the boundary | Supported override |
| --- | --- | --- | --- | --- |
| `maxInputBytes` | 32 MiB UTF-8 input | Resource defense: bound the caller-owned string before parser allocations | At the ceiling parses; above it throws | `DelimitedTextOptions.resourceLimits.maxInputBytes` |
| `maxOutputBytes` | 64 MiB UTF-8 output, including BOM | Resource defense: bound the single returned string | At the ceiling returns; above it throws | `DelimitedTextOptions.resourceLimits.maxOutputBytes` |
| `maxRows` | 1,000,000 syntactic records | Compatibility: million-row data contract | Record 1,000,001 throws | `DelimitedTextOptions.resourceLimits.maxRows` |
| `maxColumns` | 16,384 fields in one record | Compatibility: worksheet width | Field 16,385 in one record throws | `DelimitedTextOptions.resourceLimits.maxColumns` |
| `maxCells` | 1,000,000 aggregate fields | Resource defense: bound parser arrays and encoder work | Aggregate field 1,000,001 throws | `DelimitedTextOptions.resourceLimits.maxCells` |
| `maxFieldBytes` | 1 MiB decoded UTF-8 per field | Resource defense: prevent one quoted field dominating memory | One byte above the ceiling throws | `DelimitedTextOptions.resourceLimits.maxFieldBytes` |
| `maxWriterWindowRows` | 4,096 rows per packed store read | Resource defense: bound each synchronous store window | Export continues with the next window; this is not a total-row ceiling | `DelimitedTextOptions.resourceLimits.maxWriterWindowRows` |

The override object accepts positive safe integers. CSV and TSV still return complete in-memory strings; raising byte/cell ceilings is not streaming. See [data import and export](/docs/guides/data-operations/#export).

## Synchronization and presence

[`DEFAULT_SYNC_COORDINATOR_LIMITS`](/docs/api/core/default-sync-coordinator-limits/) owns remote-input and durable-queue defaults. All fields accept positive safe-integer overrides through `SyncCoordinatorOptions.limits`.

| Resource | Default and unit | Why / evidence class | Behavior at or above the boundary | Supported override |
| --- | --- | --- | --- | --- |
| `maxMutationIdBytes` | 256 UTF-8 bytes per mutation ID | Resource defense: IDs cross transport and persistence boundaries | At the ceiling accepted; an oversized ID is a typed protocol error | `limits.maxMutationIdBytes` |
| `maxOperationsPerVersion` | 10,000 operations per remote version | Resource defense: match one atomic transaction | At the ceiling accepted; above it emits a protocol error and reload requirement | `limits.maxOperationsPerVersion` |
| `maxVersionPayloadBytes` | 8 MiB UTF-8 JSON per remote version | Resource defense: match one atomic transaction payload | At the ceiling accepted; above it emits a protocol error and reload requirement | `limits.maxVersionPayloadBytes` |
| `maxFutureVersionDistance` | 1,024 versions ahead | Recovery bound: avoid retaining an unbounded gap | A greater distance clears the gap buffer and requests reload/recovery | `limits.maxFutureVersionDistance` |
| `maxBufferedVersions` | 256 future versions | Resource defense: bound retained gap count | The next version clears the gap buffer and requests reload/recovery | `limits.maxBufferedVersions` |
| `maxBufferedOperations` | 40,000 aggregate operations | Resource defense: bound retained gap work | The operation that would exceed it clears the gap buffer and requests reload/recovery | `limits.maxBufferedOperations` |
| `maxBufferedBytes` | 32 MiB aggregate UTF-8 JSON | Resource defense: bound retained gap payloads | The operation that would exceed it clears the gap buffer and requests reload/recovery | `limits.maxBufferedBytes` |
| `maxRecentAcknowledgements` | 4,096 mutation IDs | Resource defense: bound echo-deduplication state | The oldest ID expires; a later stale echo is a reload-requiring protocol violation | `limits.maxRecentAcknowledgements` |
| `maxPendingCommits` | 10,000 pending commits | Durability bound: cap retained offline work | At the ceiling capacity is `full`; another local transaction is rejected atomically | `limits.maxPendingCommits` |
| `maxPendingOperations` | 100,000 aggregate pending operations | Durability bound: cap retained offline work | At the ceiling capacity is `full`; a transaction that would exceed it is rejected | `limits.maxPendingOperations` |
| `maxPendingEncodedBytes` | 128 MiB aggregate UTF-8 JSON | Durability bound: cap retained offline payloads | At the ceiling capacity is `full`; a transaction that would exceed it is rejected | `limits.maxPendingEncodedBytes` |

`PresenceCoordinator` owns its independent ephemeral defaults:

| Resource | Default and unit | Why / evidence class | Behavior at the boundary | Supported override |
| --- | --- | --- | --- | --- |
| `heartbeatMs` | 15,000 ms | Interaction tuning: periodic publish and stale pruning | Timer publishes/prunes each interval | `PresenceCoordinatorOptions.heartbeatMs`; `0` disables the timer |
| `timeoutMs` | 45,000 ms | Interaction tuning: three default heartbeat intervals of silence | An actor at or beyond the idle cutoff is expired | `PresenceCoordinatorOptions.timeoutMs` |
| `maxActors` | 32 remote actors | Resource defense: bound overlay state | Receiving a new actor at capacity evicts the oldest actor | `PresenceCoordinatorOptions.maxActors` (minimum 1) |
| `maxRangesPerActor` | 8 selection ranges | Resource defense: bound payload and overlay work | Additional outbound/inbound ranges are truncated | `PresenceCoordinatorOptions.maxRangesPerActor` (minimum 1) |

See [durable commits, version gaps, and presence](/docs/guides/collaboration/).

## XLSX codec

[`DEFAULT_XLSX_RESOURCE_LIMITS`](/docs/api/core/default-xlsx-resource-limits/) owns every optional codec path. Each ceiling is inclusive; exceeding one throws `XlsxResourceError` and returns no partial workbook. Override `maxCells` through `XlsxWorkbookOptions.maxCells`; override every other field through `XlsxWorkbookOptions.resourceLimits`.

| Resource | Default and unit | Why / evidence class | Behavior above the ceiling | Supported override |
| --- | --- | --- | --- | --- |
| `maxInputBytes` | 32 MiB compressed input | Resource defense: bound caller input | Import throws before ZIP parsing | `resourceLimits.maxInputBytes` |
| `maxOutputBytes` | 128 MiB encoded output | Resource defense: bound the returned byte array | Export throws during preflight or after encoding | `resourceLimits.maxOutputBytes` |
| `maxArchiveEntries` | 1,024 ZIP entries | Resource defense: bound archive fan-out | Import/export throws | `resourceLimits.maxArchiveEntries` |
| `maxEntryUncompressedBytes` | 64 MiB per ZIP entry | Resource defense: bound one inflated/encoded part | Import/export throws | `resourceLimits.maxEntryUncompressedBytes` |
| `maxTotalUncompressedBytes` | 256 MiB aggregate ZIP content | Resource defense: bound total inflated/encoded parts | Import/export throws | `resourceLimits.maxTotalUncompressedBytes` |
| `maxCompressionRatio` | 100:1 uncompressed/compressed | Resource defense: reject zip-bomb-like entries | Import throws | `resourceLimits.maxCompressionRatio` |
| `maxSheets` | 256 worksheets | Resource defense: bound workbook collections | Import/export throws | `resourceLimits.maxSheets` |
| `maxRowsPerSheet` | 1,048,576 rows per worksheet | Compatibility: SpreadsheetML worksheet height | Import/export throws | `resourceLimits.maxRowsPerSheet` |
| `maxColumnsPerSheet` | 16,384 columns per worksheet | Compatibility: SpreadsheetML worksheet width | Import/export throws | `resourceLimits.maxColumnsPerSheet` |
| `maxCells` | 1,000,000 cells accounted by the conversion path | Resource defense: bound conversion work | Import/export throws | Top-level `XlsxWorkbookOptions.maxCells` |
| `maxMerges` | 100,000 aggregate merged ranges | Resource defense: bound merge collections | Import/export throws | `resourceLimits.maxMerges` |
| `maxSharedStrings` | 1,000,000 shared-string entries | Resource defense: bound the shared-string table | Import throws | `resourceLimits.maxSharedStrings` |
| `maxStyles` | 65,536 style-related records | Resource defense: bound style tables | Import/export throws | `resourceLimits.maxStyles` |
| `maxXmlElements` | 2,000,000 elements per XML part | Resource defense: bound parser nodes | Import throws | `resourceLimits.maxXmlElements` |
| `maxXmlDepth` | 64 nested elements per XML part | Resource defense: bound parser nesting | Import throws | `resourceLimits.maxXmlDepth` |
| `maxXmlAttributesPerElement` | 128 attributes per element | Resource defense: bound per-node parsing | Import throws | `resourceLimits.maxXmlAttributesPerElement` |
| `maxXmlTextBytes` | 16 MiB UTF-8 text per element or attribute | Resource defense: bound XML text accumulation | Import/export throws | `resourceLimits.maxXmlTextBytes` |

Table and workbook conversions account cells according to the active path (for example, table export accounts its rectangular table). Raising dimensions does not add fidelity for unsupported workbook features. See [XLSX compatibility](/docs/guides/data-operations/#xlsx-compatibility).

## Related guides

- [Supported formulas and formula errors](/docs/guides/formulas/#supported-formulas)
- [Datasource pages and allocation-lazy storage](/docs/guides/configuration/#datasource-pages)
- [Data operations and export](/docs/guides/data-operations/)
- [Accessibility limits](/docs/guides/accessibility/)
- [Persistence and recovery](/docs/guides/persistence/)
- [Collaboration and presence](/docs/guides/collaboration/)
- [Worker fallback](/docs/guides/worker-rendering/)
