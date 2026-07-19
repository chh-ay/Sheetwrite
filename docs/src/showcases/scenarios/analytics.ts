/**
 * Analytics scenario — canonical dataset/workbook for the React workbench.
 *
 * Framework-neutral: owns the controlled-analytics story (100k-row sales
 * pipeline, KPI formulas over it) and the expected observable states browser
 * specs assert against. The React route consumes this module through its
 * adapter; it never forks the dataset.
 */

import type { ColumnarData, DocumentOp, Theme, Workbook } from "@sheetwrite/core";
import { REACT_SHOWCASE_THEME } from "../revenue.js";

export const ANALYTICS_ROWS = 100_000;
export const ANALYTICS_SHEET_ID = "pipeline";
/** Single-word sheet name so cross-sheet formulas need no quoting. */
export const ANALYTICS_SHEET_NAME = "Pipeline";
export const ANALYTICS_SUMMARY_SHEET_ID = "summary";
export const ANALYTICS_SUMMARY_SHEET_NAME = "Summary";

export const ANALYTICS_MARKETS = [
  "Phnom Penh",
  "Tokyo",
  "Berlin",
  "Lisbon",
  "Nairobi",
  "Lima",
  "Oslo",
] as const;
export const ANALYTICS_SEGMENTS = ["Enterprise", "Mid-market", "SMB", "Self-serve"] as const;

/** Zero-based column coordinates of the pipeline sheet. */
export const ANALYTICS_COLUMNS = {
  id: 0,
  account: 1,
  market: 2,
  segment: 3,
  seats: 4,
  arr: 5,
} as const;

export const ANALYTICS_THEME: Partial<Theme> = {
  font: REACT_SHOWCASE_THEME.font,
  rowHeight: REACT_SHOWCASE_THEME.rowHeight,
  headerHeight: REACT_SHOWCASE_THEME.headerHeight,
  rowHeaderWidth: REACT_SHOWCASE_THEME.rowHeaderWidth,
};

/**
 * Deterministic integer ARR per row. Integer dollars keep aggregate
 * expectations exact (no float drift) across engine and test recomputation.
 */
export function analyticsArr(row: number): number {
  return ((row * 7919) % 240_000) + 480;
}

/** Deterministic seat count per row, integer for exact aggregate assertions. */
export function analyticsSeats(row: number): number {
  return ((row * 31) % 950) + 5;
}

/** Fresh columnar arrays per call so grid resets re-ingest pristine data. */
export function buildAnalyticsData(): ColumnarData {
  const id = new Float64Array(ANALYTICS_ROWS);
  const account: string[] = new Array(ANALYTICS_ROWS);
  const market: string[] = new Array(ANALYTICS_ROWS);
  const segment: string[] = new Array(ANALYTICS_ROWS);
  const seats = new Float64Array(ANALYTICS_ROWS);
  const arr = new Float64Array(ANALYTICS_ROWS);

  for (let row = 0; row < ANALYTICS_ROWS; row++) {
    id[row] = row + 1;
    account[row] = `Account ${String(row + 1).padStart(6, "0")}`;
    market[row] = ANALYTICS_MARKETS[row % ANALYTICS_MARKETS.length] ?? "";
    segment[row] = ANALYTICS_SEGMENTS[(row * 3) % ANALYTICS_SEGMENTS.length] ?? "";
    seats[row] = analyticsSeats(row);
    arr[row] = analyticsArr(row);
  }

  return { rowCount: ANALYTICS_ROWS, columns: { id, account, market, segment, seats, arr } };
}

/** Pipeline + empty Summary sheet the KPI formulas are seeded into. */
export function createAnalyticsWorkbook(): Workbook {
  const arrRange = {
    sheet: ANALYTICS_SHEET_ID,
    start: { row: 0, col: ANALYTICS_COLUMNS.arr },
    end: { row: ANALYTICS_ROWS - 1, col: ANALYTICS_COLUMNS.arr },
  };

  return {
    activeSheet: ANALYTICS_SHEET_ID,
    namedRanges: [{ name: ANALYTICS_ARR_NAME, range: arrRange }],
    sheets: [
      {
        id: ANALYTICS_SHEET_ID,
        name: ANALYTICS_SHEET_NAME,
        rowCount: ANALYTICS_ROWS,
        columns: [
          { key: "id", header: "ID", width: 72, type: "number" },
          { key: "account", header: "Account", width: 210, type: "text" },
          { key: "market", header: "Market", width: 130, type: "text" },
          { key: "segment", header: "Segment", width: 118, type: "text" },
          { key: "seats", header: "Seats", width: 90, type: "number" },
          { key: "arr", header: "ARR", width: 138, type: "currency", numberFormat: "$#,##0" },
        ],
        conditionalFormats: [
          {
            range: arrRange,
            when: { kind: "greaterThan", value: 200_000 },
            style: { backgroundColor: "#58c4dc24", bold: true },
          },
          {
            range: arrRange,
            when: { kind: "lessThan", value: 5_000 },
            style: { color: "#fb7185" },
          },
        ],
      },
      {
        id: ANALYTICS_SUMMARY_SHEET_ID,
        name: ANALYTICS_SUMMARY_SHEET_NAME,
        rowCount: 12,
        columns: [
          { key: "metric", header: "Metric", width: 220, type: "text" },
          { key: "value", header: "Value", width: 170, type: "currency", numberFormat: "$#,##0" },
        ],
      },
    ],
  };
}

/** Workbook-scoped named range over the ARR column, usable from any formula. */
export const ANALYTICS_ARR_NAME = "ANNUAL_ARR";

const ARR_RANGE_REF = `${ANALYTICS_SHEET_NAME}!F1:F${ANALYTICS_ROWS}`;
const SEATS_RANGE_REF = `${ANALYTICS_SHEET_NAME}!E1:E${ANALYTICS_ROWS}`;
const MARKET_RANGE_REF = `${ANALYTICS_SHEET_NAME}!C1:C${ANALYTICS_ROWS}`;

/** KPI rows the workbench seeds into the Summary sheet — real engine formulas. */
export const ANALYTICS_KPIS: ReadonlyArray<{ label: string; formula: string }> = [
  { label: "Total ARR", formula: `=SUM(${ANALYTICS_ARR_NAME})` },
  { label: "Average deal", formula: `=AVG(${ARR_RANGE_REF})` },
  { label: "Largest deal", formula: `=MAX(${ARR_RANGE_REF})` },
  { label: "Smallest deal", formula: `=MIN(${ARR_RANGE_REF})` },
  { label: "Seats under contract", formula: `=SUM(${SEATS_RANGE_REF})` },
  ...ANALYTICS_MARKETS.map((market) => ({
    label: `${market} ARR`,
    formula: `=SUMIF(${MARKET_RANGE_REF},"${market}",${ARR_RANGE_REF})`,
  })),
];

/** Transaction patches seeding the Summary sheet with the KPI label/formula rows. */
export function analyticsSummarySeedOps(): DocumentOp[] {
  return ANALYTICS_KPIS.flatMap((kpi, row): DocumentOp[] => [
    {
      op: "set",
      addr: { sheet: ANALYTICS_SUMMARY_SHEET_ID, row, col: 0 },
      value: { kind: "literal", value: kpi.label },
    },
    {
      op: "set",
      addr: { sheet: ANALYTICS_SUMMARY_SHEET_ID, row, col: 1 },
      value: { kind: "formula", src: kpi.formula },
    },
  ]);
}

function computeAnalyticsTotals(): {
  totalArr: number;
  marketTotals: Record<string, number>;
  marketRowCounts: Record<string, number>;
} {
  let totalArr = 0;
  const marketTotals: Record<string, number> = {};
  const marketRowCounts: Record<string, number> = {};
  for (const market of ANALYTICS_MARKETS) {
    marketTotals[market] = 0;
    marketRowCounts[market] = 0;
  }
  for (let row = 0; row < ANALYTICS_ROWS; row++) {
    const amount = analyticsArr(row);
    totalArr += amount;
    const market = ANALYTICS_MARKETS[row % ANALYTICS_MARKETS.length] ?? "";
    marketTotals[market] = (marketTotals[market] ?? 0) + amount;
    marketRowCounts[market] = (marketRowCounts[market] ?? 0) + 1;
  }
  return { totalArr, marketTotals, marketRowCounts };
}

/** Observable states browser contracts assert against (exact — integer math). */
export const ANALYTICS_EXPECTED = {
  firstDataCell: { row: 0, col: ANALYTICS_COLUMNS.account, text: "Account 000001" },
  rowCount: ANALYTICS_ROWS,
  kpiCount: ANALYTICS_KPIS.length,
  ...computeAnalyticsTotals(),
} as const;
