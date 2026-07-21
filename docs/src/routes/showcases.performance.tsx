import type {
  Grid,
  PagedStoreStats,
  QueryCapability,
  RuntimeResourcePhaseDelta,
  RuntimeResourceSnapshot,
} from "@sheetwrite/core";
import { createGrid, diffRuntimeResourcePhases, initSheetwrite } from "@sheetwrite/core";
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
  SCALE_SHEETS,
  SCALE_STORAGE,
  SCALE_THEME,
  type ScaleSheetId,
  type ScanAttempt,
  scaleSheetDescriptor,
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
  "Executable performance showcase: one million paged rows, 121-column wide pages, cache churn under a fixed byte budget, Worker rendering with honest fallback, measured WASM boundary crossings, versioned runtime resource ownership, and committed benchmark evidence with full provenance.";

function formatByteDelta(bytes: number): string {
  if (bytes === 0) return "0 B";
  return `${bytes > 0 ? "+" : "−"}${formatBytes(Math.abs(bytes))}`;
}

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
  { id: "resource-ownership", label: "Resource ownership" },
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
  resource: RuntimeResourceSnapshot | null;
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
  const [stats, setStats] = useState<LiveStats>({
    feed: null,
    wide: null,
    query: null,
    resource: null,
  });
  const [jumpRow, setJumpRow] = useState("742000");
  const [status, setStatus] = useState("Booting the WASM engine…");
  const [churn, setChurn] = useState<ChurnReport | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [crossings, setCrossings] = useState<CrossingReport[]>([]);
  const [exportAttempt, setExportAttempt] = useState<FullExportAttempt | null>(null);
  const [scan, setScan] = useState<ScanAttempt | null>(null);
  const [resourceDelta, setResourceDelta] = useState<RuntimeResourcePhaseDelta | null>(null);

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
        // the removable-tab affordance would let a click destroy the scenario.
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
        `Mounted a virtual ${FEED_ROWS.toLocaleString()}-row workbook. The resident clean-chunk cache is capped at ${formatBytes(SCALE_STORAGE.cacheBytes)} and evicts older pages as you scroll.`,
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

  useEffect(() => {
    const observer = new MutationObserver(() => gridRef.current?.replaceTheme(SCALE_THEME));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Live allocation truth, polled through the public paged-stats handle.
  useEffect(() => {
    const timer = setInterval(() => {
      const grid = gridRef.current;
      if (!grid) return;
      setStats({
        feed: pagedStatsOf(grid, FEED_SHEET),
        wide: pagedStatsOf(grid, WIDE_SHEET),
        query: queryCapabilityOf(grid, FEED_SHEET),
        resource: grid.getRuntimeResourceSnapshot("scroll", "settled"),
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleJump = () => {
    const grid = gridRef.current;
    if (!grid) return;
    const descriptor = scaleSheetDescriptor(grid.getActiveSheet());
    const raw = jumpRow.trim();
    if (!/^\d+$/.test(raw)) {
      setStatus(
        `Enter a whole row from 1 to ${descriptor.rowCount.toLocaleString()} for ${descriptor.label}.`,
      );
      return;
    }
    const requestedRow = Number(raw);
    if (!Number.isSafeInteger(requestedRow) || requestedRow < 1) {
      setStatus(
        `Enter a whole row from 1 to ${descriptor.rowCount.toLocaleString()} for ${descriptor.label}.`,
      );
      return;
    }
    const resolvedRow = Math.min(requestedRow, descriptor.rowCount);
    grid.scrollToCell({ sheet: descriptor.id, row: resolvedRow - 1, col: 0 });
    setStatus(
      resolvedRow === requestedRow
        ? `Jumped to ${descriptor.label} row ${resolvedRow.toLocaleString()} — pages fetch on demand.`
        : `Requested ${descriptor.label} row ${requestedRow.toLocaleString()}; clamped to row ${resolvedRow.toLocaleString()} (sheet maximum).`,
    );
  };

  const handleSheet = (sheet: ScaleSheetId) => {
    const grid = gridRef.current;
    if (!grid) return;
    const descriptor = scaleSheetDescriptor(sheet);
    grid.setActiveSheet(descriptor.id);
    setActiveSheet(descriptor.id);
    setStatus(
      descriptor.id === WIDE_SHEET
        ? `${descriptor.label} active: ${descriptor.rowCount.toLocaleString()} rows × ${WIDE_METRIC_COLUMNS + 1} columns, still paged.`
        : `${descriptor.label} active: ${descriptor.rowCount.toLocaleString()} rows × 6 columns.`,
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
    const before = grid.getRuntimeResourceSnapshot("edit", "before");
    const report = measureBulkMutation(grid, kind, 20_000);
    const after = grid.getRuntimeResourceSnapshot("edit", "settled");
    setResourceDelta(diffRuntimeResourcePhases(before, after));
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

  const activeSheetDescriptor = scaleSheetDescriptor(activeSheet);
  const activeStats = activeSheet === WIDE_SHEET ? stats.wide : stats.feed;
  const denseBytes = gridRef.current ? denseEquivalentBytes(gridRef.current, activeSheet) : 0;
  const cachePct = Math.min(
    ((activeStats?.allocatedBytes ?? 0) / SCALE_STORAGE.cacheBytes) * 100,
    100,
  );
  const wideDenseBytes = WIDE_ROWS * (WIDE_METRIC_COLUMNS + 1) * 8;
  const wideAllocated = stats.wide?.allocatedBytes ?? 0;
  const latest = crossings[0];
  const maxMedianRatio = COMPARISON_EVIDENCE.available
    ? Math.max(...COMPARISON_EVIDENCE.sizes.map((size) => size.medianRatio), 1)
    : 1;
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

  return (
    <div className="sw-sp-frame">
      <SiteTopbar active="performance" />
      <main className="sw-sp-page">
        <header className="sw-sp-hero">
          <p className="sw-sp-eyebrow">SHOWCASE / PERFORMANCE AND SCALE</p>
          <h1>One million rows, measured in front of you.</h1>
          <p className="sw-sp-lede">
            The grid below owns a paged datasource of exactly {FEED_ROWS.toLocaleString()}{" "}
            deterministic rows. Live panels read the running engine through public APIs; committed
            numbers are benchmark artifacts with capture provenance. Protocol details live in the{" "}
            <a href="/docs/guides/performance-resources/">performance guide</a>.
          </p>
        </header>

        <nav aria-label="Page sections" className="sw-sp-sectionnav">
          {SECTIONS.map((section) => (
            <a href={`#${section.id}`} key={section.id}>
              {section.label}
            </a>
          ))}
        </nav>

        <p aria-live="polite" className="sw-sp-status" data-testid="scale-status" role="status">
          {status}
        </p>

        <section aria-labelledby="million-title" className="sw-sp-section" id="million-rows">
          <h2 id="million-title">Million-row paging</h2>
          <div className="sw-sp-workbench" data-ready={gridReady || undefined}>
            <div className="sw-sp-controls">
              <div aria-label="Active sheet" className="sw-sp-seg" role="toolbar">
                <button
                  aria-pressed={activeSheet === FEED_SHEET}
                  data-testid="scale-sheet-feed"
                  onClick={() => handleSheet(FEED_SHEET)}
                  type="button"
                >
                  <span className="sw-sp-seg__label">{SCALE_SHEETS[FEED_SHEET].label}</span>
                  <span className="sw-sp-seg__dims">1M × 6</span>
                </button>
                <button
                  aria-pressed={activeSheet === WIDE_SHEET}
                  data-testid="scale-sheet-wide"
                  onClick={() => handleSheet(WIDE_SHEET)}
                  type="button"
                >
                  <span className="sw-sp-seg__label">{SCALE_SHEETS[WIDE_SHEET].label}</span>
                  <span className="sw-sp-seg__dims">
                    {WIDE_ROWS.toLocaleString()} × {WIDE_METRIC_COLUMNS + 1}
                  </span>
                </button>
              </div>
              <div className="sw-sp-jump">
                <label htmlFor="scale-jump-row">Jump to row</label>
                <div className="sw-sp-jump__field">
                  <input
                    id="scale-jump-row"
                    data-testid="scale-jump-input"
                    inputMode="numeric"
                    aria-describedby="scale-jump-help scale-status"
                    max={activeSheetDescriptor.rowCount}
                    min={1}
                    onChange={(event) => setJumpRow(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleJump();
                    }}
                    step={1}
                    type="number"
                    value={jumpRow}
                  />
                  <button
                    data-testid="scale-jump"
                    data-variant="primary"
                    onClick={handleJump}
                    type="button"
                  >
                    Jump
                  </button>
                </div>
                <p className="sw-sp-stat-context" id="scale-jump-help">
                  {activeSheetDescriptor.label}: rows 1–
                  {activeSheetDescriptor.rowCount.toLocaleString()}.
                </p>
              </div>
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: Sheetwrite upgrades this canvas host into a virtualized ARIA grid; a table cannot host the runtime. */}
            <div
              aria-label="Million-row telemetry grid"
              role="grid"
              className="sw-sp-grid"
              data-testid="scale-grid"
              ref={hostRef}
            />
            <dl className="sw-sp-stats" data-testid="scale-stats">
              <div>
                <dt>Cells resident now</dt>
                <dd data-testid="scale-loaded-cells">
                  {(activeStats?.loadedCells ?? 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Resident chunks</dt>
                <dd>{(activeStats?.chunks ?? 0).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Resident cache</dt>
                <dd data-testid="scale-allocated">
                  {formatBytes(activeStats?.allocatedBytes ?? 0)}
                </dd>
                <dd className="sw-sp-stat-context">
                  {cachePct >= 99.5 ? "Evicting" : `${Math.round(cachePct)}% of budget`}
                </dd>
                <dd aria-hidden="true" className="sw-sp-minimeter">
                  <span style={{ width: `${cachePct}%` }} />
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
          <div className="sw-sp-console">
            <div className="sw-sp-console__intro">
              <h3>Full-dataset operations stay honest</h3>
              <p>
                Whole-dataset queries and exports refuse to fabricate unloaded rows. This expected
                bounded refusal returns a typed{" "}
                <a href="/docs/api/core/incomplete-data-error/">IncompleteDataError</a> with exact
                loaded and total counts.
              </p>
            </div>
            <div className="sw-sp-actions">
              <button
                data-testid="scale-scan-attempt"
                data-variant="primary"
                onClick={handleScan}
                type="button"
              >
                Scan: SUM(Reading) over 1M rows
              </button>
              <button
                data-testid="scale-export-attempt"
                onClick={handleExportAttempt}
                type="button"
              >
                Try full CSV export of 1M rows
              </button>
            </div>
            {scan && (
              <p
                className="sw-sp-verdictline"
                data-state={scan.ok ? "complete" : "incomplete"}
                data-testid="scale-scan-report"
              >
                <span className="sw-sp-verdictline__tag">
                  {scan.ok ? "Complete" : "Expected refusal"}
                </span>
                {scan.ok
                  ? `${scan.op} = ${scan.value.toLocaleString()} in ${scan.durationMs.toFixed(1)} ms — the sheet was fully loaded.`
                  : `${scan.op} stopped safely in ${scan.durationMs.toFixed(1)} ms: ${scan.loadedCells.toLocaleString()} of ${scan.totalCells.toLocaleString()} cells are resident. IncompleteDataError prevents a fabricated full-dataset result.`}
              </p>
            )}
            {exportAttempt && (
              <p
                className="sw-sp-verdictline"
                data-state={exportAttempt.ok ? "complete" : "incomplete"}
                data-testid="scale-export-report"
              >
                <span className="sw-sp-verdictline__tag">
                  {exportAttempt.ok ? "Complete" : "Expected refusal"}
                </span>
                {exportAttempt.ok
                  ? `Export completed (${exportAttempt.bytes.toLocaleString()} bytes) — the sheet was fully loaded.`
                  : `${exportAttempt.loadedCells.toLocaleString()} of ${exportAttempt.totalCells.toLocaleString()} cells are resident. IncompleteDataError prevented a partial CSV from being presented as a full export. ${exportAttempt.message}`}
              </p>
            )}
            {stats.query && stats.query.status === "incomplete" && (
              <p className="sw-sp-note" data-testid="scale-query-state">
                Live query capability: incomplete — {stats.query.loadedCells.toLocaleString()} of{" "}
                {stats.query.totalCells.toLocaleString()} cells loaded.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="wide-title" className="sw-sp-section" id="wide-page">
          <h2 id="wide-title">Wide pages</h2>
          <p>
            The second sheet is {WIDE_METRIC_COLUMNS + 1} columns wide and still paged — hydration
            is bounded by the visible window, never by the sheet.
          </p>
          <div className="sw-sp-console">
            <dl className="sw-sp-chips">
              <div className="sw-sp-chip">
                <dt>Rows × columns</dt>
                <dd>
                  {WIDE_ROWS.toLocaleString()} × {WIDE_METRIC_COLUMNS + 1}
                </dd>
              </div>
              <div className="sw-sp-chip">
                <dt>Served page</dt>
                <dd>
                  {WIDE_METRIC_COLUMNS + 1} cols × {SCALE_STORAGE.chunkRows.toLocaleString()} rows
                </dd>
              </div>
              <div className="sw-sp-chip">
                <dt>Loaded cells (live)</dt>
                <dd>{(stats.wide?.loadedCells ?? 0).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="sw-sp-compare">
              <div className="sw-sp-compare__row">
                <span className="sw-sp-compare__label">Dense equivalent</span>
                <span className="sw-sp-compare__track">
                  <span
                    className="sw-sp-compare__bar sw-sp-compare__bar--dense"
                    style={{ width: "100%" }}
                  />
                </span>
                <span className="sw-sp-compare__value">{formatBytes(wideDenseBytes)}</span>
              </div>
              <div className="sw-sp-compare__row">
                <span className="sw-sp-compare__label">Paged, live</span>
                <span className="sw-sp-compare__track">
                  <span
                    className="sw-sp-compare__bar sw-sp-compare__bar--live"
                    style={{ width: `${Math.max((wideAllocated / wideDenseBytes) * 100, 0.75)}%` }}
                  />
                </span>
                <span className="sw-sp-compare__value">{formatBytes(wideAllocated)}</span>
              </div>
              <p className="sw-sp-compare__note">
                {wideAllocated > 0
                  ? `Live allocation is ${Math.max(Math.round(wideDenseBytes / wideAllocated), 1).toLocaleString()}× smaller than the dense equivalent.`
                  : "Activate the wide sheet to watch pages hydrate; its live counters share the stats strip above."}
              </p>
            </div>
            <div className="sw-sp-actions">
              <button data-variant="quiet" onClick={() => handleSheet(WIDE_SHEET)} type="button">
                Activate the wide sheet
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="churn-title" className="sw-sp-section" id="cache-churn">
          <h2 id="churn-title">Cache churn under a byte budget</h2>
          <p>
            Clean chunks live inside a {formatBytes(SCALE_STORAGE.cacheBytes)} cache — far less than
            24 deterministic long jumps across the million-row feed will touch.
          </p>
          <div className="sw-sp-console">
            <div className="sw-sp-actions">
              <button
                data-testid="scale-churn-run"
                data-variant="primary"
                disabled={sweeping}
                onClick={() => void handleSweep()}
                type="button"
              >
                {sweeping ? "Sweeping…" : "Sweep 24 distant pages"}
              </button>
            </div>
            {churn && (
              <div
                className="sw-sp-churn"
                data-state={churn.withinBudget ? "pass" : "fail"}
                data-testid="scale-churn-report"
              >
                <div className="sw-sp-gauge">
                  <div className="sw-sp-gauge__head">
                    <span>Clean cache after sweep</span>
                    <strong data-testid="scale-churn-allocated">
                      {formatBytes(churn.allocatedBytes)}
                    </strong>
                  </div>
                  <meter
                    aria-label="Clean cache after sweep"
                    aria-valuetext={`${formatBytes(churn.allocatedBytes)} of ${formatBytes(churn.cacheBudgetBytes)} budget`}
                    className="sw-visually-hidden"
                    max={churn.cacheBudgetBytes}
                    min={0}
                    value={churn.allocatedBytes}
                  />
                  <div aria-hidden="true" className="sw-sp-gauge__track">
                    <span
                      style={{
                        width: `${Math.min((churn.allocatedBytes / churn.cacheBudgetBytes) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div aria-hidden="true" className="sw-sp-gauge__scale">
                    <span>0</span>
                    <span>{formatBytes(churn.cacheBudgetBytes)} budget</span>
                  </div>
                </div>
                <dl className="sw-sp-chips">
                  <div className="sw-sp-chip">
                    <dt>Long jumps</dt>
                    <dd>{churn.jumps}</dd>
                  </div>
                  <div className="sw-sp-chip">
                    <dt>Cells loaded lifetime</dt>
                    <dd>{churn.loadedCells.toLocaleString()}</dd>
                  </div>
                  <div className="sw-sp-chip">
                    <dt>Resident chunks</dt>
                    <dd>{churn.chunks.toLocaleString()}</dd>
                  </div>
                  <div className="sw-sp-chip">
                    <dt>Within budget</dt>
                    <dd data-testid="scale-churn-verdict">
                      {churn.withinBudget ? "yes" : "NO — bug"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="worker-title" className="sw-sp-section" id="worker">
          <h2 id="worker-title">Worker rendering with honest fallback</h2>
          <p>
            The paint backend is chosen at construction, and <code>rendererKind()</code> reports
            what actually constructed — never what was requested. See the{" "}
            <a href="/docs/guides/worker-rendering/">Worker rendering guide</a>.
          </p>
          <div className="sw-sp-console">
            <fieldset className="sw-sp-renderer">
              <legend>Paint backend (rebuilds the grid)</legend>
              <label className="sw-sp-renderer__option">
                <input
                  checked={renderer === "canvas"}
                  data-testid="scale-renderer-canvas"
                  name="renderer"
                  onChange={() => setRenderer("canvas")}
                  type="radio"
                />
                <span>Main-thread canvas</span>
                <span className="sw-sp-renderer__hint">paints on the UI thread</span>
              </label>
              <label className="sw-sp-renderer__option">
                <input
                  checked={renderer === "worker"}
                  data-testid="scale-renderer-worker"
                  name="renderer"
                  onChange={() => setRenderer("worker")}
                  type="radio"
                />
                <span>Worker (OffscreenCanvas)</span>
                <span className="sw-sp-renderer__hint">off-thread paint, honest fallback</span>
              </label>
            </fieldset>
            {rendererState && (
              <p
                className="sw-sp-rendererstate"
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
          </div>
        </section>

        <section aria-labelledby="crossings-title" className="sw-sp-section" id="wasm-crossings">
          <h2 id="crossings-title">WASM boundary crossings, counted</h2>
          <p>
            Cell state lives in Rust/WASM; bulk commits cross the JS↔WASM boundary a constant number
            of times per operation — not once per cell. Each button commits a real, undoable
            transaction over 20,000 cells.
          </p>
          <div className="sw-sp-console">
            <div className="sw-sp-actions">
              <button
                data-testid="scale-crossings-values"
                data-variant="primary"
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
            {latest && (
              <div className="sw-sp-flow">
                <div className="sw-sp-flow__node">
                  <strong>{latest.cells.toLocaleString()}</strong>
                  <span>cells committed</span>
                </div>
                <div className="sw-sp-flow__bridge">
                  <strong>{latest.ffiCalls}</strong>
                  <span>boundary crossings</span>
                </div>
                <div className="sw-sp-flow__node">
                  <strong>{latest.durationMs.toFixed(1)} ms</strong>
                  <span>commit duration</span>
                </div>
              </div>
            )}
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
          </div>
        </section>

        <section
          aria-labelledby="resource-ownership-title"
          className="sw-sp-section"
          id="resource-ownership"
        >
          <h2 id="resource-ownership-title">Runtime resource ownership</h2>
          <p>
            This live snapshot uses public resource protocol v
            <span data-testid="scale-resource-schema">{stats.resource?.schemaVersion ?? "—"}</span>.
            Logical payload, allocated capacity, and committed WASM pages stay separate: committed
            pages are a runtime observation and are never added to live owner totals.
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
                {stats.resource?.wasm.wasmCommittedBytes === null ||
                stats.resource?.wasm.wasmCommittedBytes === undefined
                  ? "Unavailable"
                  : formatBytes(stats.resource.wasm.wasmCommittedBytes)}
              </dd>
            </div>
          </dl>
          <div className="sw-sp-tablewrap">
            <table className="sw-sp-table" data-testid="scale-resource-owners">
              <caption>Largest live owners in the mounted grid, measured in this browser.</caption>
              <thead>
                <tr>
                  <th scope="col">Exclusive owner</th>
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
          {resourceDelta && (
            <div className="sw-sp-evidence" data-testid="scale-resource-delta">
              <h3>Latest measured bulk-edit delta</h3>
              <p className="sw-sp-provenance">
                Protocol v{resourceDelta.schemaVersion}, {resourceDelta.operation},{" "}
                {resourceDelta.from} → {resourceDelta.to}. Zero-change owners are omitted.
              </p>
              {changedResourceOwners.length === 0 ? (
                <p>No retained owner changed; the operation reused existing capacity.</p>
              ) : (
                <div className="sw-sp-tablewrap">
                  <table className="sw-sp-table">
                    <thead>
                      <tr>
                        <th scope="col">Exclusive owner</th>
                        <th scope="col">Logical Δ</th>
                        <th scope="col">Allocated Δ</th>
                        <th scope="col">Entries Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedResourceOwners.map((owner) => (
                        <tr key={owner.owner}>
                          <th scope="row">
                            <code>{owner.owner}</code>
                          </th>
                          <td>{formatByteDelta(owner.logicalBytes)}</td>
                          <td>{formatByteDelta(owner.allocatedBytes)}</td>
                          <td>
                            {owner.entries > 0 ? "+" : ""}
                            {owner.entries.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="evidence-title" className="sw-sp-section" id="evidence">
          <h2 id="evidence-title">Committed benchmark evidence</h2>
          <p>
            The numbers below were <em>not</em> measured in your browser — they are committed
            benchmark artifacts, reproduced verbatim with capture provenance from the repository's
            benchmark protocol (<code>bench/README.md</code>).
          </p>
          <h3>Paged storage protocol</h3>
          <div className="sw-sp-evidence">
            <p className="sw-sp-provenance" data-testid="scale-evidence-paged-provenance">
              Source <code>{PAGED_EVIDENCE.source}</code> — {PAGED_EVIDENCE.protocol},{" "}
              {PAGED_EVIDENCE.rows.toLocaleString()} rows × {PAGED_EVIDENCE.columns} columns,{" "}
              {PAGED_EVIDENCE.pageRows}-row pages, {formatBytes(PAGED_EVIDENCE.cacheBudgetBytes)}{" "}
              cache budget.
            </p>
            <div className="sw-sp-tablewrap">
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
            </div>
          </div>
          <h3>Scenario probes</h3>
          <div className="sw-sp-evidence">
            <div className="sw-sp-tablewrap">
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
            </div>
          </div>
          {COMPARISON_EVIDENCE.available && (
            <>
              <h3>Cross-grid comparison capture</h3>
              <div className="sw-sp-evidence">
                <p className="sw-sp-provenance" data-testid="scale-evidence-compare-provenance">
                  Source <code>{COMPARISON_EVIDENCE.source}</code> — captured{" "}
                  {new Date(COMPARISON_EVIDENCE.capture.timestamp).toISOString().slice(0, 10)} on{" "}
                  {COMPARISON_EVIDENCE.capture.browser}, {COMPARISON_EVIDENCE.capture.rounds}{" "}
                  rounds, commit <code>{COMPARISON_EVIDENCE.capture.commit.slice(0, 10)}</code>.
                </p>
                <div className="sw-sp-tablewrap">
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
                          <td>
                            <span className="sw-sp-ratio">
                              <span
                                aria-hidden="true"
                                className="sw-sp-ratio__bar"
                                style={{
                                  width: `${Math.max((size.medianRatio / maxMedianRatio) * 100, 6)}%`,
                                }}
                              />
                              <span className="sw-sp-ratio__value">
                                {size.medianRatio.toFixed(1)}×
                              </span>
                            </span>
                          </td>
                          <td>
                            {size.bestScenario} ({size.bestRatio.toFixed(1)}×)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          <p className="sw-sp-note sw-sp-note--rule">
            Live panels measure this very page — page latency is a deliberate {PAGE_LATENCY_MS} ms
            simulation so lazy loading stays visible. Live numbers and committed benchmark numbers
            are not comparable to each other, and are never mixed.
          </p>
        </section>
      </main>
    </div>
  );
}
