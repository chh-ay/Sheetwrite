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
import { CapabilityHero } from "../showcases/CapabilityHero.js";
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
  SCALE_EVICTION_STRESS_STORAGE,
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
  "A real canvas and Worker Grid over exactly 1,000,000 rows by 1,000 columns: one billion logical addresses with windowed loading, a bounded clean cache, sparse durable edits, and measured runtime evidence.";

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
const SCALE_OVERSCAN = 4;

const COMPARISON_LOG_MAX_EXPONENT = COMPARISON_EVIDENCE.available
  ? Math.max(
      1,
      Math.ceil(
        Math.log10(
          Math.max(...COMPARISON_EVIDENCE.sizes.map((size) => Math.max(size.medianRatio, 1))),
        ),
      ),
    )
  : 1;
const COMPARISON_LOG_TICKS = Array.from(
  { length: COMPARISON_LOG_MAX_EXPONENT + 1 },
  (_, exponent) => 10 ** exponent,
);

function comparisonLogPercent(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 1) return 0;
  return Math.min(100, (Math.log10(ratio) / COMPARISON_LOG_MAX_EXPONENT) * 100);
}

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
function selectedCellAddress(selection: Selection | null): CellAddress | null {
  if (!selection) return null;
  if (selection.kind === "cell") return selection.addr;
  if (selection.kind === "range") return { sheet: FEED_SHEET, ...selection.range.start };
  if (selection.kind === "multi") {
    const start = selection.ranges[0]?.start;
    return start ? { sheet: FEED_SHEET, ...start } : null;
  }
  return null;
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
  const zoomRef = useRef(1);
  const visibleRef = useRef<VisibleWindow>({
    firstRow: 0,
    lastRow: 0,
    scrollLeft: 0,
    firstColumn: 0,
    lastColumn: 0,
  });
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
  const [selectedAddress, setSelectedAddress] = useState<CellAddress>({
    sheet: FEED_SHEET,
    row: 0,
    col: 0,
  });
  const [zoom, setZoom] = useState(1);
  const [evictionStress, setEvictionStress] = useState(false);
  const [jumpRow, setJumpRow] = useState("742000");
  const [jumpColumn, setJumpColumn] = useState("4");
  const [status, setStatus] = useState("Loading the WASM engine on demand…");
  const [crossings, setCrossings] = useState<CrossingReport[]>([]);
  const [exportAttempt, setExportAttempt] = useState<FullExportAttempt | null>(null);
  const [scan, setScan] = useState<ScanAttempt | null>(null);
  const [resourceDelta, setResourceDelta] = useState<RuntimeResourcePhaseDelta | null>(null);
  const [evictionWatch, setEvictionWatch] = useState<EvictionWatch | null>(null);
  const activeStorage = evictionStress ? SCALE_EVICTION_STRESS_STORAGE : SCALE_STORAGE;

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
          datasourceStorage: activeStorage,
          theme: SCALE_THEME,
          presentation: "data-grid",
          config: {
            toolbar: false,
            tabs: false,
            keyboard: (event, mountedGrid) => {
              if (
                event.key !== "PageUp" ||
                event.shiftKey ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey
              ) {
                return false;
              }
              const selected = mountedGrid.getSelection();
              if (selected?.kind !== "cell") return false;

              const window = visibleRef.current;
              const pageRows = Math.max(1, window.lastRow - window.firstRow + 1);
              const selectedAddr = {
                ...selected.addr,
                row: Math.max(0, window.firstRow - pageRows),
              };
              mountedGrid.setSelection({ kind: "cell", addr: selectedAddr });
              mountedGrid.scrollToCell(selectedAddr);
              event.preventDefault();
              return true;
            },
          },
          renderer,
          overscan: evictionStress ? 0 : SCALE_OVERSCAN,
          ...(renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
        });
        gridRef.current = grid;
        window.__sheetwriteScaleGrid = grid;
        grid.setZoom(zoomRef.current);
        setRendererState({ requested: renderer, active: grid.rendererKind(), fallback: null });
        setSelection(selectionA1(grid.getSelection()));
        setSelectedAddress(
          selectedCellAddress(grid.getSelection()) ?? { sheet: FEED_SHEET, row: 0, col: 0 },
        );
        unsubscribes.push(
          grid.on("scroll", (event) => {
            const nextVisible = {
              firstRow: event.firstRow,
              lastRow: event.lastRow,
              scrollLeft: event.scrollLeft,
              firstColumn: event.firstVisibleColumn ?? 0,
              lastColumn: event.lastVisibleColumn ?? event.firstVisibleColumn ?? 0,
            };
            visibleRef.current = nextVisible;
            setVisible(nextVisible);
          }),
          grid.on("selection", ({ selection: next }) => {
            setSelection(selectionA1(next));
            const address = selectedCellAddress(next);
            if (address) setSelectedAddress(address);
          }),
          grid.on("edit-commit", ({ addr }) => {
            const mountedGrid = gridRef.current;
            const cleanRow =
              addr.row >= SCALE_STORAGE.chunkRows
                ? addr.row - SCALE_STORAGE.chunkRows
                : Math.min(SCALE_ROWS - 1, addr.row + SCALE_STORAGE.chunkRows);
            const clean = { ...addr, row: cleanRow };
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
          `${evictionStress ? "Optional 1 MiB eviction stress active. " : ""}Ready: exactly ${SCALE_ROWS.toLocaleString()} rows × ${SCALE_COLUMNS.toLocaleString()} columns = ${SCALE_LOGICAL_CELLS.toLocaleString()} logical addresses. Only requested tiles may become resident.`,
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
  }, [renderer, evictionStress, activeStorage]);

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

  const jumpTo = (
    row: number,
    column: number,
    source: "form" | "overview" | "column-overview" | "landmark",
  ) => {
    const grid = gridRef.current;
    if (!grid) return;
    const resolvedRow = Math.min(Math.max(Math.round(row), 0), SCALE_ROWS - 1);
    const resolvedColumn = Math.min(Math.max(Math.round(column), 0), SCALE_COLUMNS - 1);
    const addr = { sheet: FEED_SHEET, row: resolvedRow, col: resolvedColumn };
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
    if (source === "form") hostRef.current?.focus({ preventScroll: true });
    if (source !== "overview" && source !== "column-overview") {
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
  const handleZoom = (nextZoom: number) => {
    const grid = gridRef.current;
    const host = hostRef.current;
    if (!grid || !host) return;
    const anchor = visibleRef.current;
    grid.setZoom(nextZoom);

    const theme = grid.getEffectiveTheme();
    const bodyRows = Math.max(
      1,
      Math.floor(
        Math.max(theme.rowHeight, host.clientHeight - theme.headerHeight) / theme.rowHeight,
      ),
    );
    const sheet = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === FEED_SHEET);
    const availableWidth = Math.max(1, host.clientWidth - theme.rowHeaderWidth);
    let anchorRight = anchor.firstColumn;
    let coveredWidth = 0;
    while (anchorRight < SCALE_COLUMNS) {
      coveredWidth += (sheet?.columns[anchorRight]?.width ?? 96) * grid.getZoom();
      if (coveredWidth >= availableWidth) break;
      anchorRight += 1;
    }

    const bodyColumns = Math.max(1, anchorRight - anchor.firstColumn + 1);
    const forceRow =
      anchor.firstRow === 0
        ? Math.min(SCALE_ROWS - 1, bodyRows + SCALE_OVERSCAN + 1)
        : Math.max(0, anchor.firstRow - bodyRows - SCALE_OVERSCAN - 1);
    const forceColumn =
      anchor.firstColumn === 0
        ? Math.min(SCALE_COLUMNS - 1, anchorRight + 1)
        : Math.max(0, anchor.firstColumn - bodyColumns - 1);
    grid.scrollToCell({ sheet: FEED_SHEET, row: forceRow, col: forceColumn });
    grid.scrollToCell({
      sheet: FEED_SHEET,
      row:
        anchor.firstRow === 0
          ? 0
          : Math.min(SCALE_ROWS - 1, anchor.firstRow + SCALE_OVERSCAN + bodyRows),
      col: anchor.firstColumn === 0 ? 0 : Math.min(SCALE_COLUMNS - 1, anchorRight),
    });
    setZoom(grid.getZoom());
    zoomRef.current = grid.getZoom();
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
    ((stats.paged?.allocatedBytes ?? 0) / activeStorage.cacheBytes) * 100,
    100,
  );
  const cacheCeilingMiB = activeStorage.cacheBytes / (1024 * 1024);
  const recentTiles = telemetry.recentTiles.map((tile) => ({
    ...tile,
    residence: tileResidence(gridRef.current, tile),
  }));
  const recentEvictions = recentTiles.filter((tile) => tile.residence === "evicted").length;
  const residentTiles = recentTiles.filter(
    (tile) => tile.residence === "resident" || tile.residence === "dirty",
  ).length;
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
  const interactionBefore = INTERACTION_EVIDENCE.before;
  const interactionAfter = INTERACTION_EVIDENCE.after;

  const selectedFormula = gridRef.current?.store.getFormula(selectedAddress) ?? null;
  return (
    <div className="sw-sp-frame">
      <SiteTopbar active="performance" />
      <main className="sw-sp-page" id="main-content">
        <CapabilityHero
          description={
            <>
              Drive a real {SCALE_ROWS.toLocaleString()} × {SCALE_COLUMNS.toLocaleString()}
              financial operations Grid. Jump deep, edit a cell, then scroll wide—the sheet only
              loads the rectangle you visit.
            </>
          }
          eyebrow="CAPABILITY / DATA & SCALE"
          facts={[
            { label: "Rows", value: SCALE_ROWS.toLocaleString() },
            { label: "Columns", value: SCALE_COLUMNS.toLocaleString() },
            { label: "Address space", value: "1 billion" },
            { label: "Loading", value: "Requested tiles only" },
          ]}
          title="One billion addresses. One bounded working set."
        />

        <section
          aria-label="Billion-address Grid workbench"
          className="sw-sp-section sw-sp-stage-section"
          id="million-rows"
        >
          <p aria-live="polite" className="sw-sp-status" data-testid="scale-status" role="status">
            {status}
          </p>

          <div className="sw-sp-workbench" data-state={gridState}>
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
                  <span>Wheel / trackpad · Page Up / Down · Shift-wheel to travel wide</span>
                  <fieldset aria-label="Grid zoom" className="sw-sp-zoom">
                    <button
                      aria-label="Zoom out"
                      disabled={gridState !== "ready" || zoom <= 0.5}
                      onClick={() => handleZoom(zoom - 0.25)}
                      type="button"
                    >
                      −
                    </button>
                    <output aria-label="Current zoom" data-testid="scale-zoom-value">
                      {Math.round(zoom * 100)}%
                    </output>
                    <button
                      aria-label="Zoom in"
                      disabled={gridState !== "ready" || zoom >= 2}
                      onClick={() => handleZoom(zoom + 0.25)}
                      type="button"
                    >
                      +
                    </button>
                    <button
                      className="sw-sp-zoom__reset"
                      disabled={gridState !== "ready" || zoom === 1}
                      onClick={() => handleZoom(1)}
                      type="button"
                    >
                      Reset
                    </button>
                  </fieldset>
                </div>
                {/* biome-ignore lint/a11y/useSemanticElements: Sheetwrite upgrades this canvas host into a virtualized ARIA grid. */}
                <div
                  aria-label="Million-row financial operations grid — one-billion-address Sheetwrite Grid"
                  className="sw-sp-grid"
                  data-cache-bytes={activeStorage.cacheBytes}
                  data-chunk-rows={activeStorage.chunkRows}
                  data-testid="scale-grid"
                  ref={hostRef}
                  role="grid"
                />
              </div>

              <aside className="sw-sp-instrument" aria-label="Grid navigator and live instrument">
                <section className="sw-sp-challenge" aria-labelledby="scale-challenge-title">
                  <p>Primary challenge</p>
                  <h3 id="scale-challenge-title">Jump deep. Then scroll wide.</h3>
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
                      <button
                        data-testid="scale-jump"
                        disabled={gridState !== "ready"}
                        type="submit"
                      >
                        Jump to cell
                      </button>
                    </fieldset>
                  </form>
                  <div className="sw-sp-stress">
                    <button
                      aria-describedby="scale-stress-description"
                      aria-pressed={evictionStress}
                      data-testid="scale-eviction-stress"
                      disabled={gridState === "loading"}
                      onClick={() => setEvictionStress((active) => !active)}
                      type="button"
                    >
                      Optional 1 MiB eviction stress
                    </button>
                    <small id="scale-stress-description">
                      Remounts this Grid with a deliberately tight clean-cache ceiling.
                    </small>
                  </div>
                </section>

                <section className="sw-sp-navigator" aria-labelledby="scale-navigator-title">
                  <div className="sw-sp-overview-head">
                    <span id="scale-navigator-title">Sheet navigator</span>
                    <strong>
                      Row {Math.round((firstRow / (SCALE_ROWS - 1)) * 100)}% · Column{" "}
                      {Math.round((firstColumn / (SCALE_COLUMNS - 1)) * 100)}%
                    </strong>
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
                  <label className="sw-sp-column-overview">
                    <span>
                      <strong>Columns</strong>
                      <small>
                        {colToA1(firstColumn)} of {colToA1(SCALE_COLUMNS - 1)}
                      </small>
                    </span>
                    <input
                      aria-label="Horizontal sheet overview"
                      aria-valuetext={`Column ${firstColumn + 1} (${colToA1(firstColumn)}) of ${SCALE_COLUMNS}`}
                      data-testid="scale-column-overview"
                      disabled={gridState !== "ready"}
                      max={SCALE_COLUMNS - 1}
                      min={0}
                      onChange={(event) =>
                        jumpTo(firstRow, Number(event.currentTarget.value), "column-overview")
                      }
                      step={1}
                      type="range"
                      value={firstColumn}
                    />
                  </label>
                </section>

                <dl className="sw-sp-readout" aria-label="Live window and residency instrument">
                  <div>
                    <dt>Address / window</dt>
                    <dd data-testid="scale-current-a1">{selection}</dd>
                    <dd data-testid="scale-window-a1">{windowA1}</dd>
                    <dd className="sw-sp-readout__bounds">
                      <span data-testid="scale-window-rows">
                        {firstRow + 1}–{lastRow + 1}
                      </span>
                      <span data-testid="scale-window-columns">
                        {colToA1(firstColumn)}–{colToA1(lastColumn)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Selected cell input</dt>
                    <dd className="sw-sp-readout__formula" data-testid="scale-selected-formula">
                      {selectedFormula ?? "Literal value"}
                    </dd>
                  </div>
                  <div>
                    <dt>Requests / aborts</dt>
                    <dd>
                      {telemetry.requests.toLocaleString()} / {telemetry.aborted.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Resident tiles</dt>
                    <dd>
                      {residentTiles} live · {recentEvictions} evicted
                    </dd>
                  </div>
                  <div>
                    <dt>Resident tile payload</dt>
                    <dd>{formatBytes(stats.paged?.allocatedBytes ?? 0)}</dd>
                    <dd className="sw-sp-readout__context">
                      {cacheCeilingMiB.toLocaleString()} MiB cache ceiling ·{" "}
                      {Math.round(cachePercent)}% resident
                    </dd>
                  </div>
                  <div>
                    <dt>Renderer</dt>
                    <dd data-testid="scale-renderer-active">{rendererState?.active ?? renderer}</dd>
                  </div>
                </dl>

                <details className="sw-sp-render-details">
                  <summary>
                    <span>Drawing path</span>
                    <small>{rendererState?.active ?? renderer}</small>
                  </summary>
                  <fieldset className="sw-sp-render-switch">
                    <legend>Grid drawing path</legend>
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
                  </fieldset>
                  {rendererState && (
                    <p className="sw-sp-rendererstate" data-testid="scale-renderer-state">
                      Requested <strong>{rendererState.requested}</strong>; running{" "}
                      <strong>{rendererState.active}</strong>
                      {rendererState.fallback
                        ? ` — Worker construction failed, so Grid reported and used its main-canvas fallback: ${rendererState.fallback}`
                        : "."}
                    </p>
                  )}
                </details>
              </aside>
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
                  dirty owner {evictionWatch.dirtyState} · clean comparison{" "}
                  {cellA1(evictionWatch.clean.row, evictionWatch.clean.col)}{" "}
                  {evictionWatch.cleanState}
                </span>
                {evictionWatch.cleanState === "unloaded" && (
                  <em>Clean tile evicted; sparse dirty value retained for revisit.</em>
                )}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="paging-title" className="sw-sp-section" id="paging">
          <p className="sw-sp-kicker">Live rectangular paging</p>
          <h2 id="paging-title">Requested columns, returned columns, bounded owners</h2>
          <p>
            This source uses windowed column loading. Every request names exact sorted column bands;
            every row generates only those keys and returns explicit <code>null</code> blanks.
            Counts below come from that source and public Store and runtime diagnostics. The exact
            API setting is <code>{`{ protocol: 2, columns: "windowed" }`}</code>.
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
                <dt>Resident tile payload</dt>
                <dd data-testid="scale-allocated">
                  {formatBytes(stats.paged?.allocatedBytes ?? 0)}
                </dd>
                <dd className="sw-sp-stat-context">
                  {cacheCeilingMiB.toLocaleString()} MiB cache ceiling · {Math.round(cachePercent)}%
                  resident
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

            <meter
              aria-label="Resident tile cache use"
              className="sw-sp-cache-gauge"
              max={100}
              min={0}
              value={Math.round(cachePercent)}
            />

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

          <details className="sw-sp-debug-disclosure" data-testid="scale-global-details">
            <summary>
              <span className="sw-sp-disclosure-copy">
                <strong>Try incomplete global operations</strong>
                <small>SUM + full-sheet CSV</small>
              </span>
              <span aria-hidden="true" className="sw-sp-disclosure-chevron">
                ›
              </span>
            </summary>
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
                  Public query capability: incomplete — {stats.query.loadedCells.toLocaleString()}{" "}
                  of {stats.query.totalCells.toLocaleString()} logical cells loaded.
                </p>
              )}
            </div>
          </details>
        </section>

        <section aria-labelledby="resource-title" className="sw-sp-section" id="resources">
          <div className="sw-sp-resource-copy">
            <p className="sw-sp-kicker">Measured ownership</p>
            <h2 id="resource-title">Cache capacity is not logical size</h2>
            <p>
              Public resource report v
              <span data-testid="scale-resource-schema">
                {stats.resource?.schemaVersion ?? "—"}
              </span>{" "}
              separates logical live bytes, allocated owner capacity, and observed WASM committed
              pages. The clean page cache and sparse dirty overlay remain distinct owners.
            </p>
          </div>
          <div className="sw-sp-resource-panel">
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
            <details className="sw-sp-debug-disclosure">
              <summary>
                <span className="sw-sp-disclosure-copy">
                  <strong>Inspect exclusive runtime owners</strong>
                  <small>{resourceOwners.length} active owners</small>
                </span>
                <span aria-hidden="true" className="sw-sp-disclosure-chevron">
                  ›
                </span>
              </summary>
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
            </details>
          </div>
        </section>

        <section aria-labelledby="crossing-title" className="sw-sp-section" id="wasm-crossings">
          <p className="sw-sp-kicker">Measured operation cost</p>
          <h2 id="crossing-title">WASM crossings are counted, not guessed</h2>
          <p>
            Each control commits a real 20,000-cell Grid transaction and reads the public packed
            mutation and runtime ownership counters before and after it.
          </p>
          <details className="sw-sp-debug-disclosure" data-testid="scale-crossing-details">
            <summary>
              <span className="sw-sp-disclosure-copy">
                <strong>Run raw mutation diagnostics</strong>
                <small>20,000-cell transactions</small>
              </span>
              <span aria-hidden="true" className="sw-sp-disclosure-chevron">
                ›
              </span>
            </summary>
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
          </details>
        </section>

        <section
          aria-labelledby="evidence-title"
          className="sw-sp-section sw-sp-proof"
          id="evidence"
        >
          <div className="sw-sp-proof-heading">
            <div>
              <p className="sw-sp-kicker">Decision record</p>
              <h2 id="evidence-title">The working set stays bounded as the address space grows.</h2>
            </div>
            <p>
              The live Grid is the product proof. This secondary record answers one decision:
              repeated measured runs did not require a resident billion-cell matrix.
            </p>
          </div>

          <div className="sw-sp-proof-layout">
            {COMPARISON_EVIDENCE.available && (
              <article className="sw-sp-scale-curve" data-testid="scale-evidence-compare">
                <header>
                  <p>Scenario median</p>
                  <strong>
                    {COMPARISON_EVIDENCE.sizes[COMPARISON_EVIDENCE.sizes.length - 1]?.medianRatio}×
                  </strong>
                  <span>at one million rows</span>
                </header>
                <div aria-hidden="true" className="sw-sp-scale-curve__axis">
                  <span />
                  <div>
                    {COMPARISON_LOG_TICKS.map((tick) => (
                      <span key={tick}>{tick.toLocaleString()}×</span>
                    ))}
                  </div>
                  <span>log₁₀</span>
                </div>
                <ol aria-label="Median comparison ratio by row count, logarithmic scale">
                  {COMPARISON_EVIDENCE.sizes.map((size) => (
                    <li key={size.size}>
                      <span>{size.size.toLocaleString()}</span>
                      <span className="sw-sp-scale-curve__track">
                        <span
                          aria-hidden="true"
                          style={{
                            width: `${comparisonLogPercent(size.medianRatio)}%`,
                          }}
                        />
                      </span>
                      <strong>{size.medianRatio.toFixed(1)}×</strong>
                    </li>
                  ))}
                </ol>
                <p>
                  Log₁₀ axis: 1× is the parity baseline; farther right means a larger measured
                  ratio. Exact ratios remain labeled.{" "}
                  {COMPARISON_EVIDENCE.sizes.at(-1)?.comparedScenarios} matched scenarios at the
                  largest capture size.
                </p>
              </article>
            )}

            <div className="sw-sp-proof-wins" data-testid="scale-evidence-interaction">
              <article>
                <span>Lookup latency</span>
                <strong>{interactionAfter.lookupMedianNs.toFixed(2)} ns</strong>
                <div aria-hidden="true">
                  <i style={{ width: "100%" }} />
                  <i
                    style={{
                      width: `${(interactionAfter.lookupMedianNs / interactionBefore.lookupMedianNs) * 100}%`,
                    }}
                  />
                </div>
                <p>
                  from {interactionBefore.lookupMedianNs.toFixed(2)} ns ·{" "}
                  {(
                    (1 - interactionAfter.lookupMedianNs / interactionBefore.lookupMedianNs) *
                    100
                  ).toFixed(1)}
                  % lower
                </p>
              </article>
              <article>
                <span>Inverse index</span>
                <strong>{formatBytes(interactionAfter.viewIndexBytes)}</strong>
                <div aria-hidden="true">
                  <i style={{ width: "100%" }} />
                  <i
                    style={{
                      width: `${(interactionAfter.viewIndexBytes / interactionBefore.viewIndexBytes) * 100}%`,
                    }}
                  />
                </div>
                <p>
                  from {formatBytes(interactionBefore.viewIndexBytes)} ·{" "}
                  {(
                    (1 - interactionAfter.viewIndexBytes / interactionBefore.viewIndexBytes) *
                    100
                  ).toFixed(1)}
                  % lower
                </p>
              </article>
              <article>
                <span>100 distant edits</span>
                <strong>{formatBytes(interactionAfter.dirty100Bytes)}</strong>
                <div aria-hidden="true">
                  <i style={{ width: "100%" }} />
                  <i
                    style={{
                      width: `${Math.max(
                        (interactionAfter.dirty100Bytes / interactionBefore.dirty100Bytes) * 100,
                        0.5,
                      )}%`,
                    }}
                  />
                </div>
                <p>
                  from {formatBytes(interactionBefore.dirty100Bytes)} · sparse cells stay sparse
                </p>
              </article>
              <article>
                <span>Owned cold long task</span>
                <strong data-testid="scale-evidence-cold">
                  {interactionAfter.coldOwnedLongTaskMs.toFixed(1)} ms
                </strong>
                <div aria-hidden="true">
                  <i style={{ width: "100%" }} />
                  <i style={{ width: "0%" }} />
                </div>
                <p>from {interactionBefore.coldOwnedLongTaskMs.toFixed(1)} ms median</p>
              </article>
            </div>
          </div>

          <details className="sw-sp-proof-sources">
            <summary>
              <span>Inspect sources and methodology</span>
              <small>3 committed evidence files</small>
            </summary>
            <div className="sw-sp-proof-sources__body">
              <section>
                <p className="sw-sp-provenance" data-testid="scale-evidence-paged-provenance">
                  <code>{PAGED_EVIDENCE.source}</code>
                  <span>
                    {PAGED_EVIDENCE.protocol} · {PAGED_EVIDENCE.rows.toLocaleString()} rows ×{" "}
                    {PAGED_EVIDENCE.columns} columns · {PAGED_EVIDENCE.pageRows}-row pages
                  </span>
                </p>
                <dl className="sw-sp-proof-distribution" data-testid="scale-evidence-paged">
                  <div>
                    <dt>Startup</dt>
                    <dd>{PAGED_EVIDENCE.startup.medianMs.toFixed(2)} ms median</dd>
                    <dd>{PAGED_EVIDENCE.startup.p95Ms.toFixed(2)} ms p95</dd>
                  </div>
                  <div>
                    <dt>First page</dt>
                    <dd>{PAGED_EVIDENCE.firstPage.medianMs.toFixed(2)} ms median</dd>
                    <dd>{PAGED_EVIDENCE.firstPage.p95Ms.toFixed(2)} ms p95</dd>
                  </div>
                  <div>
                    <dt>Distant page</dt>
                    <dd>{PAGED_EVIDENCE.distantPage.medianMs.toFixed(2)} ms median</dd>
                    <dd>{PAGED_EVIDENCE.distantPage.p95Ms.toFixed(2)} ms p95</dd>
                  </div>
                  <div>
                    <dt>Peak allocated</dt>
                    <dd>{formatBytes(PAGED_EVIDENCE.peakAllocatedBytes)}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <p className="sw-sp-provenance" data-testid="scale-evidence-interaction-provenance">
                  <code>{INTERACTION_EVIDENCE.source}</code>
                  <span>
                    {INTERACTION_EVIDENCE.protocol} · {INTERACTION_EVIDENCE.capture.samples} samples
                    · {INTERACTION_EVIDENCE.capture.browser} · commit{" "}
                    {INTERACTION_EVIDENCE.capture.commit.slice(0, 10)}
                  </span>
                </p>
              </section>
              {COMPARISON_EVIDENCE.available && (
                <section>
                  <p className="sw-sp-provenance" data-testid="scale-evidence-compare-provenance">
                    <code>{COMPARISON_EVIDENCE.source}</code>
                    <span>
                      {COMPARISON_EVIDENCE.capture.browser} · {COMPARISON_EVIDENCE.capture.rounds}{" "}
                      rounds · commit {COMPARISON_EVIDENCE.capture.commit.slice(0, 10)}
                    </span>
                  </p>
                </section>
              )}
            </div>
          </details>

          <p className="sw-sp-note sw-sp-note--rule">
            The live source adds a measured {PAGE_LATENCY_MS} ms delay after its first request so
            loading remains observable. Live diagnostics and checked captures stay separate.
          </p>
        </section>
      </main>
    </div>
  );
}
