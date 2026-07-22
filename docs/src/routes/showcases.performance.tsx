import type {
  CellAddress,
  Grid,
  PagedStoreStats,
  QueryCapability,
  RuntimeResourcePhaseDelta,
  RuntimeResourceSnapshot,
  Selection,
} from "@sheetwrite/core";
import {
  cellA1,
  colToA1,
  createGrid,
  diffRuntimeResourcePhases,
  initSheetwrite,
} from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { pageMeta } from "../lib/seo.js";
import {
  attemptColumnScan,
  attemptFullCsvExport,
  COMPARISON_EVIDENCE,
  type CrossingReport,
  createScaleDataSource,
  createScaleWorkbook,
  type DatasourceTelemetry,
  type DatasourceTile,
  emptyTelemetry,
  FEED_SHEET,
  type FullExportAttempt,
  formatBytes,
  INTERACTION_EVIDENCE,
  measureBulkMutation,
  PAGE_LATENCY_MS,
  PAGED_EVIDENCE,
  pagedStatsOf,
  queryCapabilityOf,
  SCALE_COLUMNS,
  SCALE_LOGICAL_CELLS,
  SCALE_ROWS,
  SCALE_STORAGE,
  SCALE_THEME,
  type ScanAttempt,
} from "../showcases/scenarios/scale.js";
import stylesheet from "../styles/showcase-performance.css?url";
import "@sheetwrite/core/styles.css";

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
  }
}

const description =
  "A real canvas and Worker Grid over exactly 1,000,000 rows by 1,000 columns: one billion logical addresses with windowed protocol-2 loading, bounded clean cache, sparse durable edits, and measured runtime evidence.";

export const Route = createFileRoute("/showcases/performance")({
  head: () => ({
    meta: pageMeta("One-billion-address Grid — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: PerformanceRoute,
});

const LANDMARKS = [
  { label: "0%", ratio: 0 },
  { label: "25%", ratio: 0.25 },
  { label: "74%", ratio: 0.74 },
  { label: "99%", ratio: 0.99 },
] as const;

interface RendererState {
  requested: "canvas" | "worker";
  active: "canvas" | "worker";
  fallback: string | null;
}

interface VisibleWindow {
  firstRow: number;
  lastRow: number;
  scrollLeft: number;
  firstColumn: number;
  lastColumn: number;
}

interface LiveStats {
  paged: PagedStoreStats | null;
  query: QueryCapability | null;
  resource: RuntimeResourceSnapshot | null;
}

interface EvictionWatch {
  dirty: CellAddress;
  clean: CellAddress;
  dirtyState: string;
  cleanState: string;
  value: string;
}

type TileResidence = DatasourceTile["state"] | "resident" | "evicted" | "dirty";

function selectionA1(selection: Selection | null): string {
  if (!selection) return "A1";
  if (selection.kind === "cell") return cellA1(selection.addr.row, selection.addr.col);
  if (selection.kind === "range")
    return cellA1(selection.range.start.row, selection.range.start.col);
  if (selection.kind === "row") return `Row ${selection.row + 1}`;
  if (selection.kind === "column") return colToA1(selection.col);
  const first = selection.ranges[0]?.start;
  return first ? cellA1(first.row, first.col) : "A1";
}

function columnBandsLabel(columns: readonly DatasourceTile["columns"][number][]): string {
  return columns
    .map((band) => `${colToA1(band.start)}–${colToA1(Math.max(band.start, band.end - 1))}`)
    .join(", ");
}

function tileResidence(grid: Grid | null, tile: DatasourceTile): TileResidence {
  if (tile.state !== "returned" || !grid?.store.getCellLoadState) return tile.state;
  const firstBand = tile.columns[0];
  if (!firstBand) return "evicted";
  const state = grid.store.getCellLoadState({
    sheet: tile.sheet,
    row: tile.start,
    col: firstBand.start,
  });
  if (state === "unloaded") return "evicted";
  if (state === "local-edit") return "dirty";
  return "resident";
}

function formatByteDelta(bytes: number): string {
  if (bytes === 0) return "0 B";
  return `${bytes > 0 ? "+" : "−"}${formatBytes(Math.abs(bytes))}`;
}

function PerformanceRoute() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const [renderer, setRenderer] = useState<"canvas" | "worker">("canvas");
  const [rendererState, setRendererState] = useState<RendererState | null>(null);
  const [gridState, setGridState] = useState<"loading" | "ready" | "error">("loading");
  const [telemetry, setTelemetry] = useState<DatasourceTelemetry>(emptyTelemetry);
  const [stats, setStats] = useState<LiveStats>({ paged: null, query: null, resource: null });
  const [visible, setVisible] = useState<VisibleWindow>({
    firstRow: 0,
    lastRow: 0,
    scrollLeft: 0,
    firstColumn: 0,
    lastColumn: 0,
  });
  const [selection, setSelection] = useState("A1");
  const [jumpRow, setJumpRow] = useState("742000");
  const [jumpColumn, setJumpColumn] = useState("4");
  const [status, setStatus] = useState("Loading the WASM engine on demand…");
  const [crossings, setCrossings] = useState<CrossingReport[]>([]);
  const [exportAttempt, setExportAttempt] = useState<FullExportAttempt | null>(null);
  const [scan, setScan] = useState<ScanAttempt | null>(null);
  const [resourceDelta, setResourceDelta] = useState<RuntimeResourcePhaseDelta | null>(null);
  const [evidencePeriod, setEvidencePeriod] = useState<"before" | "after">("after");
  const [evictionWatch, setEvictionWatch] = useState<EvictionWatch | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let grid: Grid | null = null;
    const unsubscribes: Array<() => void> = [];
    setGridState("loading");
    setTelemetry(emptyTelemetry());
    setEvictionWatch(null);
    setStatus("Loading the WASM engine on demand…");

    void initSheetwrite()
      .then(() => {
        if (disposed) return;
        grid = createGrid(host, {
          workbook: createScaleWorkbook(),
          datasource: createScaleDataSource((update) => setTelemetry({ ...update })),
          datasourceStorage: SCALE_STORAGE,
          theme: SCALE_THEME,
          config: { toolbar: false, tabs: false },
          renderer,
          overscan: 4,
          ...(renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
        });
        gridRef.current = grid;
        window.__sheetwriteScaleGrid = grid;
        setRendererState({ requested: renderer, active: grid.rendererKind(), fallback: null });
        setSelection(selectionA1(grid.getSelection()));
        unsubscribes.push(
          grid.on("scroll", (event) => {
            setVisible({
              firstRow: event.firstRow,
              lastRow: event.lastRow,
              scrollLeft: event.scrollLeft,
              firstColumn: event.firstVisibleColumn ?? 0,
              lastColumn: event.lastVisibleColumn ?? event.firstVisibleColumn ?? 0,
            });
          }),
          grid.on("selection", ({ selection: next }) => setSelection(selectionA1(next))),
          grid.on("edit-commit", ({ addr }) => {
            const mountedGrid = gridRef.current;
            const clean = { ...addr, col: Math.min(addr.col + 1, SCALE_COLUMNS - 1) };
            if (mountedGrid) {
              setEvictionWatch({
                dirty: addr,
                clean,
                dirtyState: mountedGrid.store.getCellLoadState?.(addr) ?? "unavailable",
                cleanState: mountedGrid.store.getCellLoadState?.(clean) ?? "unavailable",
                value: String(mountedGrid.store.getCell(addr).resolved ?? ""),
              });
            }
            setStatus(
              `${cellA1(addr.row, addr.col)} committed through the Grid; its sparse dirty value is outside the clean-tile eviction budget.`,
            );
          }),
          grid.on("renderer-fallback", ({ error }) => {
            const reason = error instanceof Error ? error.message : String(error);
            setRendererState({
              requested: "worker",
              active: gridRef.current?.rendererKind() ?? "canvas",
              fallback: reason,
            });
          }),
          grid.on("datasource-error", ({ error }) => {
            setStatus(`Datasource error: ${error.message}`);
          }),
        );
        setGridState("ready");
        setStatus(
          `Ready: exactly ${SCALE_ROWS.toLocaleString()} rows × ${SCALE_COLUMNS.toLocaleString()} columns = ${SCALE_LOGICAL_CELLS.toLocaleString()} logical addresses. Only requested tiles may become resident.`,
        );
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setGridState("error");
        setStatus(
          `Grid failed to start: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return () => {
      disposed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (gridRef.current === grid) {
        gridRef.current = null;
        delete window.__sheetwriteScaleGrid;
      }
      grid?.destroy();
    };
  }, [renderer]);

  useEffect(() => {
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme(SCALE_THEME));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const grid = gridRef.current;
      if (!grid) return;
      setStats({
        paged: pagedStatsOf(grid, FEED_SHEET),
        query: queryCapabilityOf(grid, FEED_SHEET),
        resource: grid.getRuntimeResourceSnapshot("scroll", "settled"),
      });
      setEvictionWatch((current) => {
        if (!current) return current;
        const dirtyState = grid.store.getCellLoadState?.(current.dirty) ?? "unavailable";
        const cleanState = grid.store.getCellLoadState?.(current.clean) ?? "unavailable";
        const value = String(grid.store.getCell(current.dirty).resolved ?? "");
        if (
          dirtyState === current.dirtyState &&
          cleanState === current.cleanState &&
          value === current.value
        ) {
          return current;
        }
        return { ...current, dirtyState, cleanState, value };
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const jumpTo = (row: number, column: number, source: "form" | "overview" | "landmark") => {
    const grid = gridRef.current;
    if (!grid) return;
    const resolvedRow = Math.min(Math.max(Math.round(row), 0), SCALE_ROWS - 1);
    const resolvedColumn = Math.min(Math.max(Math.round(column), 0), SCALE_COLUMNS - 1);
    const addr = { sheet: FEED_SHEET, row: resolvedRow, col: resolvedColumn };
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
    if (source !== "overview") {
      setStatus(
        `${source === "form" ? "Exact jump" : "Overview landmark"}: ${cellA1(resolvedRow, resolvedColumn)} is selected; its rectangular tile is requested on demand.`,
      );
    }
  };

  const handleJump = () => {
    const row = Number(jumpRow);
    const column = Number(jumpColumn);
    if (
      !/^\d+$/.test(jumpRow.trim()) ||
      !/^\d+$/.test(jumpColumn.trim()) ||
      !Number.isSafeInteger(row) ||
      !Number.isSafeInteger(column) ||
      row < 1 ||
      column < 1
    ) {
      setStatus("Enter whole numbers: row 1–1,000,000 and column 1–1,000.");
      return;
    }
    jumpTo(row - 1, column - 1, "form");
  };

  const handleScan = () => {
    const grid = gridRef.current;
    if (grid) setScan(attemptColumnScan(grid, 3, "sum"));
  };

  const handleExport = () => {
    const grid = gridRef.current;
    if (grid) setExportAttempt(attemptFullCsvExport(grid, FEED_SHEET));
  };

  const handleCrossings = (kind: "values" | "styles") => {
    const grid = gridRef.current;
    if (!grid) return;
    const before = grid.getRuntimeResourceSnapshot("edit", "before");
    const report = measureBulkMutation(grid, kind, 20_000);
    const after = grid.getRuntimeResourceSnapshot("edit", "settled");
    setResourceDelta(diffRuntimeResourcePhases(before, after));
    setCrossings((previous) => [report, ...previous.slice(0, 3)]);
    setStatus(
      `${kind === "values" ? "Value" : "Style"} transaction touched ${report.cells.toLocaleString()} cells in ${report.durationMs.toFixed(1)} ms with ${report.ffiCalls} measured JS↔WASM crossing${report.ffiCalls === 1 ? "" : "s"}.`,
    );
  };

  const firstColumn = Math.min(visible.firstColumn, SCALE_COLUMNS - 1);
  const lastColumn = Math.min(Math.max(visible.lastColumn, firstColumn), SCALE_COLUMNS - 1);
  const firstRow = Math.min(visible.firstRow, SCALE_ROWS - 1);
  const lastRow = Math.min(Math.max(visible.lastRow, firstRow), SCALE_ROWS - 1);
  const windowA1 = `${cellA1(firstRow, firstColumn)}:${cellA1(lastRow, lastColumn)}`;
  const currentColumns = lastColumn - firstColumn + 1;
  const averageRequestedColumns =
    telemetry.returnedRows > 0 ? telemetry.returnedCells / telemetry.returnedRows : 0;
  const cachePercent = Math.min(
    ((stats.paged?.allocatedBytes ?? 0) / SCALE_STORAGE.cacheBytes) * 100,
    100,
  );
  const recentTiles = telemetry.recentTiles.map((tile) => ({
    ...tile,
    residence: tileResidence(gridRef.current, tile),
  }));
  const recentEvictions = recentTiles.filter((tile) => tile.residence === "evicted").length;
  const resourceOwners = stats.resource
    ? [...stats.resource.wasm.owners, ...stats.resource.jsOwners]
        .filter((owner) => owner.logicalBytes > 0 || owner.allocatedBytes > 0)
        .sort((left, right) => right.allocatedBytes - left.allocatedBytes)
        .slice(0, 8)
    : [];
  const changedResourceOwners =
    resourceDelta?.owners.filter(
      (owner) => owner.logicalBytes !== 0 || owner.allocatedBytes !== 0 || owner.entries !== 0,
    ) ?? [];
  const latestCrossing = crossings[0];
  const interactionEvidence = INTERACTION_EVIDENCE[evidencePeriod];
  const maxMedianRatio = COMPARISON_EVIDENCE.available
    ? Math.max(...COMPARISON_EVIDENCE.sizes.map((size) => size.medianRatio), 1)
    : 1;

  return (
    <div className="sw-sp-frame">
      <SiteTopbar active="performance" />
      <main className="sw-sp-page" id="main-content">
        <header className="sw-sp-hero">
          <p className="sw-sp-eyebrow">LIVE SCALE PROOF / PROTOCOL 2</p>
          <h1>One billion addresses. One bounded working set.</h1>
          <p className="sw-sp-lede">
            This is one real Sheetwrite Grid with exactly {SCALE_ROWS.toLocaleString()} rows and{" "}
            {SCALE_COLUMNS.toLocaleString()} columns. That is {SCALE_LOGICAL_CELLS.toLocaleString()}{" "}
            logical cell addresses—not a billion rows and not a fully resident or pre-evaluated
            matrix. Wheel, scrub, edit, and revisit it yourself.
          </p>
        </header>

        <p aria-live="polite" className="sw-sp-status" data-testid="scale-status" role="status">
          {status}
        </p>

        <section
          aria-labelledby="scale-stage-title"
          className="sw-sp-section sw-sp-stage-section"
          id="million-rows"
        >
          <div className="sw-sp-stage-heading">
            <div>
              <p className="sw-sp-kicker">Interactive canvas</p>
              <h2 id="scale-stage-title">The million-by-thousand sheet</h2>
            </div>
            <div className="sw-sp-render-switch" role="group" aria-label="Grid drawing path">
              <button
                aria-pressed={renderer === "canvas"}
                data-testid="scale-renderer-canvas"
                onClick={() => setRenderer("canvas")}
                type="button"
              >
                Main canvas
              </button>
              <button
                aria-pressed={renderer === "worker"}
                data-testid="scale-renderer-worker"
                onClick={() => setRenderer("worker")}
                type="button"
              >
                Worker canvas
              </button>
            </div>
          </div>

          <div className="sw-sp-workbench" data-state={gridState}>
            <div className="sw-sp-readout" aria-label="Public visible-window diagnostics">
              <div>
                <span>Selected</span>
                <strong data-testid="scale-current-a1">{selection}</strong>
              </div>
              <div>
                <span>Visible window</span>
                <strong data-testid="scale-window-a1">{windowA1}</strong>
              </div>
              <div>
                <span>Row headers</span>
                <strong data-testid="scale-window-rows">
                  {firstRow + 1}–{lastRow + 1}
                </strong>
              </div>
              <div>
                <span>Column headers</span>
                <strong data-testid="scale-window-columns">
                  {colToA1(firstColumn)}–{colToA1(lastColumn)}
                </strong>
              </div>
            </div>

            <div className="sw-sp-stage-body">
              <div className="sw-sp-grid-shell">
                <div className="sw-sp-grid-instructions">
                  <span data-state={gridState}>
                    {gridState === "ready"
                      ? "Grid ready"
                      : gridState === "error"
                        ? "Grid unavailable"
                        : "Loading Grid"}
                  </span>
                  <span>Wheel / trackpad · Page Up / Down · Shift-wheel horizontally</span>
                </div>
                {/* biome-ignore lint/a11y/useSemanticElements: Sheetwrite upgrades this canvas host into a virtualized ARIA grid. */}
                <div
                  aria-label="Million-row telemetry grid — one-billion-address Sheetwrite Grid"
                  className="sw-sp-grid"
                  data-testid="scale-grid"
                  ref={hostRef}
                  role="grid"
                />
              </div>

              <aside className="sw-sp-overview-panel" aria-label="Sheet overview and loaded tiles">
                <div className="sw-sp-overview-head">
                  <span>Vertical overview</span>
                  <strong>{Math.round((firstRow / (SCALE_ROWS - 1)) * 100)}%</strong>
                </div>
                <div className="sw-sp-overview-track">
                  <input
                    aria-label="Vertical sheet overview"
                    aria-valuetext={`Row ${firstRow + 1} of ${SCALE_ROWS}`}
                    data-testid="scale-overview"
                    disabled={gridState !== "ready"}
                    max={SCALE_ROWS - 1}
                    min={0}
                    onChange={(event) =>
                      jumpTo(Number(event.currentTarget.value), firstColumn, "overview")
                    }
                    step={1}
                    type="range"
                    value={firstRow}
                  />
                  <div aria-hidden="true" className="sw-sp-tile-map">
                    {recentTiles.map((tile) => (
                      <span
                        data-state={tile.residence}
                        key={tile.id}
                        style={{ top: `${(tile.start / (SCALE_ROWS - 1)) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="sw-sp-landmarks">
                    {LANDMARKS.map((landmark) => (
                      <button
                        data-testid={`scale-landmark-${landmark.label.replace("%", "")}`}
                        key={landmark.label}
                        onClick={() =>
                          jumpTo(
                            Math.round((SCALE_ROWS - 1) * landmark.ratio),
                            firstColumn,
                            "landmark",
                          )
                        }
                        style={{ top: `${landmark.ratio * 100}%` }}
                        type="button"
                      >
                        {landmark.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p>Drag the rail. Marks are direct, user-controlled landings.</p>
              </aside>
            </div>

            <div className="sw-sp-stage-tools">
              <form
                className="sw-sp-jump"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleJump();
                }}
              >
                <fieldset>
                  <legend>Exact accessible jump</legend>
                  <label htmlFor="scale-jump-row">
                    Row
                    <input
                      data-testid="scale-jump-row"
                      id="scale-jump-row"
                      inputMode="numeric"
                      max={SCALE_ROWS}
                      min={1}
                      onChange={(event) => setJumpRow(event.currentTarget.value)}
                      type="number"
                      value={jumpRow}
                    />
                  </label>
                  <label htmlFor="scale-jump-column">
                    Column
                    <input
                      data-testid="scale-jump-column"
                      id="scale-jump-column"
                      inputMode="numeric"
                      max={SCALE_COLUMNS}
                      min={1}
                      onChange={(event) => setJumpColumn(event.currentTarget.value)}
                      type="number"
                      value={jumpColumn}
                    />
                  </label>
                  <button data-testid="scale-jump" disabled={gridState !== "ready"} type="submit">
                    Go to cell
                  </button>
                </fieldset>
              </form>
              <p>
                The rail is the primary scale control. Numeric row and column inputs remain for
                precise and assistive use, including the D742000 revisit journey.
              </p>
            </div>
            {evictionWatch && (
              <p
                className="sw-sp-eviction-watch"
                data-clean-state={evictionWatch.cleanState}
                data-testid="scale-eviction-watch"
              >
                <strong>
                  Edited {cellA1(evictionWatch.dirty.row, evictionWatch.dirty.col)} ={" "}
                  {evictionWatch.value}
                </strong>
                <span>
                  dirty owner {evictionWatch.dirtyState} · clean neighbor{" "}
                  {cellA1(evictionWatch.clean.row, evictionWatch.clean.col)}{" "}
                  {evictionWatch.cleanState}
                </span>
                {evictionWatch.cleanState === "unloaded" && (
                  <em>Clean tile evicted; sparse dirty value retained for revisit.</em>
                )}
              </p>
            )}

            {rendererState && (
              <p className="sw-sp-rendererstate" data-testid="scale-renderer-state">
                Requested <strong>{rendererState.requested}</strong>; running{" "}
                <strong data-testid="scale-renderer-active">{rendererState.active}</strong>
                {rendererState.fallback
                  ? ` — Worker construction failed, so Grid reported and used its main-canvas fallback: ${rendererState.fallback}`
                  : "."}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="paging-title" className="sw-sp-section" id="paging">
          <p className="sw-sp-kicker">Live rectangular paging</p>
          <h2 id="paging-title">Requested columns, returned columns, bounded owners</h2>
          <p>
            The source declares <code>{`{ protocol: 2, columns: "windowed" }`}</code>. Every request
            carries exact sorted column bands; every row generates only those keys and returns
            explicit <code>null</code> blanks. Counts below come from that source and public Store
            and runtime diagnostics.
          </p>

          <div className="sw-sp-diagnostics">
            <dl className="sw-sp-stats" data-testid="scale-stats">
              <div>
                <dt>Requests / aborts</dt>
                <dd data-testid="scale-requests">
                  {telemetry.requests.toLocaleString()} / {telemetry.aborted.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Requested cells</dt>
                <dd data-testid="scale-requested-cells">
                  {telemetry.requestedCells.toLocaleString()}
                </dd>
                <dd className="sw-sp-stat-context">
                  {formatBytes(telemetry.requestBytes)} request JSON
                </dd>
              </div>
              <div>
                <dt>Returned cells</dt>
                <dd data-testid="scale-returned-cells">
                  {telemetry.returnedCells.toLocaleString()}
                </dd>
                <dd className="sw-sp-stat-context">
                  {formatBytes(telemetry.returnedBytes)} row JSON
                </dd>
              </div>
              <div>
                <dt>Columns / returned row</dt>
                <dd data-testid="scale-column-amplification">
                  {averageRequestedColumns.toFixed(2)}
                </dd>
                <dd className="sw-sp-stat-context">current visible width {currentColumns}</dd>
              </div>
              <div>
                <dt>Clean cache</dt>
                <dd data-testid="scale-allocated">
                  {formatBytes(stats.paged?.allocatedBytes ?? 0)}
                </dd>
                <dd className="sw-sp-stat-context">
                  {Math.round(cachePercent)}% of {formatBytes(SCALE_STORAGE.cacheBytes)}
                </dd>
              </div>
              <div>
                <dt>Dirty overlay</dt>
                <dd data-testid="scale-dirty-cells">
                  {(stats.paged?.dirtyCells ?? 0).toLocaleString()} cells
                </dd>
                <dd className="sw-sp-stat-context">
                  {formatBytes(stats.paged?.dirtyAllocatedBytes ?? 0)} outside clean budget
                </dd>
              </div>
            </dl>

            <div className="sw-sp-cache-gauge" aria-label="Clean cache use">
              <span style={{ width: `${cachePercent}%` }} />
            </div>

            <div className="sw-sp-last-tile" data-testid="scale-last-band">
              <span>Last returned tile</span>
              {telemetry.lastReturn ? (
                <strong>
                  rows {telemetry.lastReturn.start + 1}–{telemetry.lastReturn.end} · columns{" "}
                  {columnBandsLabel(telemetry.lastReturn.columns)} ·{" "}
                  {telemetry.lastReturn.cells.toLocaleString()} cells ·{" "}
                  {formatBytes(telemetry.lastReturn.returnedBytes)} ·{" "}
                  {telemetry.lastReturn.latencyMs?.toFixed(1)} ms
                </strong>
              ) : (
                <strong>Waiting for the first returned tile</strong>
              )}
            </div>

            <div className="sw-sp-tile-list">
              <div className="sw-sp-tile-list__head">
                <h3>Recent tile map</h3>
                <span data-testid="scale-recent-evictions">
                  {recentEvictions} evicted · public load state at each tile origin
                </span>
              </div>
              {recentTiles.length === 0 ? (
                <p>Move the Grid to populate this bounded request history.</p>
              ) : (
                <ol data-testid="scale-tile-list">
                  {recentTiles.slice(0, 10).map((tile) => (
                    <li data-state={tile.residence} key={tile.id}>
                      <span>{tile.residence}</span>
                      <strong>
                        {tile.start + 1}–{tile.end} / {columnBandsLabel(tile.columns)}
                      </strong>
                      <small>{tile.cells.toLocaleString()} cells</small>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="sw-sp-console">
            <div className="sw-sp-console__intro">
              <h3>Incomplete global work stays typed and visible</h3>
              <p>
                A bounded working set cannot honestly answer a whole-sheet query or export. These
                controls call the real aggregate and CSV APIs; <code>IncompleteDataError</code>
                carries the public loaded and total counts.
              </p>
            </div>
            <div className="sw-sp-actions">
              <button data-testid="scale-scan-attempt" onClick={handleScan} type="button">
                Try SUM over all rows
              </button>
              <button data-testid="scale-export-attempt" onClick={handleExport} type="button">
                Try full-sheet CSV
              </button>
            </div>
            {scan && (
              <p
                className="sw-sp-verdictline"
                data-state={scan.ok ? "complete" : "incomplete"}
                data-testid="scale-scan-report"
              >
                <span>{scan.ok ? "Complete" : "Expected typed refusal"}</span>{" "}
                {scan.ok
                  ? `${scan.op} = ${scan.value.toLocaleString()} in ${scan.durationMs.toFixed(1)} ms.`
                  : `${scan.op} stopped in ${scan.durationMs.toFixed(1)} ms: ${scan.loadedCells.toLocaleString()} of ${scan.totalCells.toLocaleString()} logical cells are loaded. IncompleteDataError: ${scan.message}`}
              </p>
            )}
            {exportAttempt && (
              <p
                className="sw-sp-verdictline"
                data-state={exportAttempt.ok ? "complete" : "incomplete"}
                data-testid="scale-export-report"
              >
                <span>{exportAttempt.ok ? "Complete" : "Expected typed refusal"}</span>{" "}
                {exportAttempt.ok
                  ? `CSV completed at ${formatBytes(exportAttempt.bytes)}.`
                  : `${exportAttempt.loadedCells.toLocaleString()} of ${exportAttempt.totalCells.toLocaleString()} logical cells are loaded. IncompleteDataError prevented a partial file: ${exportAttempt.message}`}
              </p>
            )}
            {stats.query?.status === "incomplete" && (
              <p className="sw-sp-note" data-testid="scale-query-state">
                Public query capability: incomplete — {stats.query.loadedCells.toLocaleString()} of{" "}
                {stats.query.totalCells.toLocaleString()} logical cells loaded.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="resource-title" className="sw-sp-section" id="resources">
          <p className="sw-sp-kicker">Measured ownership</p>
          <h2 id="resource-title">Cache capacity is not logical size</h2>
          <p>
            Public resource protocol v
            <span data-testid="scale-resource-schema">{stats.resource?.schemaVersion ?? "—"}</span>{" "}
            separates logical live bytes, allocated owner capacity, and observed WASM committed
            pages. The clean page cache and sparse dirty overlay remain distinct owners.
          </p>
          <dl className="sw-sp-stats" data-testid="scale-resource-summary">
            <div>
              <dt>Logical live payload</dt>
              <dd data-testid="scale-resource-logical">
                {formatBytes(stats.resource?.totals.logicalLiveBytes ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Allocated owner capacity</dt>
              <dd data-testid="scale-resource-allocated">
                {formatBytes(stats.resource?.totals.allocatedCapacityBytes ?? 0)}
              </dd>
            </div>
            <div>
              <dt>WASM committed pages</dt>
              <dd data-testid="scale-resource-committed">
                {stats.resource?.wasm.wasmCommittedBytes == null
                  ? "Unavailable"
                  : formatBytes(stats.resource.wasm.wasmCommittedBytes)}
              </dd>
            </div>
          </dl>
          <div className="sw-sp-tablewrap">
            <table className="sw-sp-table" data-testid="scale-resource-owners">
              <caption>Largest exclusive live owners in this mounted Grid.</caption>
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Logical</th>
                  <th scope="col">Allocated</th>
                  <th scope="col">Entries</th>
                </tr>
              </thead>
              <tbody>
                {resourceOwners.map((owner) => (
                  <tr key={owner.owner}>
                    <th scope="row">
                      <code>{owner.owner}</code>
                    </th>
                    <td>{formatBytes(owner.logicalBytes)}</td>
                    <td>{formatBytes(owner.allocatedBytes)}</td>
                    <td>{owner.entries.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="crossing-title" className="sw-sp-section" id="wasm-crossings">
          <p className="sw-sp-kicker">Measured operation cost</p>
          <h2 id="crossing-title">WASM crossings are counted, not guessed</h2>
          <p>
            Each control commits a real 20,000-cell Grid transaction and reads the public packed
            mutation and runtime ownership counters before and after it.
          </p>
          <div className="sw-sp-console">
            <div className="sw-sp-actions">
              <button
                data-testid="scale-crossings-values"
                onClick={() => handleCrossings("values")}
                type="button"
              >
                Commit 20,000 values
              </button>
              <button
                data-testid="scale-crossings-styles"
                onClick={() => handleCrossings("styles")}
                type="button"
              >
                Style 20,000 cells
              </button>
            </div>
            {latestCrossing && (
              <dl className="sw-sp-operation" data-testid="scale-crossings-latest">
                <div>
                  <dt>Cells</dt>
                  <dd>{latestCrossing.cells.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>JS↔WASM calls</dt>
                  <dd data-testid="scale-crossings-ffi">{latestCrossing.ffiCalls}</dd>
                </div>
                <div>
                  <dt>Largest array</dt>
                  <dd>{latestCrossing.maxTransferredArrayLength.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Measured time</dt>
                  <dd>{latestCrossing.durationMs.toFixed(1)} ms</dd>
                </div>
              </dl>
            )}
            {resourceDelta && (
              <div className="sw-sp-resource-delta" data-testid="scale-resource-delta">
                <h3>
                  Retained owner delta: {resourceDelta.from} → {resourceDelta.to}
                </h3>
                {changedResourceOwners.length === 0 ? (
                  <p>No retained owner changed; existing capacity was reused.</p>
                ) : (
                  <ul>
                    {changedResourceOwners.map((owner) => (
                      <li key={owner.owner}>
                        <code>{owner.owner}</code>: logical {formatByteDelta(owner.logicalBytes)},
                        allocated {formatByteDelta(owner.allocatedBytes)}, entries{" "}
                        {owner.entries > 0 ? "+" : ""}
                        {owner.entries.toLocaleString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="evidence-title" className="sw-sp-section" id="evidence">
          <p className="sw-sp-kicker">Checked artifacts</p>
          <h2 id="evidence-title">Measured evidence, with provenance attached</h2>
          <p>
            These figures are not live values from this browser and are not presented as the
            billion-address stage. They are reproduced from checked repository artifacts with their
            original matrix dimensions and capture metadata.
          </p>

          <div className="sw-sp-evidence">
            <p className="sw-sp-provenance" data-testid="scale-evidence-paged-provenance">
              Source <code>{PAGED_EVIDENCE.source}</code> — {PAGED_EVIDENCE.protocol};{" "}
              {PAGED_EVIDENCE.rows.toLocaleString()} rows × {PAGED_EVIDENCE.columns} columns,{" "}
              {PAGED_EVIDENCE.pageRows}-row pages, {formatBytes(PAGED_EVIDENCE.cacheBudgetBytes)}{" "}
              cache.
            </p>
            <div className="sw-sp-tablewrap">
              <table className="sw-sp-table" data-testid="scale-evidence-paged">
                <caption>Committed paged-storage timing distribution.</caption>
                <thead>
                  <tr>
                    <th scope="col">Measurement</th>
                    <th scope="col">Median</th>
                    <th scope="col">p95</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Startup</th>
                    <td>{PAGED_EVIDENCE.startup.medianMs.toFixed(2)} ms</td>
                    <td>{PAGED_EVIDENCE.startup.p95Ms.toFixed(2)} ms</td>
                  </tr>
                  <tr>
                    <th scope="row">First page</th>
                    <td>{PAGED_EVIDENCE.firstPage.medianMs.toFixed(2)} ms</td>
                    <td>{PAGED_EVIDENCE.firstPage.p95Ms.toFixed(2)} ms</td>
                  </tr>
                  <tr>
                    <th scope="row">Distant page</th>
                    <td>{PAGED_EVIDENCE.distantPage.medianMs.toFixed(2)} ms</td>
                    <td>{PAGED_EVIDENCE.distantPage.p95Ms.toFixed(2)} ms</td>
                  </tr>
                  <tr>
                    <th scope="row">Peak allocated</th>
                    <td colSpan={2}>{formatBytes(PAGED_EVIDENCE.peakAllocatedBytes)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="sw-sp-evidence" data-testid="scale-evidence-interaction">
            <p className="sw-sp-provenance" data-testid="scale-evidence-interaction-provenance">
              Source <code>{INTERACTION_EVIDENCE.source}</code> — {INTERACTION_EVIDENCE.protocol};{" "}
              {INTERACTION_EVIDENCE.capture.samples} samples on{" "}
              {INTERACTION_EVIDENCE.capture.browser}, {INTERACTION_EVIDENCE.capture.cpu},{" "}
              {INTERACTION_EVIDENCE.capture.runtime}; commit{" "}
              <code>{INTERACTION_EVIDENCE.capture.commit.slice(0, 10)}</code>.
            </p>
            <div
              className="sw-sp-evidence-toggle"
              role="group"
              aria-label="Interaction evidence period"
            >
              {(["before", "after"] as const).map((period) => (
                <button
                  aria-pressed={evidencePeriod === period}
                  key={period}
                  onClick={() => setEvidencePeriod(period)}
                  type="button"
                >
                  {period === "before" ? "Before" : "After"}
                </button>
              ))}
            </div>
            <div className="sw-sp-tablewrap">
              <table className="sw-sp-table">
                <caption>
                  {evidencePeriod === "before" ? "Baseline" : "Current"} checked interaction
                  samples.
                </caption>
                <tbody>
                  <tr>
                    <th scope="row">1M-row lookup median</th>
                    <td>{interactionEvidence.lookupMedianNs.toFixed(2)} ns</td>
                  </tr>
                  <tr>
                    <th scope="row">Inverse-index retained bytes</th>
                    <td>{formatBytes(interactionEvidence.viewIndexBytes)}</td>
                  </tr>
                  <tr>
                    <th scope="row">100 distant dirty cells</th>
                    <td>{formatBytes(interactionEvidence.dirty100Bytes)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Sheetwrite-owned cold long-task median</th>
                    <td data-testid="scale-evidence-cold">
                      {interactionEvidence.coldOwnedLongTaskMs.toFixed(1)} ms
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {COMPARISON_EVIDENCE.available && (
            <div className="sw-sp-evidence">
              <p className="sw-sp-provenance" data-testid="scale-evidence-compare-provenance">
                Source <code>{COMPARISON_EVIDENCE.source}</code> —{" "}
                {COMPARISON_EVIDENCE.capture.browser}, {COMPARISON_EVIDENCE.capture.rounds} rounds,
                commit <code>{COMPARISON_EVIDENCE.capture.commit.slice(0, 10)}</code>.
              </p>
              <div className="sw-sp-tablewrap">
                <table className="sw-sp-table" data-testid="scale-evidence-compare">
                  <caption>Committed median per-scenario ratio from that capture only.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Rows</th>
                      <th scope="col">Compared</th>
                      <th scope="col">Median ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_EVIDENCE.sizes.map((size) => (
                      <tr key={size.size}>
                        <th scope="row">{size.size.toLocaleString()}</th>
                        <td>{size.comparedScenarios}</td>
                        <td>
                          <span className="sw-sp-ratio">
                            <span
                              aria-hidden="true"
                              style={{
                                width: `${Math.max((size.medianRatio / maxMedianRatio) * 100, 6)}%`,
                              }}
                            />
                            <strong>{size.medianRatio.toFixed(1)}×</strong>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="sw-sp-note sw-sp-note--rule">
            The live source adds a measured {PAGE_LATENCY_MS} ms delay after its first request so
            loading remains observable. Live diagnostics and checked artifact measurements stay
            separate.
          </p>
        </section>
      </main>
    </div>
  );
}
