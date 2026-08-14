# @sheetwrite/core

## 0.4.0

### Minor Changes

- 41f6749: Remove the unsupported `cloneCellHyperlink` and `createHyperlinkId` root exports. Hyperlink behavior remains available through the documented grid APIs.

### Patch Changes

- 8457eca: Fall back observably to the main-thread renderer when a paint worker cannot initialize, cannot create a 2D context, or loses its context. The public worker acknowledgement type now includes `ready` and `fatal` lifecycle messages.
- dac694a: Re-rasterize the grid when a window moves between displays with different pixel densities instead of remaining blurry or oversized until the next interaction.
- 0e09ecc: Share cell-kind wire tags across the store, window reader, and paint worker to prevent internal WASM contract divergence.
- 41f6749: Exclude generated source maps from the published package while retaining JavaScript, declarations, styles, and unchanged browser runtime output.
- 41f6749: Pack visible-window numeric, kind, style, string-index, and conditional-format data into one validated transfer buffer, reducing ordinary window reads from seven output allocations to one.
- 41f6749: Compare render state with allocation-light scalar snapshots instead of rebuilding composite signature strings on every frame.
- 55b1f35: Stop exporting implementation-only helpers and types from internal modules, and gate package workspaces against new unused internal exports.
- b225783: Keep cached worker-renderer views valid across repeated paints so scrolling no longer produces blank or stale regions.
- 41f6749: Keep paged transaction admission and reference accounting isolated from dense store initialization while preserving existing resource limits.
- ce1e404: Keep uniform row geometry allocation-free until a custom row height requires dense indexing.
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
  - @sheetwrite/wasm@0.4.0

## 0.3.1

### Patch Changes

- Correct the core package release metadata and package-specific changelog without changing runtime behavior.
- Updated dependencies
  - @sheetwrite/wasm@0.3.1

## 0.3.0

### Minor Changes

- e551eb0: Introduce the canonical `SheetwriteError` envelope and stable error codes across initialization, data sources, rendering, persistence, synchronization, collaboration, and import/export boundaries, with serialization-safe context and explicit retryability.

## 0.2.0

### Minor Changes

- 6ed7572: Harden collaboration, persistence, paged datasource, snapshot, and spreadsheet interchange boundaries; add bounded XLSX import/export with independent producer coverage; improve large-dataset cache behavior and browser rendering; and ship complete framework, database, collaboration, interoperability, and performance showcases.
- 87fadb7: Strengthen collaboration recovery, bounded persistence and paging, snapshot resource enforcement, and framework adapter contracts.

  Replace the optional XLSX implementation with a bounded OOXML codec, broaden workbook fidelity and producer conformance, and add deterministic performance evidence.

  Ship searchable capability-owned evaluation surfaces for framework integration, database lifecycle, collaboration, interoperability, and million-row performance.

### Patch Changes

- Updated dependencies [6ed7572]
- Updated dependencies [87fadb7]
  - @sheetwrite/wasm@0.2.0
