import type { Grid, SearchResult, Selection } from "@sheetwrite/core";
import { SheetwriteGrid } from "@sheetwrite/react";
import { useCallback, useRef, useState } from "react";
import {
  createRevenueWorkbook,
  REVENUE_AMOUNT_COLUMN,
  REVENUE_CITIES,
  REVENUE_CITY_COLUMN,
  REVENUE_DATA,
  REVENUE_ROWS,
  SHOWCASE_THEME,
} from "../showcase/revenue.js";
import "@sheetwrite/react/styles.css";
import "../styles/showcase.css";
import { DemoSelect } from "./ui/DemoSelect.js";

const workbook = createRevenueWorkbook();
const GRID_CONFIG = { toolbar: true } as const;
const MARKET_OPTIONS = [
  { label: "All markets", value: "all" },
  ...REVENUE_CITIES.map((city) => ({ label: city, value: city })),
];
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function selectionLabel(selection: Selection | null): string {
  if (!selection) return "No selection";
  if (selection.kind === "cell") return `R${selection.addr.row + 1} · C${selection.addr.col + 1}`;
  return selection.kind;
}

export default function HeroWorkbook() {
  const gridRef = useRef<Grid>(null);
  const [market, setMarket] = useState("all");
  const [selection, setSelection] = useState("No selection");
  const [visibleRows, setVisibleRows] = useState(REVENUE_ROWS);
  const [pipeline, setPipeline] = useState(0);
  const [matches, setMatches] = useState<SearchResult | null>(null);

  const refresh = useCallback((ready?: Grid) => {
    const grid = ready ?? gridRef.current;
    if (!grid) return;
    setVisibleRows(grid.store.viewRowCount("pipeline"));
    setPipeline(grid.aggregate(REVENUE_AMOUNT_COLUMN, "sum"));
  }, []);

  function filterMarket(next: string): void {
    setMarket(next);
    gridRef.current?.setColumnFilter(
      REVENUE_CITY_COLUMN,
      next === "all" ? null : { kind: "values", values: [next] },
    );
    refresh();
  }

  function search(query: string): void {
    const grid = gridRef.current;
    if (!grid) return;
    if (query.trim().length === 0) {
      grid.clearSearch();
      setMatches(null);
      return;
    }
    setMatches(grid.search(query));
  }

  return (
    <section className="sw-live-workbook" aria-label="Interactive revenue workbook">
      <header className="sw-live-workbook__header">
        <div>
          <span className="sw-live-workbook__eyebrow">LIVE WORKBOOK</span>
          <strong>Revenue operations</strong>
        </div>
        <div className="sw-live-workbook__metrics">
          <span>
            <b>{visibleRows.toLocaleString()}</b> rows
          </span>
          <span>
            <b>{money.format(pipeline)}</b> pipeline
          </span>
        </div>
      </header>

      <div className="sw-live-workbook__controls" role="toolbar" aria-label="Workbook controls">
        <DemoSelect
          label="Market"
          value={market}
          options={MARKET_OPTIONS}
          onValueChange={filterMarket}
        />
        <label>
          Find
          <input
            type="search"
            placeholder="Account 000042"
            onChange={(event) => search(event.target.value)}
          />
        </label>
        <button type="button" disabled={!matches} onClick={() => gridRef.current?.findPrev()}>
          Previous
        </button>
        <button type="button" disabled={!matches} onClick={() => gridRef.current?.findNext()}>
          Next
        </button>
        <output>
          {matches ? `${matches.matches.length.toLocaleString()} matches` : selection}
        </output>
      </div>

      <div className="sw-live-workbook__grid">
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          data={REVENUE_DATA}
          theme={SHOWCASE_THEME}
          config={GRID_CONFIG}
          style={{ height: "100%" }}
          onReady={({ grid }) => {
            grid.setFrozen(0, 1);
            refresh(grid);
          }}
          onSelectionChange={(value) => setSelection(selectionLabel(value))}
          onGridChange={() => refresh()}
        />
      </div>

      <footer className="sw-live-workbook__footer">
        <span>Rust/WASM columnar engine</span>
        <span>Canvas renderer</span>
        <span>Editable</span>
      </footer>
    </section>
  );
}
