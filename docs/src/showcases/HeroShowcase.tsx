import type { CellValue, ColumnarData, Grid, Theme, Workbook } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { useRef, useState } from "react";
import { HERO_ROWS } from "./HeroIsland.js";
import "@sheetwrite/react/styles.css";

const TOTAL_COLUMN = 5;
const ACCOUNTS = [
  "Aurora Fabrication",
  "Basalt Analytics",
  "Cascade Freight",
  "Drift Hydraulics",
  "Ember Robotics",
  "Foxglove Media",
  "Granite Storage",
  "Halide Optics",
] as const;

/**
 * Mirrors SHOWCASE_THEME (revenue.ts) without paying that module's
 * 100,000-row init cost; slightly tighter rows suit the hero viewport.
 */
const HERO_THEME: Partial<Theme> = {
  font: '500 12.5px "Inter Variable", Inter, system-ui, sans-serif',
  bg: "#09101c",
  fg: "#dce5f3",
  gridLine: "#22314a",
  headerBg: "#0d1727",
  headerFg: "#6ee7b7",
  selection: "#34d39924",
  selectionBorder: "#34d399",
  rowHeight: 28,
  headerHeight: 30,
  rowHeaderWidth: 44,
  searchMatch: "#fbbf2440",
  searchActiveMatch: "#fbbf24",
  highlight: "#34d39933",
};

const fyRange = {
  sheet: "plan",
  start: { row: 0, col: TOTAL_COLUMN },
  end: { row: HERO_ROWS - 1, col: TOTAL_COLUMN },
};

const HERO_WORKBOOK: Workbook = {
  activeSheet: "plan",
  sheets: [
    {
      id: "plan",
      name: "FY26 plan",
      rowCount: HERO_ROWS,
      columns: [
        { key: "account", header: "Account", width: 168, type: "text" },
        { key: "q1", header: "Q1", width: 92, type: "currency", numberFormat: "$#,##0" },
        { key: "q2", header: "Q2", width: 92, type: "currency", numberFormat: "$#,##0" },
        { key: "q3", header: "Q3", width: 92, type: "currency", numberFormat: "$#,##0" },
        { key: "q4", header: "Q4", width: 92, type: "currency", numberFormat: "$#,##0" },
        { key: "fy", header: "FY26 (=SUM)", width: 122, type: "currency", numberFormat: "$#,##0" },
      ],
      conditionalFormats: [
        {
          range: fyRange,
          when: { kind: "greaterThan", value: 150_000 },
          style: { backgroundColor: "#34d39924", bold: true },
        },
        {
          range: fyRange,
          when: { kind: "lessThan", value: 60_000 },
          style: { color: "#fb7185" },
        },
      ],
    },
  ],
};

/** Every FY cell is a real `=SUM(B?:E?)` formula evaluated by the Rust calc engine. */
function buildHeroData(): ColumnarData {
  const account: string[] = new Array(HERO_ROWS);
  const quarters: Float64Array[] = [0, 1, 2, 3].map(() => new Float64Array(HERO_ROWS));
  const fy: CellValue[] = new Array(HERO_ROWS);
  for (let row = 0; row < HERO_ROWS; row++) {
    const name = ACCOUNTS[row % ACCOUNTS.length] ?? "";
    account[row] = `${name} ${String(Math.floor(row / ACCOUNTS.length) + 1).padStart(2, "0")}`;
    for (let quarter = 0; quarter < 4; quarter++) {
      quarters[quarter]![row] = Math.round(
        (Math.sin(row * 11 + quarter * 5) * 0.5 + 0.62) * 48_000,
      );
    }
    fy[row] = { kind: "formula", src: `=SUM(B${row + 1}:E${row + 1})` };
  }
  return {
    rowCount: HERO_ROWS,
    columns: {
      account,
      q1: quarters[0]!,
      q2: quarters[1]!,
      q3: quarters[2]!,
      q4: quarters[3]!,
      fy,
    },
  };
}

const HERO_DATA = buildHeroData();
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * The landing hero workbook: a compact FY plan on the real React adapter —
 * small enough to feel instant, real enough to type into. The status strip
 * proves liveness: the Σ aggregate re-reads the engine after every commit.
 */
export default function HeroWorkbook() {
  const gridRef = useRef<Grid>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [activity, setActivity] = useState("Click a quarter cell and type");

  return (
    <>
      <div className="sw-hero-stage__viewport">
        <SheetwriteGrid
          ref={gridRef}
          workbook={HERO_WORKBOOK}
          data={HERO_DATA}
          theme={HERO_THEME}
          fill
          fallback={<div aria-hidden="true" className="sw-hero-stage__skeleton" />}
          onReady={({ grid }) => setTotal(grid.aggregate(TOTAL_COLUMN, "sum"))}
          onGridChange={({ transaction }) => {
            const grid = gridRef.current;
            if (grid !== null) setTotal(grid.aggregate(TOTAL_COLUMN, "sum"));
            const ops = transaction.patches.length;
            setActivity(`${ops} op${ops === 1 ? "" : "s"} committed · formulas recalculated`);
          }}
        />
      </div>
      <footer className="sw-hero-stage__status">
        <span>{HERO_ROWS} rows</span>
        <span>
          Σ FY26 <strong>{total === null ? "—" : money.format(total)}</strong>
        </span>
        <span aria-live="polite">{activity}</span>
      </footer>
    </>
  );
}
