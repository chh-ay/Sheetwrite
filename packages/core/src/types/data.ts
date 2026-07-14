// Row, columnar, datasource, and aggregate contracts for @sheetwrite/core.
// No runtime values live here.

import type { CellScalar, CellStyle, CellValue } from "./cell.js";
import type { SheetId } from "./coordinates.js";

/** Column aggregate operation for `Grid.aggregate` / `Store` data ops. */
export type AggregateOp = "sum" | "avg" | "min" | "max" | "count";

export type DataCell = CellScalar | CellValue | { value: CellValue; style?: CellStyle };

export type RowData = Record<string, DataCell>;

export interface ColumnarData {
  rowCount: number;
  columns: Record<string, ArrayLike<CellScalar | CellValue>>;
}

export interface DataSourceRequest {
  sheet: SheetId;
  start: number;
  end: number;
  signal: AbortSignal;
  revision: number;
}

export interface DataSourcePage {
  start: number;
  rows: RowData[];
  revision?: string | number;
}

export interface DataSource {
  getRows(request: DataSourceRequest): Promise<DataSourcePage>;
}

export interface DataSourceStorageOptions {
  /** Storage engine. Dense is the default. */
  mode?: "dense" | "paged";
  /** Power-of-two row chunk size. Defaults to 4096. */
  chunkRows?: number;
  /** Clean-chunk cache budget. Dirty and visible chunks may exceed it. */
  cacheBytes?: number;
}
