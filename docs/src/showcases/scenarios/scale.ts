/**
 * Deterministic protocol-2 datasource and measured evidence for the interactive
 * scale showcase. Live values are collected from datasource, Grid, Store, and
 * runtime diagnostics; committed values retain their checked-artifact source.
 */

import type {
  AggregateOp,
  DataSource,
  DataSourceColumnBand,
  DataSourcePage,
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
import interactionResults from "../../../../bench/results/interaction-results.json";
import pagedResults from "../../../../bench/results/paged-results.json";
import landingBench from "../../generated/landing-bench.json";

export const FEED_SHEET = "scale" satisfies SheetId;
export const SCALE_ROWS = 1_000_000;
export const SCALE_COLUMNS = 1_000;
export const SCALE_LOGICAL_CELLS = SCALE_ROWS * SCALE_COLUMNS;
export const FEED_ROWS = SCALE_ROWS;
export const SCALE_SHEETS = {
  [FEED_SHEET]: {
    id: FEED_SHEET,
    label: "Billion-address sheet",
    rowCount: SCALE_ROWS,
    columnCount: SCALE_COLUMNS,
  },
} as const;

export const SCALE_THEME: Partial<Theme> = {
  font: '500 13px "Inter Variable", Inter, system-ui, sans-serif',
  rowHeight: 30,
  headerHeight: 34,
  rowHeaderWidth: 72,
};

/** Fixed clean-page budget; sparse local edits are accounted separately. */
export const SCALE_STORAGE: Required<DataSourceStorageOptions> = {
  mode: "paged",
  chunkRows: 4096,
  cacheBytes: 4 * 1024 * 1024,
  dirtyCellLimit: 1_000_000,
};

/** Deliberate source latency after first paint, kept visible in the diagnostics. */
export const PAGE_LATENCY_MS = 90;

const GENERATION_SLICE_ROWS = 256;
const REGIONS = ["eu-west", "us-east", "ap-south", "sa-east", "af-north"] as const;
const STATUSES = ["ok", "ok", "ok", "degraded", "alert"] as const;
const encoder = new TextEncoder();

function rowHash(row: number, salt: number): number {
  let hash = (row + 1) * 2654435761 + salt * 40503;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function scaleColumnKey(column: number): string {
  return `c${column}`;
}

function columnHeader(column: number): string {
  if (column === 0) return "Row ID";
  if (column === 1) return "Sensor";
  if (column === 2) return "Region";
  if (column === 3) return "Reading";
  if (column === 4) return "Status";
  return `Metric ${String(column - 4).padStart(3, "0")}`;
}

function scaleCellAt(row: number, column: number): string | number | null {
  const hash = rowHash(row, column + 1);
  if (column === 0) return row + 1;
  if (column === 1) return `S-${String(hash % 4096).padStart(4, "0")}`;
  if (column === 2) return REGIONS[hash % REGIONS.length] ?? "eu-west";
  if (column === 3) return Math.round((hash % 100_000) / 10) / 10;
  if (column === 4) return STATUSES[hash % STATUSES.length] ?? "ok";
  if (hash % 17 === 0) return null;
  return Math.round(((hash % 100_000) / 100 + (row % 11)) * 100) / 100;
}

export function scaleRowAt(row: number, bands: readonly DataSourceColumnBand[]): RowData {
  const out: RowData = {};
  for (const band of bands) {
    for (let offset = 0; offset < band.keys.length; offset += 1) {
      const key = band.keys[offset];
      if (key !== undefined) out[key] = scaleCellAt(row, band.start + offset);
    }
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
        rowCount: SCALE_ROWS,
        columns: Array.from({ length: SCALE_COLUMNS }, (_, column) => ({
          key: scaleColumnKey(column),
          header: columnHeader(column),
          width: column === 0 ? 88 : column < 5 ? 104 : 92,
          type:
            column === 1 || column === 2 || column === 4 ? ("text" as const) : ("number" as const),
        })),
      },
    ],
  };
}

export interface DatasourceTile {
  id: number;
  sheet: SheetId;
  start: number;
  end: number;
  columns: readonly DataSourceColumnBand[];
  cells: number;
  requestBytes: number;
  returnedBytes: number;
  latencyMs: number | null;
  state: "requested" | "returned" | "aborted";
}

export interface DatasourceTelemetry {
  requests: number;
  requestedCells: number;
  requestBytes: number;
  returnedRows: number;
  returnedCells: number;
  returnedBytes: number;
  aborted: number;
  lastRequest: DatasourceTile | null;
  lastReturn: DatasourceTile | null;
  recentTiles: readonly DatasourceTile[];
}

export function emptyTelemetry(): DatasourceTelemetry {
  return {
    requests: 0,
    requestedCells: 0,
    requestBytes: 0,
    returnedRows: 0,
    returnedCells: 0,
    returnedBytes: 0,
    aborted: 0,
    lastRequest: null,
    lastReturn: null,
    recentTiles: [],
  };
}

/**
 * Windowed source: every row contains only the exact sorted column bands in the
 * request. Generation yields between small row slices so a distant page cannot
 * monopolize the main thread.
 */
export function createScaleDataSource(
  onUpdate: (telemetry: Readonly<DatasourceTelemetry>) => void,
): DataSource {
  const telemetry = emptyTelemetry();
  let firstRequest = true;
  let nextTileId = 1;

  const publish = () => onUpdate({ ...telemetry, recentTiles: [...telemetry.recentTiles] });
  const replaceTile = (next: DatasourceTile) => {
    telemetry.recentTiles = telemetry.recentTiles.map((tile) =>
      tile.id === next.id ? next : tile,
    );
  };

  return {
    capabilities: { protocol: 2, columns: "windowed" },
    getRows(request) {
      const { protocol, sheet, start, end, columns, signal, revision } = request;
      const requestedColumns = columns.reduce((count, band) => count + band.keys.length, 0);
      const cells = (end - start) * requestedColumns;
      const requestBytes = encoder.encode(
        JSON.stringify({ protocol, sheet, start, end, columns, revision }),
      ).byteLength;
      const tile: DatasourceTile = {
        id: nextTileId,
        sheet,
        start,
        end,
        columns,
        cells,
        requestBytes,
        returnedBytes: 0,
        latencyMs: null,
        state: "requested",
      };
      nextTileId += 1;
      telemetry.requests += 1;
      telemetry.requestedCells += cells;
      telemetry.requestBytes += requestBytes;
      telemetry.lastRequest = tile;
      telemetry.recentTiles = [tile, ...telemetry.recentTiles].slice(0, 256);
      publish();

      const latency = firstRequest ? 0 : PAGE_LATENCY_MS;
      firstRequest = false;
      const startedAt = performance.now();

      const { promise, resolve, reject } = Promise.withResolvers<DataSourcePage>();
      const rows: RowData[] = [];
      let cursor = start;
      let returnedBytes = 2;
      let timer = 0;
      let settled = false;

      const abort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const abortedTile: DatasourceTile = {
          ...tile,
          latencyMs: performance.now() - startedAt,
          state: "aborted",
        };
        telemetry.aborted += 1;
        replaceTile(abortedTile);
        publish();
        reject(new DOMException("Datasource request aborted", "AbortError"));
      };

      const generate = () => {
        if (signal.aborted) {
          abort();
          return;
        }
        const sliceEnd = Math.min(cursor + GENERATION_SLICE_ROWS, end);
        for (; cursor < sliceEnd; cursor += 1) {
          const row = scaleRowAt(cursor, columns);
          const rowBytes = encoder.encode(JSON.stringify(row)).byteLength;
          returnedBytes += rowBytes + (rows.length === 0 ? 0 : 1);
          rows.push(row);
        }
        if (cursor < end) {
          timer = window.setTimeout(generate, 0);
          return;
        }

        settled = true;
        signal.removeEventListener("abort", abort);
        const returnedTile: DatasourceTile = {
          ...tile,
          returnedBytes,
          latencyMs: performance.now() - startedAt,
          state: "returned",
        };
        telemetry.returnedRows += rows.length;
        telemetry.returnedCells += cells;
        telemetry.returnedBytes += returnedBytes;
        telemetry.lastReturn = returnedTile;
        replaceTile(returnedTile);
        publish();
        resolve({ protocol: 2, start, columns, rows, revision });
      };

      signal.addEventListener("abort", abort, { once: true });
      timer = window.setTimeout(generate, latency);
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

function sampleMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Committed five-sample interaction, memory, and cold-route evidence. */
export const INTERACTION_EVIDENCE = {
  source: "bench/results/interaction-results.json",
  protocol: `${interactionResults.matrixId} (protocol v${interactionResults.protocolVersion})`,
  capture: interactionResults.source,
  prefetch: interactionResults.directionalPrefetch,
  before: {
    lookupMedianNs: sampleMedian(interactionResults.viewIndex.baseline.lookupMedianNsSamples),
    viewIndexBytes: interactionResults.viewIndex.baseline.retainedBytes,
    dirty100Bytes: interactionResults.sparseDirty.baseline100Bytes,
    coldOwnedLongTaskMs: sampleMedian(
      interactionResults.coldRoute.before.sheetwriteLongTaskMsSamples,
    ),
  },
  after: {
    lookupMedianNs: sampleMedian(interactionResults.viewIndex.packed.lookupMedianNsSamples),
    viewIndexBytes: interactionResults.viewIndex.packed.retainedBytes,
    dirty100Bytes: interactionResults.sparseDirty.dirty100Bytes,
    coldOwnedLongTaskMs: sampleMedian(
      interactionResults.coldRoute.after.sheetwriteLongTaskMsSamples,
    ),
  },
  gains: {
    lookup: interactionResults.viewIndex.medianLookupImprovementRatio,
    heap: interactionResults.viewIndex.retainedHeapReductionRatio,
    sparse: interactionResults.sparseDirty.dirty100ReductionRatio,
    coldUsable: interactionResults.coldRoute.medianUsableImprovementRatio,
  },
  coldUnattributedLongTaskMs:
    interactionResults.coldRoute.after.reportedUnattributedLongTaskMsSamples,
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
