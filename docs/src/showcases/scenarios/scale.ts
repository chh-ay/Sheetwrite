/**
 * Performance and scale scenario — capability owner for
 * `/showcases/performance/`.
 *
 * Framework-neutral: owns the deterministic million-row and wide-page
 * datasets, the instrumented datasource, the paged-store/WASM measurement
 * protocols, and the committed benchmark evidence (with provenance) that the
 * route and its browser spec both consume. Every number shown live is
 * measured in the visitor's browser through public APIs; every static number
 * comes from a committed benchmark artifact and is labeled with its capture
 * provenance. Nothing here invents a figure.
 */

import type {
  AggregateOp,
  DataSource,
  DataSourceStorageOptions,
  Grid,
  PagedStoreStats,
  QueryCapability,
  RowData,
  SheetId,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import { IncompleteDataError, SheetwriteStore, toCsv } from "@sheetwrite/core";
import pagedResults from "../../../../bench/results/paged-results.json";
import landingBench from "../../generated/landing-bench.json";
import { SHOWCASE_THEME } from "../revenue.js";

// ── Dataset geometry ─────────────────────────────────────────────────────────

export const FEED_SHEET = "feed" satisfies SheetId;
export const WIDE_SHEET = "wide" satisfies SheetId;
export const SCALE_SHEETS = {
  [FEED_SHEET]: { id: FEED_SHEET, label: "Telemetry feed", rowCount: 1_000_000 },
  [WIDE_SHEET]: { id: WIDE_SHEET, label: "Wide metrics", rowCount: 250_000 },
} as const;
export type ScaleSheetId = keyof typeof SCALE_SHEETS;
export const FEED_ROWS = SCALE_SHEETS[FEED_SHEET].rowCount;
export const WIDE_ROWS = SCALE_SHEETS[WIDE_SHEET].rowCount;
export const WIDE_METRIC_COLUMNS = 120;

export function scaleSheetDescriptor(sheet: SheetId) {
  if (sheet === FEED_SHEET) return SCALE_SHEETS[FEED_SHEET];
  if (sheet === WIDE_SHEET) return SCALE_SHEETS[WIDE_SHEET];
  throw new Error(`Unknown performance showcase sheet: ${sheet}`);
}
export const SCALE_THEME: Partial<Theme> = {
  font: SHOWCASE_THEME.font,
  rowHeight: SHOWCASE_THEME.rowHeight,
  headerHeight: SHOWCASE_THEME.headerHeight,
  rowHeaderWidth: SHOWCASE_THEME.rowHeaderWidth,
};

/** Clean-chunk budget kept deliberately small so cache churn is observable. */
export const SCALE_STORAGE: Required<DataSourceStorageOptions> = {
  mode: "paged",
  chunkRows: 4096,
  cacheBytes: 8 * 1024 * 1024,
  dirtyCellLimit: 1_000_000,
};

/** Visible latency for every page after the first, so lazy loading is observable. */
export const PAGE_LATENCY_MS = 90;

const REGIONS = ["eu-west", "us-east", "ap-south", "sa-east", "af-north"] as const;
const STATUSES = ["ok", "ok", "ok", "degraded", "alert"] as const;

/** Deterministic per-row hash so any page of one million rows is reproducible. */
function rowHash(row: number, salt: number): number {
  let hash = (row + 1) * 2654435761 + salt * 40503;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function feedRowAt(row: number): RowData {
  const hash = rowHash(row, 1);
  return {
    id: row + 1,
    sensor: `S-${String(hash % 4096).padStart(4, "0")}`,
    region: REGIONS[hash % REGIONS.length] ?? "eu-west",
    reading: Math.round((hash % 100_000) / 100 + (row % 7)) / 10,
    peak: Math.round((rowHash(row, 2) % 120_000) / 100) / 10,
    status: STATUSES[rowHash(row, 3) % STATUSES.length] ?? "ok",
  };
}

export function wideRowAt(row: number): RowData {
  const out: RowData = { id: row + 1 };
  for (let column = 0; column < WIDE_METRIC_COLUMNS; column++) {
    out[`m${column}`] = (rowHash(row, column + 16) % 100_000) / 100;
  }
  return out;
}

export function createScaleWorkbook(): Workbook {
  return {
    activeSheet: FEED_SHEET,
    sheets: [
      {
        id: FEED_SHEET,
        name: SCALE_SHEETS[FEED_SHEET].label,
        rowCount: SCALE_SHEETS[FEED_SHEET].rowCount,
        columns: [
          { key: "id", header: "ID", width: 84, type: "number" },
          { key: "sensor", header: "Sensor", width: 100, type: "text" },
          { key: "region", header: "Region", width: 104, type: "text" },
          { key: "reading", header: "Reading", width: 104, type: "number" },
          { key: "peak", header: "Peak", width: 104, type: "number" },
          { key: "status", header: "Status", width: 96, type: "text" },
        ],
      },
      {
        id: WIDE_SHEET,
        name: SCALE_SHEETS[WIDE_SHEET].label,
        rowCount: SCALE_SHEETS[WIDE_SHEET].rowCount,
        columns: [
          { key: "id", header: "ID", width: 84, type: "number" },
          ...Array.from({ length: WIDE_METRIC_COLUMNS }, (_, column) => ({
            key: `m${column}`,
            header: `M${String(column).padStart(3, "0")}`,
            width: 76,
            type: "number" as const,
          })),
        ],
      },
    ],
  };
}

// ── Instrumented datasource ──────────────────────────────────────────────────

export interface DatasourceTelemetry {
  requests: number;
  rowsServed: number;
  cellsServed: number;
  aborted: number;
  lastPage: { sheet: SheetId; start: number; end: number; latencyMs: number } | null;
}

export function emptyTelemetry(): DatasourceTelemetry {
  return { requests: 0, rowsServed: 0, cellsServed: 0, aborted: 0, lastPage: null };
}

/**
 * Serve deterministic pages for both sheets with observable latency. The
 * first request resolves immediately so boot never paints an empty canvas.
 * Aborted requests stop work and are counted — that is the contract hosts
 * should implement too.
 */
export function createScaleDataSource(
  onUpdate: (telemetry: Readonly<DatasourceTelemetry>) => void,
): DataSource {
  const telemetry = emptyTelemetry();
  let firstRequest = true;
  return {
    getRows({ sheet, start, end, signal, revision }) {
      const { promise, resolve, reject } = Promise.withResolvers<{
        start: number;
        rows: RowData[];
        revision: number;
      }>();
      const latency = firstRequest ? 0 : PAGE_LATENCY_MS;
      firstRequest = false;
      telemetry.requests += 1;
      const startedAt = performance.now();
      const timer = setTimeout(() => {
        const rows: RowData[] = [];
        for (let row = start; row < end; row++) {
          rows.push(sheet === WIDE_SHEET ? wideRowAt(row) : feedRowAt(row));
        }
        const columns = sheet === WIDE_SHEET ? WIDE_METRIC_COLUMNS + 1 : 6;
        telemetry.rowsServed += rows.length;
        telemetry.cellsServed += rows.length * columns;
        telemetry.lastPage = { sheet, start, end, latencyMs: performance.now() - startedAt };
        onUpdate(telemetry);
        resolve({ start, rows, revision });
      }, latency);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          telemetry.aborted += 1;
          onUpdate(telemetry);
          reject(new DOMException("Datasource request aborted", "AbortError"));
        },
        { once: true },
      );
      return promise;
    },
  };
}

// ── Paged-store observation protocol ─────────────────────────────────────────

function loadableStoreOf(grid: Grid): SheetwriteStore | null {
  return grid.store instanceof SheetwriteStore ? grid.store : null;
}

/** Live allocation stats for one paged sheet; null for dense stores. */
export function pagedStatsOf(grid: Grid, sheet: SheetId): PagedStoreStats | null {
  const store = loadableStoreOf(grid);
  if (!store?.isPaged(sheet)) return null;
  return store.getPagedStats(sheet);
}

/** Explicit partial-data state the engine reports for full-sheet operations. */
export function queryCapabilityOf(grid: Grid, sheet: SheetId): QueryCapability | null {
  return loadableStoreOf(grid)?.queryCapability?.(sheet) ?? null;
}

/** What a dense engine would allocate for the same logical sheet (8 bytes/cell). */
export function denseEquivalentBytes(grid: Grid, sheet: SheetId): number {
  const schema = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
  return schema ? schema.rowCount * schema.columns.length * 8 : 0;
}

export type FullExportAttempt =
  | { ok: true; bytes: number }
  | { ok: false; loadedCells: number; totalCells: number; message: string };

/**
 * Full-dataset operations refuse to lie: exporting a partially loaded paged
 * sheet throws a typed `IncompleteDataError` instead of silently emitting
 * holes. This runs the real CSV export against the live store.
 */
export function attemptFullCsvExport(grid: Grid, sheet: SheetId): FullExportAttempt {
  const schema = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
  if (!schema) throw new Error("Sheetwrite grid lost its scale sheet");
  try {
    const csv = toCsv(schema, grid.store);
    return { ok: true, bytes: new TextEncoder().encode(csv).byteLength };
  } catch (error) {
    if (error instanceof IncompleteDataError) {
      return {
        ok: false,
        loadedCells: error.capability.loadedCells,
        totalCells: error.capability.totalCells,
        message: error.message,
      };
    }
    throw error;
  }
}

export type ScanAttempt =
  | { ok: true; op: string; value: number; durationMs: number }
  | {
      ok: false;
      op: string;
      loadedCells: number;
      totalCells: number;
      durationMs: number;
      message: string;
    };

/**
 * Timed filtered scan over the paged feed through the public aggregate API.
 * On a partially loaded sheet the engine refuses with a typed
 * `IncompleteDataError` carrying exact loaded/total counts — the query
 * contract this capability demonstrates. Both outcomes report real timing.
 */
export function attemptColumnScan(grid: Grid, col: number, op: AggregateOp): ScanAttempt {
  const label = `${op.toUpperCase()}(column ${col})`;
  const startedAt = performance.now();
  try {
    const value = grid.aggregate(col, op);
    return { ok: true, op: label, value, durationMs: performance.now() - startedAt };
  } catch (error) {
    if (error instanceof IncompleteDataError) {
      return {
        ok: false,
        op: label,
        loadedCells: error.capability.loadedCells,
        totalCells: error.capability.totalCells,
        durationMs: performance.now() - startedAt,
        message: error.message,
      };
    }
    throw error;
  }
}

// ── WASM crossing measurement ────────────────────────────────────────────────

export interface CrossingReport {
  cells: number;
  durationMs: number;
  ffiCalls: number;
  documentOperations: number;
  jsPatchObjects: number;
  maxTransferredArrayLength: number;
}

/**
 * Measure real JS↔WASM boundary crossings for one bulk mutation through the
 * public transaction path: reset the store's allocation counters, commit one
 * packed-block (or range-style) operation covering `rows` rows, read the
 * counters back. Nothing is simulated.
 */
export function measureBulkMutation(
  grid: Grid,
  kind: "values" | "styles",
  rows: number,
): CrossingReport {
  const store = loadableStoreOf(grid);
  if (!store) throw new Error("Crossing measurement requires the packed Sheetwrite store");
  const range = {
    sheet: FEED_SHEET,
    start: { row: 0, col: 3 },
    end: { row: rows - 1, col: 3 },
  };
  store.resetRangeMutationAllocationStats();
  const startedAt = performance.now();
  if (kind === "values") {
    grid.applyTransaction({
      patches: [
        {
          op: "setBlock",
          range,
          block: {
            rowCount: rows,
            colCount: 1,
            values: Array.from({ length: rows }, (_, row) => (rowHash(row, 99) % 9_000) / 10),
          },
        },
      ],
    });
  } else {
    grid.applyTransaction({
      patches: [{ op: "setRangeStyle", range, style: { bold: true } }],
    });
  }
  const durationMs = performance.now() - startedAt;
  const stats = store.getRangeMutationAllocationStats();
  return {
    cells: rows,
    durationMs,
    ffiCalls: stats.ffiCalls,
    documentOperations: stats.documentOperations,
    jsPatchObjects: stats.jsPatchObjects,
    maxTransferredArrayLength: stats.maxTransferredArrayLength,
  };
}

// ── Cache churn protocol ─────────────────────────────────────────────────────

export interface ChurnReport {
  jumps: number;
  rowsVisited: readonly number[];
  allocatedBytes: number;
  chunks: number;
  loadedCells: number;
  cacheBudgetBytes: number;
  withinBudget: boolean;
}

/**
 * Deterministic long-jump sweep across the million-row feed: each jump lands
 * in a distinct far-apart chunk, forcing fetch + clean-chunk eviction. After
 * the sweep the clean cache must still respect its byte budget.
 */
export async function sweepCacheChurn(
  grid: Grid,
  jumps: number,
  isCancelled: () => boolean,
): Promise<ChurnReport> {
  const rowsVisited: number[] = [];
  const stride = Math.floor(FEED_ROWS / (jumps + 1));
  for (let jump = 1; jump <= jumps; jump++) {
    if (isCancelled()) break;
    const row = Math.min(
      FEED_ROWS - 1,
      jump * stride + (rowHash(jump, 7) % SCALE_STORAGE.chunkRows),
    );
    rowsVisited.push(row);
    grid.scrollToCell({ sheet: FEED_SHEET, row, col: 0 });
    const settle = Promise.withResolvers<void>();
    setTimeout(settle.resolve, PAGE_LATENCY_MS + 70);
    await settle.promise;
  }
  const stats = pagedStatsOf(grid, FEED_SHEET);
  return {
    jumps: rowsVisited.length,
    rowsVisited,
    allocatedBytes: stats?.allocatedBytes ?? 0,
    chunks: stats?.chunks ?? 0,
    loadedCells: stats?.loadedCells ?? 0,
    cacheBudgetBytes: SCALE_STORAGE.cacheBytes,
    withinBudget: (stats?.allocatedBytes ?? 0) <= SCALE_STORAGE.cacheBytes,
  };
}

// ── Committed benchmark evidence (never invented, always attributed) ─────────

export interface EvidenceStat {
  medianMs: number;
  p95Ms: number;
  iterations: number;
}

function statOf(timing: { stat: { median: number; p95: number; iters: number } }): EvidenceStat {
  return {
    medianMs: timing.stat.median,
    p95Ms: timing.stat.p95,
    iterations: timing.stat.iters,
  };
}

/**
 * Committed paged-storage benchmark artifact, re-exported verbatim with its
 * provenance. Source: `bench/results/paged-results.json`, produced by the
 * repository's benchmark protocol (`bench/README.md`).
 */
export const PAGED_EVIDENCE = {
  source: "bench/results/paged-results.json",
  protocol: `${pagedResults.matrixId} (protocol v${pagedResults.protocolVersion}, ${pagedResults.mode} mode, ${pagedResults.runs} runs)`,
  rows: pagedResults.rows,
  columns: pagedResults.columns,
  pageRows: pagedResults.pageRows,
  cacheBudgetBytes: pagedResults.cacheBudgetBytes,
  denseLogicalBytes: pagedResults.denseLogicalBytes,
  peakAllocatedBytes: pagedResults.peakAllocatedBytes,
  peakChunks: pagedResults.peakChunks,
  startup: statOf(pagedResults.timings.startup),
  firstPage: statOf(pagedResults.timings["first-page"]),
  distantPage: statOf(pagedResults.timings["distant-page"]),
  probes: pagedResults.probes,
} as const;

/**
 * Committed cross-grid comparison capture shown on the landing page,
 * re-exported with its full capture provenance.
 */
export const COMPARISON_EVIDENCE = {
  source: "docs/src/generated/landing-bench.json",
  available: landingBench.available,
  capture: landingBench.capture,
  heroStats: landingBench.heroStats,
  sizes: landingBench.sizes,
} as const;

/** Human-readable byte counts for evidence and live stat panels. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
