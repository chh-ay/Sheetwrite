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

/** Cancellable sheet and row interval requested from a DataSource. */
export interface DataSourceRequest {
  sheet: SheetId;
  start: number;
  end: number;
  signal: AbortSignal;
  revision: number;
}

/** One resolved row page returned by a DataSource. */
export interface DataSourcePage {
  start: number;
  rows: RowData[];
  revision?: string | number;
}

/** Host callback that asynchronously loads cancellable row pages. */
export interface DataSource {
  /** Loads the requested half-open row interval; implementations should stop work when its signal aborts. */
  getRows(request: DataSourceRequest): Promise<DataSourcePage>;
}

/** Dense or allocation-lazy paged storage policy for datasource cells. */
export interface DataSourceStorageOptions {
  /** Storage engine. Dense is the default. */
  mode?: "dense" | "paged";
  /** Power-of-two row chunk size. Defaults to 4096. */
  chunkRows?: number;
  /** Clean-chunk cache budget. Dirty and visible chunks may exceed it. */
  cacheBytes?: number;
}
