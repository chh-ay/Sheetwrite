// Visible-window and storage contracts for @sheetwrite/core.
// No runtime values live here.

import type { CellScalar, CellStyle, Column } from "./cell.js";
import type { CellAddress, SheetId } from "./coordinates.js";
import type {
  DocumentOp,
  MutationPolicyMode,
  ProtectionResolver,
  Workbook,
  WorkbookSnapshot,
} from "./document.js";
import type {
  ApplyTransactionResult,
  ChangeEvent,
  Transaction,
  TransactionApplicationOptions,
} from "./transaction.js";

/** Retained logical payload and allocated capacity attributed to one exclusive owner. */
export interface ResourceOwnerBytes {
  readonly owner: string;
  /** Bytes containing live logical payload. Never includes runtime observations. */
  readonly logicalBytes: number;
  /** Container capacity owned exclusively by this owner. */
  readonly allocatedBytes: number;
  readonly entries: number;
  readonly measurement:
    | "exact-capacity"
    | "hash-capacity-v1"
    | "typed-array-byte-length"
    | "utf16-upper-bound"
    | "entry-count-only";
}

/**
 * One rectangular window of resolved cells, returned by `Store.getVisibleWindow`
 * in a single call. The renderer paints from this view and MUST NOT call
 * `Store.getCell` per cell. `styleIds` are view-local indices into this view's
 * compact `styles` dictionary; on the worker renderer path, `styleIds.buffer` is
 * transferred during paint, so main-thread code must not read it after `paint`.
 *
 * Lifetime: valid until the next store mutation or window refresh.
 */
export interface VisibleWindowView {
  sheet: SheetId;
  /** end-exclusive row range */
  rows: { start: number; end: number };
  /** visible column indices, in paint order */
  cols: readonly number[];
  /** row-major resolved values, length `(end-start) * cols.length` */
  values: ArrayLike<CellScalar>;
  /** row-major view-local style ids, same length as `values` */
  styleIds: Uint32Array;
  /** compact window style dictionary indexed by `styleIds` */
  styles: readonly CellStyle[];
  /** Raw cell tags for worker transfer; internal fast path. */
  valueKinds?: Uint8Array;
  /** Raw numeric payloads for worker transfer; internal fast path. */
  numberValues?: Float64Array;
  /** Raw global string-pool ids for worker transfer; `0xffffffff` means none. */
  stringPoolIds?: Uint32Array;
  /** Raw local-string indices for formula errors; `-1` means none. */
  stringLocalIds?: Int32Array;
  /** String-pool ids resolved by this window and safe for worker cache updates. */
  stringPoolUpdateIds?: Uint32Array;
  /** String values parallel to `stringPoolUpdateIds`. */
  stringPoolUpdateValues?: readonly string[];
  /** Local non-pooled strings, currently formula error sentinels. */
  localStrings?: readonly string[];
  /** Internal count of WASM boundary calls used to produce this window. */
  ffiCalls?: number;
  /** Every wasm-bindgen method/accessor/free crossing used by diagnostics. */
  ffiBoundaryCalls?: number;
  /** Exact copied input bytes for this packed boundary operation. */
  ffiInputBytes?: number;
  /** Exact copied output bytes for this packed boundary operation. */
  ffiOutputBytes?: number;
  /** Largest individual copied buffer/string payload in this operation. */
  ffiLargestTransferBytes?: number;
}

interface ClipboardFormulaEntry {
  readonly offset: number;
  readonly source: string;
}

interface ClipboardRefEntry {
  readonly offset: number;
  readonly target: CellAddress;
}

/** Packed base-state selection read used by clipboard serialization. */
export interface ClipboardWindowView {
  readonly sheet: SheetId;
  readonly viewRows: { start: number; end: number };
  readonly dataRows: Uint32Array;
  readonly cols: readonly number[];
  readonly values: ArrayLike<CellScalar>;
  readonly styleIds: Uint32Array;
  readonly styles: readonly CellStyle[];
  /** `1` for runtime spill children that have no independent clipboard identity. */
  readonly spillDerived: Uint8Array;
  readonly formulas: readonly ClipboardFormulaEntry[];
  readonly refs: readonly ClipboardRefEntry[];
  readonly ffiCalls: number;
  readonly transferredElements: number;
}

/** Authoritative source value, evaluated value, style, and load state for a cell. */
export interface ResolvedCell {
  resolved: CellScalar;
  style: CellStyle;
}

/** Datasource loading state for a resolved cell. */
export type CellLoadState = "unloaded" | "loaded-empty" | "loaded-value" | "local-edit";

/** Allocation and load statistics for one paged datasource sheet. */
export interface PagedStoreStats {
  chunks: number;
  loadedCells: number;
  dirtyCells: number;
  allocatedBytes: number;
  /** Sparse local-edit overlay bytes, excluded from the clean chunk cache budget. */
  dirtyAllocatedBytes: number;
  fullyLoaded: boolean;
}

/** Whether a query is complete for the currently loaded datasource pages. */
export type QueryCapability =
  | { status: "complete" }
  | { status: "incomplete"; loadedCells: number; totalCells: number };

/** Columnar workbook storage, query, transaction, and subscription contract. */
export interface Store {
  getWorkbook(): Workbook;
  /**
   * Single-cell read for interactions, API reads, and tests.
   * NOT for the render hot path — renderers use `getVisibleWindow`.
   */
  getCell(addr: CellAddress): ResolvedCell;
  /** Formula source at `addr`, or null when the cell is not a formula. */
  getFormula(addr: CellAddress): string | null;
  /** Owning dynamic-array formula cell, or null when `addr` is not spilled. */
  getSpillAnchor(addr: CellAddress): CellAddress | null;
  /** Plain-reference target at `addr`, or null when the cell is not a ref. */
  getRefTarget(addr: CellAddress): CellAddress | null;
  /**
   * Recompute volatile formulas (`TODAY`/`NOW`) from one captured instant.
   * The supplied Date is interpreted as an absolute UTC instant.
   */
  recalculateVolatile(now?: Date): void;
  /** Bulk read of a visible window; the only read a renderer should use per frame. */
  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView;
  /**
   * Optional packed canonical data-row window used by file export. Unlike
   * `getVisibleWindow`, sort/filter state never remaps `rows`.
   */
  getDataWindow?(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView;
  /**
   * Optional packed clipboard read. Custom stores may omit it; the controller
   * preserves the per-cell Store fallback contract.
   */
  getClipboardWindow?(
    sheet: SheetId,
    viewRows: { start: number; end: number },
    cols: readonly number[],
  ): ClipboardWindowView;
  /**
   * Ensure a sheet can address at least `columns.length` columns without
   * producing user changes or dirty patches. Used for presentation padding.
   */
  ensureColumns(sheet: SheetId, columns: readonly Column[]): void;
  /**
   * Apply a low-level storage transaction.
   *
   * This bypasses Grid read-only checks and Grid undo/redo history. Use
   * `Grid.applyTransaction` for normal host-driven edits.
   * Queued and flushed at a barrier — never reentrant.
   */
  applyTransaction(
    tx: Transaction,
    options?: TransactionApplicationOptions,
  ): ApplyTransactionResult;
  /**
   * Configure host-owned protected-range permissions. The resolver is synchronous
   * so every local mutation ingress shares one atomic commit barrier.
   */
  setProtectionResolver?(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
  on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
  /** Opt in to per-cell before/after capture for packed and clear operations. */
  setDetailedChangeCapture?(enabled: boolean): void;
  /** Explicit partial-data state for paged datasource stores. */
  queryCapability?(sheet: SheetId): QueryCapability;
  /** Loaded/empty/local state; dense stores always return a loaded state. */
  getCellLoadState?(addr: CellAddress): CellLoadState;
  /** Release sparse paged edits after server acknowledgement. */
  acknowledgeOperations?(operations: readonly DocumentOp[], storageRevision?: bigint): void;
  /** Deterministic, JSON-safe authoritative runtime document. */
  exportSnapshot?(): WorkbookSnapshot;
  /** Displayed row count after any active sort/filter view. */
  viewRowCount(sheet: SheetId): number;
}
