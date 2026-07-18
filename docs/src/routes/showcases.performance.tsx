import type { Grid, PagedStoreStats, QueryCapability } from "@sheetwrite/core";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { pageMeta } from "../lib/seo.js";
import {
  attemptColumnScan,
  attemptFullCsvExport,
  type ChurnReport,
  COMPARISON_EVIDENCE,
  type CrossingReport,
  createScaleDataSource,
  createScaleWorkbook,
  type DatasourceTelemetry,
  denseEquivalentBytes,
  emptyTelemetry,
  FEED_ROWS,
  FEED_SHEET,
  type FullExportAttempt,
  formatBytes,
  measureBulkMutation,
  PAGE_LATENCY_MS,
  PAGED_EVIDENCE,
  pagedStatsOf,
  queryCapabilityOf,
  SCALE_STORAGE,
  SCALE_THEME,
  type ScanAttempt,
  sweepCacheChurn,
  WIDE_METRIC_COLUMNS,
  WIDE_ROWS,
  WIDE_SHEET,
} from "../showcases/scenarios/scale.js";
import stylesheet from "../styles/showcase-performance.css?url";
import "@sheetwrite/core/styles.css";

declare global {
  interface Window {
    __sheetwriteScaleGrid?: Grid;
  }
}

const description =
  "Executable performance proof: one million paged rows, 121-column wide pages, cache churn under a fixed byte budget, Worker rendering with honest fallback, measured WASM boundary crossings, and committed benchmark evidence with full provenance.";

export const Route = createFileRoute("/showcases/performance")({
  head: () => ({
    meta: pageMeta("Performance and scale — Sheetwrite showcases", description),
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: PerformanceRoute,
});

const SECTIONS = [
  { id: "million-rows", label: "Million-row paging" },
  { id: "wide-page", label: "Wide pages" },
  { id: "cache-churn", label: "Cache churn" },
  { id: "worker", label: "Worker rendering" },
  { id: "wasm-crossings", label: "WASM crossings" },
  { id: "evidence", label: "Committed evidence" },
] as const;

interface RendererState {
  requested: "canvas" | "worker";
  active: "canvas" | "worker";
  fallback: string | null;
}

interface LiveStats {
  feed: PagedStoreStats | null;
  wide: PagedStoreStats | null;
  query: QueryCapability | null;
}

function PerformanceRoute() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const sweepCancelled = useRef(false);

  const [renderer, setRenderer] = useState<"canvas" | "worker">("canvas");
  const [rendererState, setRendererState] = useState<RendererState | null>(null);
  const [gridReady, setGridReady] = useState(false);
  const [activeSheet, setActiveSheet] = useState(FEED_SHEET);
  const [telemetry, setTelemetry] = useState<DatasourceTelemetry>(emptyTelemetry);
  const [stats, setStats] = useState<LiveStats>({ feed: null, wide: null, query: null });
  const [jumpRow, setJumpRow] = useState("742000");
  const [status, setStatus] = useState("Booting the WASM engine…");
  const [churn, setChurn] = useState<ChurnReport | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [crossings, setCrossings] = useState<CrossingReport[]>([]);
  const [exportAttempt, setExportAttempt] = useState<FullExportAttempt | null>(null);
  const [scan, setScan] = useState<ScanAttempt | null>(null);

  // One grid generation per renderer choice — the paint backend is
  // construction-bound, exactly as in a host application.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let grid: Grid | null = null;
    const unsubscribes: Array<() => void> = [];

    void initSheetwrite().then(() => {
      if (disposed) return;
      grid = createGrid(host, {
        workbook: createScaleWorkbook(),
        datasource: createScaleDataSource((update) => setTelemetry({ ...update })),
        datasourceStorage: SCALE_STORAGE,
        theme: SCALE_THEME,
        // Built-in sheet tabs stay off: this page owns sheet switching, and
        // the removable-tab affordance would let a click destroy the proof.
        config: { toolbar: false, tabs: false },
        renderer,
        ...(renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
      });
      grid.setFrozen(0, 1);
      gridRef.current = grid;
      window.__sheetwriteScaleGrid = grid;
      setRendererState({ requested: renderer, active: grid.rendererKind(), fallback: null });
      unsubscribes.push(
        grid.on("renderer-fallback", ({ error }) => {
          const reason = error instanceof Error ? error.message : String(error);
          setRendererState({
            requested: "worker",
            active: gridRef.current?.rendererKind() ?? "canvas",
            fallback: reason,
          });
        }),
      );
      setActiveSheet(FEED_SHEET);
      setGridReady(true);
      setStatus(
        `Mounted ${FEED_ROWS.toLocaleString()} paged rows with a ${formatBytes(SCALE_STORAGE.cacheBytes)} clean-chunk budget. Scroll anywhere.`,
      );
    });

    return () => {
      disposed = true;
      sweepCancelled.current = true;
      setGridReady(false);
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (gridRef.current === grid) {
        gridRef.current = null;
        delete window.__sheetwriteScaleGrid;
      }
      grid?.destroy();
    };
  }, [renderer]);

  // Live allocation truth, polled through the public paged-stats handle.
  useEffect(() => {
    const timer = setInterval(() => {
      const grid = gridRef.current;
      if (!grid) return;
      setStats({
        feed: pagedStatsOf(grid, FEED_SHEET),
        wide: pagedStatsOf(grid, WIDE_SHEET),
        query: queryCapabilityOf(grid, FEED_SHEET),
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleJump = () => {
    const grid = gridRef.current;
    const row = Number.parseInt(jumpRow, 10);
    if (!grid || !Number.isFinite(row)) return;
    const clamped = Math.min(Math.max(row - 1, 0), FEED_ROWS - 1);
    grid.setActiveSheet(FEED_SHEET);
    setActiveSheet(FEED_SHEET);
    grid.scrollToCell({ sheet: FEED_SHEET, row: clamped, col: 0 });
    setStatus(`Jumped to row ${(clamped + 1).toLocaleString()} — pages fetch on demand.`);
  };

  const handleSheet = (sheet: typeof FEED_SHEET | typeof WIDE_SHEET) => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.setActiveSheet(sheet);
    setActiveSheet(sheet);
    setStatus(
      sheet === WIDE_SHEET
        ? `Wide sheet active: ${WIDE_ROWS.toLocaleString()} rows × ${WIDE_METRIC_COLUMNS + 1} columns, still paged.`
        : `Telemetry feed active: ${FEED_ROWS.toLocaleString()} rows × 6 columns.`,
    );
  };

  const handleSweep = async () => {
    const grid = gridRef.current;
    if (!grid || sweeping) return;
    sweepCancelled.current = false;
    setSweeping(true);
    setStatus("Sweeping 24 far-apart pages across one million rows…");
    try {
      grid.setActiveSheet(FEED_SHEET);
      setActiveSheet(FEED_SHEET);
      const report = await sweepCacheChurn(grid, 24, () => sweepCancelled.current);
      setChurn(report);
      setStatus(
        report.withinBudget
          ? `Sweep done: ${report.jumps} long jumps, clean cache held at ${formatBytes(report.allocatedBytes)} ≤ ${formatBytes(report.cacheBudgetBytes)}.`
          : `Sweep done, but the cache exceeded its budget — that would be a bug.`,
      );
    } finally {
      setSweeping(false);
    }
  };

  const handleCrossings = (kind: "values" | "styles") => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.setActiveSheet(FEED_SHEET);
    setActiveSheet(FEED_SHEET);
    const report = measureBulkMutation(grid, kind, 20_000);
    setCrossings((previous) => [{ ...report }, ...previous.slice(0, 4)]);
    setStatus(
      `${kind === "values" ? "Value" : "Style"} commit over ${report.cells.toLocaleString()} cells crossed the WASM boundary ${report.ffiCalls} time${report.ffiCalls === 1 ? "" : "s"}.`,
    );
  };

  const handleExportAttempt = () => {
    const grid = gridRef.current;
    if (!grid) return;
    setExportAttempt(attemptFullCsvExport(grid, FEED_SHEET));
  };

  const handleScan = () => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.setActiveSheet(FEED_SHEET);
    setActiveSheet(FEED_SHEET);
    // Column 3 is Reading; the aggregate runs on the active (feed) sheet.
    setScan(attemptColumnScan(grid, 3, "sum"));
  };

  const activeStats = activeSheet === WIDE_SHEET ? stats.wide : stats.feed;
  const denseBytes = gridRef.current ? denseEquivalentBytes(gridRef.current, activeSheet) : 0;

  return (
    <div className="sw-sp-frame">
      <SiteTopbar />
      <main className="sw-sp-page">
        <header className="sw-sp-hero">
          <p className="sw-sp-eyebrow">SHOWCASE / PERFORMANCE AND SCALE</p>
          <h1>One million rows, measured in front of you.</h1>
          <p className="sw-sp-lede">
            The grid below owns a paged datasource of exactly {FEED_ROWS.toLocaleString()}{" "}
            deterministic rows. Every number in the live panels is read from the running engine
            through public APIs; every static number is a committed benchmark artifact with its
            capture provenance attached. Nothing on this page is an invented figure.
          </p>
          <nav aria-label="Page sections" className="sw-sp-sectionnav">
            {SECTIONS.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.label}
              </a>
            ))}
          </nav>
        </header>

        <p aria-live="polite" className="sw-sp-status" data-testid="scale-status" role="status">
          {status}
        </p>

        <section aria-labelledby="million-title" className="sw-sp-section" id="million-rows">
          <h2 id="million-title">Million-row paging</h2>
          <div className="sw-sp-workbench" data-ready={gridReady || undefined}>
            <div className="sw-sp-controls">
              <div className="sw-sp-sheettabs" role="toolbar" aria-label="Active sheet">
                <button
                  aria-pressed={activeSheet === FEED_SHEET}
                  data-testid="scale-sheet-feed"
                  onClick={() => handleSheet(FEED_SHEET)}
                  type="button"
                >
                  Telemetry feed (1M × 6)
                </button>
                <button
                  aria-pressed={activeSheet === WIDE_SHEET}
                  data-testid="scale-sheet-wide"
                  onClick={() => handleSheet(WIDE_SHEET)}
                  type="button"
                >
                  Wide metrics ({WIDE_ROWS.toLocaleString()} × {WIDE_METRIC_COLUMNS + 1})
                </button>
              </div>
              <div className="sw-sp-jump">
                <label htmlFor="scale-jump-row">Jump to row</label>
                <input
                  id="scale-jump-row"
                  data-testid="scale-jump-input"
                  inputMode="numeric"
                  onChange={(event) => setJumpRow(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleJump();
                  }}
                  value={jumpRow}
                />
                <button data-testid="scale-jump" onClick={handleJump} type="button">
                  Jump
                </button>
              </div>
            </div>
            <div className="sw-sp-grid" data-testid="scale-grid" ref={hostRef} />
            <dl className="sw-sp-stats" data-testid="scale-stats">
              <div>
                <dt>Loaded cells</dt>
                <dd data-testid="scale-loaded-cells">
                  {(activeStats?.loadedCells ?? 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Resident chunks</dt>
                <dd>{(activeStats?.chunks ?? 0).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Allocated now</dt>
                <dd data-testid="scale-allocated">
                  {formatBytes(activeStats?.allocatedBytes ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Dense equivalent</dt>
                <dd>{formatBytes(denseBytes)}</dd>
              </div>
              <div>
                <dt>Page requests</dt>
                <dd data-testid="scale-requests">{telemetry.requests.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Rows served / aborted</dt>
                <dd>
                  {telemetry.rowsServed.toLocaleString()} / {telemetry.aborted.toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
          <h3>Full-dataset operations stay honest</h3>
          <p>
            A paged sheet knows exactly how much of itself is loaded. Queries and exports that need
            the whole dataset refuse to fabricate the rest — they fail with a typed error carrying
            exact loaded/total counts instead of returning a silently wrong answer:
          </p>
          <div className="sw-sp-actions">
            <button data-testid="scale-scan-attempt" onClick={handleScan} type="button">
              Scan: SUM(Reading) over 1M rows
            </button>
            <button data-testid="scale-export-attempt" onClick={handleExportAttempt} type="button">
              Try full CSV export of 1M rows
            </button>
          </div>
          {scan && (
            <p
              className="sw-sp-verdictline"
              data-state={scan.ok ? "complete" : "incomplete"}
              data-testid="scale-scan-report"
            >
              {scan.ok
                ? `${scan.op} = ${scan.value.toLocaleString()} in ${scan.durationMs.toFixed(1)} ms — the sheet was fully loaded.`
                : `${scan.op} refused in ${scan.durationMs.toFixed(1)} ms with a typed IncompleteDataError: ${scan.loadedCells.toLocaleString()} of ${scan.totalCells.toLocaleString()} cells loaded.`}
            </p>
          )}
          {exportAttempt && (
            <p
              className="sw-sp-verdictline"
              data-state={exportAttempt.ok ? "complete" : "incomplete"}
              data-testid="scale-export-report"
            >
              {exportAttempt.ok
                ? `Export completed (${exportAttempt.bytes.toLocaleString()} bytes) — the sheet was fully loaded.`
                : `Typed IncompleteDataError: ${exportAttempt.loadedCells.toLocaleString()} of ${exportAttempt.totalCells.toLocaleString()} cells loaded. ${exportAttempt.message}`}
            </p>
          )}
          {stats.query && stats.query.status === "incomplete" && (
            <p className="sw-sp-note" data-testid="scale-query-state">
              Live query capability: incomplete — {stats.query.loadedCells.toLocaleString()} of{" "}
              {stats.query.totalCells.toLocaleString()} cells loaded.
            </p>
          )}
        </section>

        <section aria-labelledby="wide-title" className="sw-sp-section" id="wide-page">
          <h2 id="wide-title">Wide pages</h2>
          <p>
            The second sheet is {WIDE_METRIC_COLUMNS + 1} columns wide. Switch to it above and
            scroll horizontally: hydration is bounded by the visible window, and each served page
            carries {WIDE_METRIC_COLUMNS + 1} columns × {SCALE_STORAGE.chunkRows.toLocaleString()}
            -row chunks without materializing the sheet. The wide sheet's live counters appear in
            the same stats panel — watch “loaded cells” climb by whole pages while “allocated now”
            stays orders of magnitude under the{" "}
            {formatBytes(WIDE_ROWS * (WIDE_METRIC_COLUMNS + 1) * 8)} dense equivalent.
          </p>
        </section>

        <section aria-labelledby="churn-title" className="sw-sp-section" id="cache-churn">
          <h2 id="churn-title">Cache churn under a byte budget</h2>
          <p>
            Clean chunks live inside a {formatBytes(SCALE_STORAGE.cacheBytes)} cache. The sweep
            below performs 24 deterministic long jumps across the million-row feed — far more data
            than the budget holds — and then reads the allocation counters back.
          </p>
          <div className="sw-sp-actions">
            <button
              data-testid="scale-churn-run"
              disabled={sweeping}
              onClick={() => void handleSweep()}
              type="button"
            >
              {sweeping ? "Sweeping…" : "Sweep 24 distant pages"}
            </button>
          </div>
          {churn && (
            <dl
              className="sw-sp-report"
              data-state={churn.withinBudget ? "pass" : "fail"}
              data-testid="scale-churn-report"
            >
              <div>
                <dt>Long jumps</dt>
                <dd>{churn.jumps}</dd>
              </div>
              <div>
                <dt>Cells loaded lifetime</dt>
                <dd>{churn.loadedCells.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Resident chunks after sweep</dt>
                <dd>{churn.chunks.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Allocated after sweep</dt>
                <dd data-testid="scale-churn-allocated">{formatBytes(churn.allocatedBytes)}</dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd>{formatBytes(churn.cacheBudgetBytes)}</dd>
              </div>
              <div>
                <dt>Within budget</dt>
                <dd data-testid="scale-churn-verdict">{churn.withinBudget ? "yes" : "NO — bug"}</dd>
              </div>
            </dl>
          )}
        </section>

        <section aria-labelledby="worker-title" className="sw-sp-section" id="worker">
          <h2 id="worker-title">Worker rendering with honest fallback</h2>
          <p>
            The paint backend is chosen at construction. Requesting the Worker renderer paints
            through OffscreenCanvas off the main thread; if the worker cannot start, the grid falls
            back to the main-thread canvas and says so — <code>rendererKind()</code> reports what
            actually constructed, never what was requested.
          </p>
          <fieldset className="sw-sp-renderer">
            <legend>Paint backend (rebuilds the grid)</legend>
            <label>
              <input
                checked={renderer === "canvas"}
                data-testid="scale-renderer-canvas"
                name="renderer"
                onChange={() => setRenderer("canvas")}
                type="radio"
              />
              Main-thread canvas
            </label>
            <label>
              <input
                checked={renderer === "worker"}
                data-testid="scale-renderer-worker"
                name="renderer"
                onChange={() => setRenderer("worker")}
                type="radio"
              />
              Worker (OffscreenCanvas)
            </label>
          </fieldset>
          {rendererState && (
            <p
              className="sw-sp-verdictline"
              data-active={rendererState.active}
              data-testid="scale-renderer-state"
            >
              Requested <strong>{rendererState.requested}</strong>, running{" "}
              <strong data-testid="scale-renderer-active">{rendererState.active}</strong>
              {rendererState.fallback
                ? ` — fell back to the main-thread canvas: ${rendererState.fallback}`
                : "."}
            </p>
          )}
        </section>

        <section aria-labelledby="crossings-title" className="sw-sp-section" id="wasm-crossings">
          <h2 id="crossings-title">WASM boundary crossings, counted</h2>
          <p>
            Cell state lives in Rust/WASM. Bulk commits cross the JS↔WASM boundary a constant number
            of times per operation — not once per cell. The buttons commit a real, undoable
            transaction over 20,000 cells and read the engine's own allocation counters back.
          </p>
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
          {crossings.length > 0 && (
            <table className="sw-sp-table" data-testid="scale-crossings-table">
              <caption>Most recent bulk commits (newest first), measured live.</caption>
              <thead>
                <tr>
                  <th scope="col">Cells</th>
                  <th scope="col">WASM crossings</th>
                  <th scope="col">Document ops</th>
                  <th scope="col">JS patch objects</th>
                  <th scope="col">Max transferred array</th>
                  <th scope="col">Duration</th>
                </tr>
              </thead>
              <tbody>
                {crossings.map((report, index) => (
                  <tr
                    data-testid={index === 0 ? "scale-crossings-latest" : undefined}
                    key={[
                      report.cells,
                      report.ffiCalls,
                      report.documentOperations,
                      report.jsPatchObjects,
                      report.maxTransferredArrayLength,
                      report.durationMs,
                    ].join("-")}
                  >
                    <td>{report.cells.toLocaleString()}</td>
                    <td data-testid={index === 0 ? "scale-crossings-ffi" : undefined}>
                      {report.ffiCalls}
                    </td>
                    <td>{report.documentOperations}</td>
                    <td>{report.jsPatchObjects}</td>
                    <td>{report.maxTransferredArrayLength.toLocaleString()}</td>
                    <td>{report.durationMs.toFixed(1)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="evidence-title" className="sw-sp-section" id="evidence">
          <h2 id="evidence-title">Committed benchmark evidence</h2>
          <p>
            The numbers below were <em>not</em> measured in your browser. They are committed
            benchmark artifacts, reproduced verbatim with their capture provenance, produced by the
            repository's benchmark protocol (<code>bench/README.md</code>).
          </p>
          <h3>Paged storage protocol</h3>
          <p className="sw-sp-provenance" data-testid="scale-evidence-paged-provenance">
            Source <code>{PAGED_EVIDENCE.source}</code> — {PAGED_EVIDENCE.protocol},{" "}
            {PAGED_EVIDENCE.rows.toLocaleString()} rows × {PAGED_EVIDENCE.columns} columns,{" "}
            {PAGED_EVIDENCE.pageRows}-row pages, {formatBytes(PAGED_EVIDENCE.cacheBudgetBytes)}{" "}
            cache budget.
          </p>
          <table className="sw-sp-table" data-testid="scale-evidence-paged">
            <caption>Committed paged-storage timings and allocation ceilings.</caption>
            <thead>
              <tr>
                <th scope="col">Measurement</th>
                <th scope="col">Median</th>
                <th scope="col">p95</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Startup (1M-row workbook)</th>
                <td>{PAGED_EVIDENCE.startup.medianMs.toFixed(2)} ms</td>
                <td>{PAGED_EVIDENCE.startup.p95Ms.toFixed(2)} ms</td>
              </tr>
              <tr>
                <th scope="row">First page visible</th>
                <td>{PAGED_EVIDENCE.firstPage.medianMs.toFixed(2)} ms</td>
                <td>{PAGED_EVIDENCE.firstPage.p95Ms.toFixed(2)} ms</td>
              </tr>
              <tr>
                <th scope="row">Distant page (long jump)</th>
                <td>{PAGED_EVIDENCE.distantPage.medianMs.toFixed(2)} ms</td>
                <td>{PAGED_EVIDENCE.distantPage.p95Ms.toFixed(2)} ms</td>
              </tr>
              <tr>
                <th scope="row">Peak allocated</th>
                <td colSpan={2}>
                  {formatBytes(PAGED_EVIDENCE.peakAllocatedBytes)} vs{" "}
                  {formatBytes(PAGED_EVIDENCE.denseLogicalBytes)} dense logical
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Scenario probes</h3>
          <table className="sw-sp-table">
            <caption>
              Committed allocation probes from the same artifact: chunks, loaded cells, and WASM
              memory delta per scripted scenario.
            </caption>
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Chunks</th>
                <th scope="col">Loaded cells</th>
                <th scope="col">Allocated</th>
                <th scope="col">WASM Δ</th>
              </tr>
            </thead>
            <tbody>
              {PAGED_EVIDENCE.probes.map((probe) => (
                <tr key={probe.scenario}>
                  <th scope="row">{probe.scenario}</th>
                  <td>{probe.chunks.toLocaleString()}</td>
                  <td>{probe.loadedCells.toLocaleString()}</td>
                  <td>{formatBytes(probe.allocatedBytes)}</td>
                  <td>{formatBytes(probe.wasmDeltaBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {COMPARISON_EVIDENCE.available && (
            <>
              <h3>Cross-grid comparison capture</h3>
              <p className="sw-sp-provenance" data-testid="scale-evidence-compare-provenance">
                Source <code>{COMPARISON_EVIDENCE.source}</code> — captured{" "}
                {new Date(COMPARISON_EVIDENCE.capture.timestamp).toISOString().slice(0, 10)} on{" "}
                {COMPARISON_EVIDENCE.capture.browser}, {COMPARISON_EVIDENCE.capture.rounds} rounds,
                commit <code>{COMPARISON_EVIDENCE.capture.commit.slice(0, 10)}</code>.
              </p>
              <table className="sw-sp-table" data-testid="scale-evidence-compare">
                <caption>
                  Median per-scenario speed ratio versus Handsontable across{" "}
                  {COMPARISON_EVIDENCE.heroStats.millionRowScenarios} interaction scenarios.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rows</th>
                    <th scope="col">Scenarios compared</th>
                    <th scope="col">Median ratio</th>
                    <th scope="col">Best scenario</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_EVIDENCE.sizes.map((size) => (
                    <tr key={size.size}>
                      <th scope="row">{size.size.toLocaleString()}</th>
                      <td>
                        {size.comparedScenarios}
                        {size.handsontableIncomplete > 0
                          ? ` (${size.handsontableIncomplete} incomplete on Handsontable)`
                          : ""}
                      </td>
                      <td>{size.medianRatio.toFixed(1)}×</td>
                      <td>
                        {size.bestScenario} ({size.bestRatio.toFixed(1)}×)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="sw-sp-note">
            Live panels above measure this very page: page latency here is a deliberate{" "}
            {PAGE_LATENCY_MS} ms simulation so lazy loading stays visible, so live numbers and
            committed benchmark numbers are not comparable to each other — and are never mixed.
          </p>
        </section>
      </main>
    </div>
  );
}
