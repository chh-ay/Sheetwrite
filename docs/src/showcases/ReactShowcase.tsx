import type { Grid, SearchResult, Selection } from "@sheetwrite/core";
import workerUrl from "@sheetwrite/core/worker?worker&url";
import { SheetwriteGrid } from "@sheetwrite/react";
import { FileSpreadsheet, Monitor } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRevenueWorkbook,
  REVENUE_AMOUNT_COLUMN,
  REVENUE_CITIES,
  REVENUE_CITY_COLUMN,
  REVENUE_DATA,
  REVENUE_ROWS,
  REACT_SHOWCASE_THEME,
} from "./revenue.js";
import { DemoButton } from "./ui/DemoButton.js";
import { DemoRenderingMode } from "./ui/DemoRenderingMode.js";
import { DemoSelect } from "./ui/DemoSelect.js";
import "@sheetwrite/react/styles.css";
import "../styles/showcase.css";

const workbook = createRevenueWorkbook("#58c4dc24");
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

function describeSelection(selection: Selection | null): string {
  if (!selection) return "No selection";
  if (selection.kind === "cell") return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  if (selection.kind === "range") {
    return `R${selection.range.start.row + 1}:R${selection.range.end.row + 1}`;
  }
  return selection.kind;
}

export default function ReactWorkbook() {
  const gridRef = useRef<Grid>(null);
  const activityId = useRef(0);
  const rendererCleanup = useRef<() => void>(() => {});
  const [market, setMarket] = useState("all");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchResult | null>(null);
  const [visibleRows, setVisibleRows] = useState(REVENUE_ROWS);
  const [pipeline, setPipeline] = useState(0);
  const [selection, setSelection] = useState("No selection");
  const [renderer, setRenderer] = useState<"canvas" | "worker">("canvas");
  const [activeRenderer, setActiveRenderer] = useState<"canvas" | "worker">("canvas");
  const [rendererFallback, setRendererFallback] = useState<{
    count: number;
    reason: string;
  } | null>(null);
  const [activity, setActivity] = useState([{ id: 0, message: "Workbook initialized" }]);

  const refresh = useCallback((ready?: Grid) => {
    const grid = ready ?? gridRef.current;
    if (!grid) return;
    setVisibleRows(grid.store.viewRowCount("pipeline"));
    setPipeline(grid.aggregate(REVENUE_AMOUNT_COLUMN, "sum"));
  }, []);

  useEffect(() => () => rendererCleanup.current(), []);

  function record(message: string): void {
    const id = ++activityId.current;
    setActivity((items) => [{ id, message }, ...items].slice(0, 3));
  }

  function chooseMarket(next: string): void {
    setMarket(next);
    const grid = gridRef.current;
    if (!grid) return;
    grid.setColumnFilter(
      REVENUE_CITY_COLUMN,
      next === "all" ? null : { kind: "values", values: [next] },
    );
    refresh(grid);
    record(next === "all" ? "Showing all markets" : `Filtered to ${next}`);
  }

  function searchFor(nextQuery: string): void {
    const grid = gridRef.current;
    if (!grid) return;
    setQuery(nextQuery);
    if (nextQuery.trim().length === 0) {
      grid.clearSearch();
      setMatches(null);
      record("Search cleared");
      return;
    }
    const result = grid.search(nextQuery.trim());
    setMatches(result);
    if (result.matches.length > 0) grid.findNext();
    record(`${result.matches.length.toLocaleString()} search matches`);
  }

  function search(): void {
    searchFor(query);
  }

  function resetWorkbook(): void {
    const grid = gridRef.current;
    if (!grid) return;
    setMarket("all");
    setQuery("");
    setMatches(null);
    grid.setColumnFilter(REVENUE_CITY_COLUMN, null);
    grid.clearSearch();
    refresh(grid);
    record("Workbook view reset");
  }

  return (
    <section className="sw-demo-app" data-framework="react">
      <main className="sw-demo-main" id="workbook">
        <header className="sw-demo-controlbar">
          <div className="sw-demo-controlbar__identity">
            <span className="sw-demo-product__mark" aria-hidden="true">
              <FileSpreadsheet size={16} strokeWidth={1.8} />
            </span>
            <div>
              <h2>Revenue pipeline</h2>
              <span>{visibleRows.toLocaleString()} visible rows</span>
            </div>
          </div>
          <div
            className="sw-demo-controlbar__controls"
            role="toolbar"
            aria-label="Workbook controls"
          >
            <DemoSelect
              label="Market"
              value={market}
              options={MARKET_OPTIONS}
              onValueChange={chooseMarket}
            />
            <label className="sw-demo-controlbar__search">
              <span className="sw-visually-hidden">Search customers</span>
              <input
                aria-label="Search customers"
                type="search"
                value={query}
                placeholder="Account 004812"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") search();
                }}
              />
            </label>
            <DemoButton type="button" onClick={search}>
              Find
            </DemoButton>
            <DemoButton
              type="button"
              onClick={() => gridRef.current?.findPrev()}
              disabled={!matches?.matches.length}
            >
              Previous
            </DemoButton>
            <DemoButton
              type="button"
              onClick={() => gridRef.current?.findNext()}
              disabled={!matches?.matches.length}
            >
              Next
            </DemoButton>
            <DemoButton
              type="button"
              onClick={() => {
                gridRef.current?.sortBy(REVENUE_AMOUNT_COLUMN, false);
                record("Sorted amount high to low");
              }}
            >
              Rank
            </DemoButton>
            <DemoButton type="button" onClick={resetWorkbook}>
              Reset
            </DemoButton>
            <DemoRenderingMode
              label="Rendering thread"
              mode={renderer}
              onModeChange={(mode) => {
                setRenderer(mode);
                setRendererFallback(null);
              }}
            />
          </div>
          <span className="sw-demo-controlbar__state" role="status">
            <Monitor aria-hidden="true" size={14} />
            {activeRenderer === "worker" ? "Worker" : "Canvas"}
          </span>
        </header>

        <div className="sw-demo-grid">
          <SheetwriteGrid
            ref={gridRef}
            workbook={workbook}
            data={REVENUE_DATA}
            theme={REACT_SHOWCASE_THEME}
            renderer={renderer}
            workerUrl={renderer === "worker" ? workerUrl : undefined}
            config={GRID_CONFIG}
            style={{ height: "100%" }}
            onReady={({ grid }) => {
              grid.setFrozen(0, 1);
              rendererCleanup.current();
              setActiveRenderer(grid.rendererKind());
              rendererCleanup.current = grid.on("renderer-fallback", ({ error }) => {
                setActiveRenderer("canvas");
                setRendererFallback((current) => ({
                  count: (current?.count ?? 0) + 1,
                  reason: error instanceof Error ? error.message : String(error),
                }));
              });
              refresh(grid);
              record("Grid ready · 100,000 rows");
            }}
            onGridChange={({ transaction }) => {
              record(`${transaction.patches.length} operation committed`);
              refresh();
            }}
            onSelectionChange={(value) => setSelection(describeSelection(value))}
          />
        </div>

        <footer className="sw-demo-status sw-demo-status--metrics">
          <span>Rows · {visibleRows.toLocaleString()}</span>
          <span>Pipeline · {money.format(pipeline)}</span>
          <span>Search · {matches ? matches.matches.length.toLocaleString() : "—"}</span>
          <output data-testid="renderer" data-fallback-count={rendererFallback?.count ?? 0}>
            Requested: {renderer === "worker" ? "Web Worker" : "Main thread"} · Active:{" "}
            {activeRenderer === "worker" ? "Web Worker" : "Main thread"}
            {rendererFallback ? ` · Fallback: ${rendererFallback.reason}` : ""}
          </output>
          <span>{selection}</span>
          <span aria-live="polite" data-react-activity>
            {activity[0]?.message}
          </span>
        </footer>
      </main>
    </section>
  );
}
