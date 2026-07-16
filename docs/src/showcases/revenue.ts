import type { ColumnarData, Theme, Workbook } from "@sheetwrite/core";

export const REVENUE_ROWS = 100_000;
export const REVENUE_CITIES = [
  "Phnom Penh",
  "Tokyo",
  "Berlin",
  "Lisbon",
  "Nairobi",
  "Lima",
  "Oslo",
] as const;
export const REVENUE_REPS = ["Ana", "Bram", "Chen", "Dara", "Eve"] as const;
export const REVENUE_AMOUNT_COLUMN = 5;
export const REVENUE_CITY_COLUMN = 3;

function buildRevenueData(): ColumnarData {
  const id = new Float64Array(REVENUE_ROWS);
  const date: string[] = new Array(REVENUE_ROWS);
  const account: string[] = new Array(REVENUE_ROWS);
  const city: string[] = new Array(REVENUE_ROWS);
  const owner: string[] = new Array(REVENUE_ROWS);
  const arr = new Float64Array(REVENUE_ROWS);

  for (let row = 0; row < REVENUE_ROWS; row++) {
    id[row] = row + 1;
    date[row] = new Date(Date.UTC(2024, 0, 1 + (row % 730))).toISOString().slice(0, 10);
    account[row] = `Account ${String(row + 1).padStart(6, "0")}`;
    city[row] = REVENUE_CITIES[row % REVENUE_CITIES.length] ?? "";
    owner[row] = REVENUE_REPS[(row * 7) % REVENUE_REPS.length] ?? "";
    arr[row] = Math.round((Math.sin(row) * 0.5 + 0.5) * 2_500_000) / 100;
  }

  return { rowCount: REVENUE_ROWS, columns: { id, date, account, city, owner, arr } };
}

export const REVENUE_DATA = buildRevenueData();

export function createRevenueWorkbook(positiveFill = "#34d39924"): Workbook {
  const arrRange = {
    sheet: "pipeline",
    start: { row: 0, col: REVENUE_AMOUNT_COLUMN },
    end: { row: REVENUE_ROWS - 1, col: REVENUE_AMOUNT_COLUMN },
  };

  return {
    activeSheet: "pipeline",
    sheets: [
      {
        id: "pipeline",
        name: "Revenue pipeline",
        rowCount: REVENUE_ROWS,
        columns: [
          { key: "id", header: "ID", width: 72, type: "number" },
          { key: "date", header: "Close date", width: 118, type: "text" },
          { key: "account", header: "Account", width: 210, type: "text" },
          { key: "city", header: "Market", width: 130, type: "text" },
          { key: "owner", header: "Owner", width: 96, type: "text" },
          {
            key: "arr",
            header: "ARR",
            width: 138,
            type: "currency",
            numberFormat: "$#,##0.00",
          },
        ],
        conditionalFormats: [
          {
            range: arrRange,
            when: { kind: "greaterThan", value: 20_000 },
            style: { backgroundColor: positiveFill, bold: true },
          },
          {
            range: arrRange,
            when: { kind: "lessThan", value: 1_000 },
            style: { color: "#fb7185" },
          },
        ],
      },
    ],
  };
}

export const SHOWCASE_THEME: Partial<Theme> = {
  font: '500 13px "Inter Variable", Inter, system-ui, sans-serif',
  bg: "#09101c",
  fg: "#dce5f3",
  gridLine: "#22314a",
  headerBg: "#0d1727",
  headerFg: "#6ee7b7",
  selection: "#34d39924",
  selectionBorder: "#34d399",
  rowHeight: 30,
  headerHeight: 32,
  rowHeaderWidth: 48,
  searchMatch: "#fbbf2440",
  searchActiveMatch: "#fbbf24",
  highlight: "#34d39933",
};

export const REACT_SHOWCASE_THEME: Partial<Theme> = {
  ...SHOWCASE_THEME,
  headerFg: "#8bd8e8",
  selection: "#58c4dc24",
  selectionBorder: "#58c4dc",
  highlight: "#58c4dc30",
};

export const VUE_SHOWCASE_THEME: Partial<Theme> = {
  ...SHOWCASE_THEME,
  headerFg: "#75d0aa",
  selection: "#42b88324",
  selectionBorder: "#42b883",
  highlight: "#42b88330",
};

export const SVELTE_SHOWCASE_THEME: Partial<Theme> = {
  ...SHOWCASE_THEME,
  headerFg: "#ff8a68",
  selection: "#e7653d24",
  selectionBorder: "#e7653d",
  highlight: "#e7653d30",
};
