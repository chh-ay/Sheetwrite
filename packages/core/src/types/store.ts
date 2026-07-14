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
}

export interface ResolvedCell {
  resolved: CellScalar;
  style: CellStyle;
}

export type CellLoadState = "unloaded" | "loaded-empty" | "loaded-value" | "local-edit";

export interface PagedStoreStats {
  chunks: number;
  loadedCells: number;
  dirtyCells: number;
  allocatedBytes: number;
  fullyLoaded: boolean;
}

export type QueryCapability =
  | { status: "complete" }
  | { status: "incomplete"; loadedCells: number; totalCells: number };

export interface Store {
  getWorkbook(): Workbook;
  /**
   * Single-cell read for interactions, API reads, and tests.
   * NOT for the render hot path — renderers use `getVisibleWindow`.
   */
  getCell(addr: CellAddress): ResolvedCell;
  /** Formula source at `addr`, or null when the cell is not a formula. */
  getFormula(addr: CellAddress): string | null;
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
  /** Explicit partial-data state for paged datasource stores. */
  queryCapability?(sheet: SheetId): QueryCapability;
  /** Loaded/empty/local state; dense stores always return a loaded state. */
  getCellLoadState?(addr: CellAddress): CellLoadState;
  /** Release paged dirty pins after server acknowledgement. */
  acknowledgeOperations?(operations: readonly DocumentOp[]): void;
  /** Deterministic, JSON-safe authoritative runtime document. */
  exportSnapshot?(): WorkbookSnapshot;
  /** Displayed row count after any active sort/filter view. */
  viewRowCount(sheet: SheetId): number;
}
