// Row, columnar, datasource, and aggregate contracts for @sheetwrite/core.
// No runtime values live here.

import type { CellScalar, CellStyle, CellValue } from "./cell.js";
import type { SheetId } from "./coordinates.js";

/** Column aggregate operation for `Grid.aggregate` / `Store` data ops. */
export type AggregateOp = "sum" | "avg" | "min" | "max" | "count";

/** Datasource cell value with optional cell-specific styling. */
export type DataCell = CellScalar | CellValue | { value: CellValue; style?: CellStyle };

/** Object-shaped datasource row keyed by workbook column keys. */
export type RowData = Record<string, DataCell>;

/** Eager column-oriented values used to initialize a sheet. */
export interface ColumnarData {
  rowCount: number;
  columns: Record<string, ArrayLike<CellScalar | CellValue>>;
}

/** One half-open run of workbook columns, in stable sheet order. */
export interface DataSourceColumnBand {
  /** Zero-based workbook column index of the first key. */
  start: number;
  /** Exclusive workbook column index after the last key. */
  end: number;
  /** Stable workbook column keys for every index in `[start, end)`. */
  keys: readonly string[];
}

/** Cancellable sheet rectangle requested from a DataSource. */
export interface DataSourceRequest {
  /** Paging contract version. */
  protocol: 2;
  sheet: SheetId;
  /** Inclusive row index. */
  start: number;
  /** Exclusive row index. */
  end: number;
  /** Exact visible, frozen, or prefetched column runs required by the Grid. */
  columns: readonly DataSourceColumnBand[];
  signal: AbortSignal;
  revision: number;
}

/** One resolved rectangular page returned by a DataSource. */
export interface DataSourcePage {
  /** Paging contract version. */
  protocol: 2;
  /** Inclusive row index of the first returned row. */
  start: number;
  /** Exact column runs represented by every returned row. */
  columns: readonly DataSourceColumnBand[];
  rows: RowData[];
  revision?: string | number;
}

/** Declares whether a source can load only the requested column runs. */
export interface DataSourceCapabilities {
  protocol: 2;
  columns: "windowed" | "full-width";
}

/** Host callback that asynchronously loads cancellable rectangular pages. */
export interface DataSource {
  readonly capabilities: DataSourceCapabilities;
  /** Loads the requested rows and columns; implementations should stop work when its signal aborts. */
  getRows(request: DataSourceRequest): Promise<DataSourcePage>;
}

/** Dense or allocation-lazy paged storage policy for datasource cells. */
export interface DataSourceStorageOptions {
  /** Storage engine. Dense is the default. */
  mode?: "dense" | "paged";
  /** Paged row chunk size; defaults to 4,096 and is normalized to a power of two. */
  chunkRows?: number;
  /** Per-sheet clean-chunk cache budget; defaults to 32 MiB. Sparse local edits are accounted separately; dirty and visible chunks may exceed it. */
  cacheBytes?: number;
  /** Maximum sparse local edits retained outside the clean page cache. Defaults to 1,000,000. */
  dirtyCellLimit?: number;
}
