import type {
  ColumnarData,
  Grid,
  SearchResult,
  Selection,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import workerUrl from "@sheetwrite/core/worker?worker&url";
import "@sheetwrite/core/xlsx";
import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
import { useCallback, useEffect, useRef, useState } from "react";

// ── 100,000 rows of eager columnar data ──────────────────────────────────────
// Loaded into the Rust/WASM store in one bulk pass; every sort, filter,
// distinct scan, and aggregate below runs over the full 100k in Rust.

const ROWS = 100_000;
const CITIES = ["Phnom Penh", "Tokyo", "Berlin", "Lisbon", "Nairobi", "Lima", "Oslo"];
const REPS = ["Ana", "Bram", "Chen", "Dara", "Eve"];

function buildData(): ColumnarData {
  const id = new Float64Array(ROWS);
  const date: string[] = new Array(ROWS);
  const customer: string[] = new Array(ROWS);
  const city: string[] = new Array(ROWS);
  const rep: string[] = new Array(ROWS);
  const amount = new Float64Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    const day = new Date(Date.UTC(2020, 0, 1 + (r % 1000)));
    id[r] = r + 1;
    date[r] = day.toISOString().slice(0, 10);
    customer[r] = `Customer ${String(r + 1).padStart(6, "0")}`;
    city[r] = CITIES[r % CITIES.length] ?? "";
    rep[r] = REPS[(r * 7) % REPS.length] ?? "";
    amount[r] = Math.round((Math.sin(r) * 0.5 + 0.5) * 1_000_000) / 100;
  }
  return { rowCount: ROWS, columns: { id, date, customer, city, rep, amount } };
}

const AMOUNT_COL = 5;
const CITY_COL = 3;

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: ROWS,
      columns: [
        { key: "id", header: "ID", width: 70, type: "number" },
        { key: "date", header: "Date", width: 110, type: "text" },
        { key: "customer", header: "Customer", width: 200, type: "text" },
        { key: "city", header: "City", width: 130, type: "text" },
        { key: "rep", header: "Rep", width: 90, type: "text" },
        // Excel-style number format painted by the canvas renderer.
        {
          key: "amount",
          header: "Amount",
          width: 130,
          type: "currency",
          numberFormat: "$#,##0.00",
        },
      ],
      // Conditional formats fold into the bulk render window in Rust.
      conditionalFormats: [
        {
          range: {
            sheet: "sales",
            start: { row: 0, col: AMOUNT_COL },
            end: { row: ROWS - 1, col: AMOUNT_COL },
          },
          when: { kind: "greaterThan", value: 9_500 },
          style: { backgroundColor: "#dcfce7", bold: true },
        },
        {
          range: {
            sheet: "sales",
            start: { row: 0, col: AMOUNT_COL },
            end: { row: ROWS - 1, col: AMOUNT_COL },
          },
          when: { kind: "lessThan", value: 500 },
          style: { color: "#dc2626" },
        },
      ],
    },
  ],
};

const data = buildData();

const LIGHT_THEME: Partial<Theme> = {
  bg: "#ffffff",
  fg: "#202124",
  gridLine: "#e5e7eb",
  headerBg: "#f8fafc",
  headerFg: "#334155",
};
const DARK_THEME: Partial<Theme> = {
  bg: "#111827",
  fg: "#e5e7eb",
  gridLine: "#374151",
  headerBg: "#1f2937",
  headerFg: "#f9fafb",
};

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG = { toolbar: true, export: true } as const;

const SORTS: Record<string, { label: string; keys: { col: number; ascending: boolean }[] }> = {
  none: { label: "Original order", keys: [] },
  cityAmount: {
    label: "City ↑ then Amount ↓",
    keys: [
      { col: CITY_COL, ascending: true },
      { col: AMOUNT_COL, ascending: false },
    ],
  },
  amountDesc: { label: "Amount ↓", keys: [{ col: AMOUNT_COL, ascending: false }] },
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const integer = new Intl.NumberFormat("en-US");

function describeSelection(selection: Selection | null): string {
  if (!selection) return "none";
  if (selection.kind === "cell") {
    return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  }
  if (selection.kind === "range") {
    const rows = Math.abs(selection.range.end.row - selection.range.start.row) + 1;
    const cols = Math.abs(selection.range.end.col - selection.range.start.col) + 1;
    return `${rows} × ${cols} cells`;
  }
  return selection.kind;
}

const SIMPLE_ROWS = [
  { name: "Notebook", price: 12.5 },
  { name: "Pen", price: 2.25 },
] as const;
const SIMPLE_COLUMNS = [
  { key: "name", title: "Product" },
  { key: "price", title: "Price", type: "currency" as const },
] as const;

function App() {
  const gridRef = useRef<Grid>(null);
  const [dark, setDark] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [selection, setSelection] = useState("none");
  const [visibleRows, setVisibleRows] = useState(ROWS);
  const [stats, setStats] = useState({ sum: 0, avg: 0 });
  const [matches, setMatches] = useState<SearchResult | null>(null);
  const [zoom, setZoom] = useState(1);
  const [city, setCity] = useState("all");
  const [minAmount, setMinAmount] = useState(0);
  const [sortKey, setSortKey] = useState("none");
  const [useWorker, setUseWorker] = useState(false);
  const [activeRenderer, setActiveRenderer] = useState<"canvas" | "worker" | null>(null);
  const [overscan, setOverscan] = useState(2);
  const rendererFallbackCleanup = useRef<(() => void) | null>(null);

  /** Refresh the Rust-scanned footer numbers after any view/data change. */
  const refreshStats = useCallback((ready?: Grid) => {
    const grid = ready ?? gridRef.current;
    if (!grid) return;
    setVisibleRows(grid.store.viewRowCount("sales"));
    setStats({ sum: grid.aggregate(AMOUNT_COL, "sum"), avg: grid.aggregate(AMOUNT_COL, "avg") });
  }, []);

  useEffect(
    () => () => {
      rendererFallbackCleanup.current?.();
    },
    [],
  );

  const onReady = useCallback(
    ({ grid }: { grid: Grid }) => {
      // The published ref and readiness event reference the same generation.
      grid.setFrozen(0, 1);
      refreshStats(grid);
      setActiveRenderer(grid.rendererKind());
      rendererFallbackCleanup.current?.();
      rendererFallbackCleanup.current = grid.on("renderer-fallback", () => {
        setActiveRenderer(grid.rendererKind());
      });
    },
    [refreshStats],
  );

  function applyCityFilter(next: string): void {
    setCity(next);
    gridRef.current?.setColumnFilter(
      CITY_COL,
      next === "all" ? null : { kind: "values", values: [next] },
    );
    refreshStats();
  }

  function applyMinAmount(next: number): void {
    setMinAmount(next);
    gridRef.current?.setColumnFilter(
      AMOUNT_COL,
      next <= 0 ? null : { kind: "compare", op: "gte", value: next },
    );
    refreshStats();
  }

  function applySort(next: string): void {
    setSortKey(next);
    const grid = gridRef.current;
    if (!grid) return;
    const keys = SORTS[next]?.keys ?? [];
    if (keys.length === 0) grid.clearView();
    else grid.sortByMulti(keys);
    // clearView also drops filters; re-apply the active ones.
    if (keys.length === 0) {
      if (city !== "all") grid.setColumnFilter(CITY_COL, { kind: "values", values: [city] });
      if (minAmount > 0) {
        grid.setColumnFilter(AMOUNT_COL, { kind: "compare", op: "gte", value: minAmount });
      }
    }
    refreshStats();
  }

  function runSearch(query: string): void {
    const grid = gridRef.current;
    if (!grid) return;
    if (query.length === 0) {
      grid.clearSearch();
      setMatches(null);
      return;
    }
    setMatches(grid.search(query));
  }

  return (
    <main className="example-shell" data-theme={dark ? "dark" : undefined}>
      <div className="example-controls" role="toolbar" aria-label="Data operations">
        <label>
          Search{" "}
          <input
            type="search"
            placeholder="tokyo, 000042, …"
            onChange={(event) => runSearch(event.target.value)}
          />
        </label>
        <button type="button" disabled={!matches} onClick={() => gridRef.current?.findPrev()}>
          ↑
        </button>
        <button type="button" disabled={!matches} onClick={() => gridRef.current?.findNext()}>
          ↓
        </button>
        <output data-testid="matches">
          {matches ? `${matches.matches.length.toLocaleString()} matches` : ""}
        </output>
        <span className="example-divider" />
        <label>
          City{" "}
          <select value={city} onChange={(event) => applyCityFilter(event.target.value)}>
            <option value="all">All cities</option>
            {CITIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min amount{" "}
          <select
            value={minAmount}
            onChange={(event) => applyMinAmount(Number(event.target.value))}
          >
            <option value={0}>Any</option>
            <option value={2_500}>≥ $2,500</option>
            <option value={7_500}>≥ $7,500</option>
          </select>
        </label>
        <label>
          Sort{" "}
          <select value={sortKey} onChange={(event) => applySort(event.target.value)}>
            {Object.entries(SORTS).map(([key, sort]) => (
              <option key={key} value={key}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
        <output data-testid="visible">
          Showing {integer.format(visibleRows)} of {integer.format(ROWS)} rows
        </output>
        <span className="example-divider" />
        <label>
          <input
            type="checkbox"
            checked={useWorker}
            onChange={(event) => {
              // Renderer changes recreate the grid: this is a documented reset boundary.
              setActiveRenderer(null);
              setUseWorker(event.target.checked);
            }}
          />{" "}
          Worker renderer
        </label>
        <label>
          Overscan{" "}
          <input
            type="number"
            min={0}
            step={1}
            value={overscan}
            onChange={(event) => setOverscan(Math.max(0, Number(event.target.value)))}
          />
        </label>
        <output data-testid="renderer">
          Requested: {useWorker ? "worker" : "canvas"} · Active: {activeRenderer ?? "starting…"}
        </output>
      </div>
      <div className="example-grid">
        {/* Overscan is a live option: changing it does not recreate the grid. */}
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          data={data}
          theme={dark ? DARK_THEME : LIGHT_THEME}
          readOnly={readOnly}
          config={GRID_CONFIG}
          renderer={useWorker ? "worker" : "canvas"}
          workerUrl={useWorker ? workerUrl : undefined}
          overscan={overscan}
          style={{ height: "100%" }}
          onReady={onReady}
          onSelectionChange={(value) => setSelection(describeSelection(value))}
          onGridChange={() => refreshStats()}
          onViewportChange={(event) => console.log("viewport", event)}
          onEditBegin={(event) => console.log("edit-begin", event)}
          onEditCommit={(event) => console.log("edit-commit", event)}
        />
      </div>
      <div className="example-controls example-footer" role="toolbar" aria-label="Workbook status">
        <output data-testid="stats">
          Amount, all rows — Sum {money.format(stats.sum)} · Avg {money.format(stats.avg)}
        </output>
        <output data-testid="selection">Selection: {selection}</output>
        <span className="example-divider" />
        <label>
          Zoom{" "}
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.25}
            value={zoom}
            onChange={(event) => {
              const next = Number(event.target.value);
              setZoom(next);
              gridRef.current?.setZoom(next);
            }}
          />
        </label>
        <button type="button" aria-pressed={dark} onClick={() => setDark((value) => !value)}>
          Dark theme
        </button>
        <button
          type="button"
          aria-pressed={readOnly}
          onClick={() => setReadOnly((value) => !value)}
        >
          Read only
        </button>
        <button type="button" onClick={() => gridRef.current?.undo()}>
          Undo
        </button>
        <button type="button" onClick={() => gridRef.current?.redo()}>
          Redo
        </button>
        <button type="button" onClick={() => gridRef.current?.exportCsv("sales.csv")}>
          CSV
        </button>
        <button type="button" onClick={() => void gridRef.current?.exportXlsx("sales.xlsx")}>
          XLSX
        </button>
      </div>
      <section aria-label="Data-first Sheetwrite example">
        <Sheetwrite columns={SIMPLE_COLUMNS} defaultRows={SIMPLE_ROWS} height={180} />
      </section>
    </main>
  );
}

/** Client-only island; the adapter initializes WASM on mount. */
export default function ReactWorkbook() {
  return <App />;
}
