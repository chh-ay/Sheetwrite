/**
 * Engine scenario — canonical dataset/workbook for the Vanilla workbench.
 *
 * Framework-neutral: owns the host-boundary story data (dense 100k-row revenue
 * pipeline) plus the expected observable states browser specs assert against.
 * The columnar builder itself is shared with the landing hero via revenue.ts so
 * the "Account NNNNNN" fixture contract has exactly one source.
 */

import type { ColumnarData, Theme, Workbook } from "@sheetwrite/core";
import {
  createRevenueWorkbook,
  REVENUE_AMOUNT_COLUMN,
  REVENUE_CITIES,
  REVENUE_CITY_COLUMN,
  REVENUE_DATA,
  REVENUE_REPS,
  REVENUE_ROWS,
  SHOWCASE_THEME,
} from "../revenue.js";

export const ENGINE_ROWS = REVENUE_ROWS;
export const ENGINE_SHEET_ID = "pipeline";
export const ENGINE_SHEET_NAME = "Revenue pipeline";
/** Cross-sheet formula prefix — the sheet name contains a space, so quote it. */
export const ENGINE_SHEET_REF = "'Revenue pipeline'";
export const ENGINE_MARKETS = REVENUE_CITIES;
export const ENGINE_OWNERS = REVENUE_REPS;
export const ENGINE_MARKET_COLUMN = REVENUE_CITY_COLUMN;
export const ENGINE_AMOUNT_COLUMN = REVENUE_AMOUNT_COLUMN;
export const ENGINE_THEME: Partial<Theme> = SHOWCASE_THEME;

/**
 * Canonical dense columnar dataset (module-level singleton — the grid copies
 * values into the WASM store on ingest, so sharing the source arrays is safe).
 */
export function buildEngineData(): ColumnarData {
  return REVENUE_DATA;
}

/** Canonical single-sheet workbook schema for the engine story. */
export function createEngineWorkbook(positiveFill?: string): Workbook {
  return createRevenueWorkbook(positiveFill);
}

/** Observable states browser contracts assert against. */
export const ENGINE_EXPECTED = {
  /** First data cell of the account column, as painted at A1's row. */
  firstDataCell: { row: 0, col: 2, text: "Account 000001" },
  rowCount: ENGINE_ROWS,
  marketColumn: ENGINE_MARKET_COLUMN,
  amountColumn: ENGINE_AMOUNT_COLUMN,
  sheetId: ENGINE_SHEET_ID,
} as const;
