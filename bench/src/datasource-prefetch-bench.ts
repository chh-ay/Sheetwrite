import {
  DatasourceController,
  DATASOURCE_PREFETCH_MAX_BYTES,
  DATASOURCE_PREFETCH_MAX_ROWS,
} from "../../packages/core/src/datasource-controller.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import { SheetwriteStore } from "../../packages/core/src/store.js";
import type { DataSourcePage, RowData, Workbook } from "../../packages/core/src/types.js";

const FRAME_MS = 16.7;
const SOURCE_LATENCY_MS = 90;
const VIEWPORT_ROWS = 20;
const TRACE_BANDS = 10;
const REVERSE_BANDS = 2;
const REPETITIONS = 5;
const ROW_COUNT = 5_000;
const COLUMN_COUNT = 6;
const CHUNK_ROWS = 20;
const CACHE_BYTES = 12 * 1024;
const REQUEST_MULTIPLIER_LIMIT = 3;
const ACTIVE_REQUEST_LIMIT = 6;

interface ScheduledTask {
  readonly id: number;
  readonly at: number;
  readonly run: () => void;
  cancelled: boolean;
}

class LogicalClock {
  now = 0;
  private nextId = 1;
  private readonly tasks: ScheduledTask[] = [];

  schedule(delay: number, run: () => void): () => void {
    const task: ScheduledTask = {
      id: this.nextId++,
      at: this.now + delay,
      run,
      cancelled: false,
    };
    this.tasks.push(task);
    this.tasks.sort((a, b) => a.at - b.at || a.id - b.id);
    return () => {
      task.cancelled = true;
    };
  }

  async advance(milliseconds: number): Promise<void> {
    const target = this.now + milliseconds;
    for (;;) {
      const task = this.tasks.find((candidate) => !candidate.cancelled && candidate.at <= target);
      if (!task) break;
      task.cancelled = true;
      this.now = task.at;
      task.run();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.now = target;
    await Promise.resolve();
    await Promise.resolve();
  }
}

interface SourceTelemetry {
  requests: number;
  requestedRows: number;
  rowsServed: number;
  bytesServed: number;
  aborts: number;
}

export interface PrefetchTraceRepetition {
  readonly repetition: number;
  readonly residencyRatio: number;
  readonly p95VisibleWaitMs: number;
  readonly measuredFrames: number;
  readonly residentFrames: number;
  readonly requests: number;
  readonly requestedRows: number;
  readonly rowsServed: number;
  readonly bytesServed: number;
  readonly requestedRowMultiplier: number;
  readonly servedByteMultiplier: number;
  readonly aborts: number;
  readonly reversalAborts: number;
  readonly jumpAborts: number;
  readonly promotions: number;
  readonly cacheAllocatedBytes: number;
  readonly cacheChunks: number;
  readonly peakActiveRequests: number;
  readonly peakActiveSpeculativeRows: number;
  readonly jumpVisibleResidentBeforeResponse: boolean;
  readonly jumpVisibleResidentAfterResponse: boolean;
}

export interface PrefetchBenchmarkReport {
  readonly policy: {
    readonly sourceLatencyMs: number;
    readonly frameMs: number;
    readonly viewportRows: number;
    readonly lookaheadRowsLimit: number;
    readonly lookaheadBytesLimit: number;
    readonly requestMultiplierLimit: number;
    readonly activeRequestLimit: number;
    readonly cacheBytes: number;
  };
  readonly repetitions: readonly PrefetchTraceRepetition[];
  readonly medianResidencyRatio: number;
  readonly p95ResidencyRatio: number;
  readonly medianP95VisibleWaitMs: number;
  readonly p95VisibleWaitMs: number;
}

function workbook(): Workbook {
  return {
    activeSheet: "trace",
    sheets: [
      {
        id: "trace",
        name: "Trace",
        rowCount: ROW_COUNT,
        columns: Array.from({ length: COLUMN_COUNT }, (_, column) => ({
          key: `c${column}`,
          header: `C${column}`,
          width: 96,
          type: column === 0 ? ("number" as const) : ("text" as const),
        })),
      },
    ],
  };
}

function traceRows(start: number, end: number): RowData[] {
  return Array.from({ length: end - start }, (_, offset) => {
    const row = start + offset;
    return {
      c0: row,
      c1: `sensor-${row % 97}`,
      c2: `region-${row % 5}`,
      c3: `status-${row % 3}`,
      c4: `payload-${row}`,
      c5: `checksum-${Math.imul(row + 1, 2654435761) >>> 0}`,
    };
  });
}

async function flushRequests(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]!;
}

async function runRepetition(repetition: number): Promise<PrefetchTraceRepetition> {
  const clock = new LogicalClock();
  const store = new SheetwriteStore(workbook(), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
  });
  const source: SourceTelemetry = {
    requests: 0,
    requestedRows: 0,
    rowsServed: 0,
    bytesServed: 0,
    aborts: 0,
  };
  const pendingSignals = new Set<AbortSignal>();
  let visibleStart = VIEWPORT_ROWS / 2;
  const controller = new DatasourceController(
    {
      datasource: ({ start, end, signal }) => {
        source.requests += 1;
        source.requestedRows += end - start;
        pendingSignals.add(signal);
        const result = Promise.withResolvers<DataSourcePage>();
        const cancel = clock.schedule(SOURCE_LATENCY_MS, () => {
          pendingSignals.delete(signal);
          const rows = traceRows(start, end);
          source.rowsServed += rows.length;
          source.bytesServed += new TextEncoder().encode(JSON.stringify(rows)).byteLength;
          result.resolve({ start, rows });
        });
        signal.addEventListener(
          "abort",
          () => {
            cancel();
            pendingSignals.delete(signal);
            source.aborts += 1;
            result.reject(new DOMException("Logical datasource request aborted", "AbortError"));
          },
          { once: true },
        );
        return result.promise;
      },
      loadable: store,
      activeSheet: () => "trace",
      rowCount: () => ROW_COUNT,
      revision: () => 0,
      isCellNewerThan: () => false,
      retainRevision: () => () => {},
      onRowsLoaded: () => {},
      onError: (_request, error) => {
        throw error;
      },
      now: () => clock.now,
    },
    ROW_COUNT,
  );
  let peakActiveRequests = 0;
  let peakActiveSpeculativeRows = 0;
  const sampleActiveResources = () => {
    const telemetry = controller.getTelemetry();
    peakActiveRequests = Math.max(peakActiveRequests, telemetry.activeRequests);
    peakActiveSpeculativeRows = Math.max(
      peakActiveSpeculativeRows,
      telemetry.activeSpeculativeRows,
    );
  };

  // Declared warm-up: visible demand plus the two aligned look-ahead bands.
  controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
  sampleActiveResources();
  await clock.advance(SOURCE_LATENCY_MS);
  await flushRequests();
  controller.resetTelemetry();
  const warmSource = { ...source };

  const demandedRows = new Set<number>();
  const recordDemand = () => {
    for (let row = visibleStart; row < visibleStart + VIEWPORT_ROWS; row++) demandedRows.add(row);
  };

  const steadyFrames = TRACE_BANDS * 4;
  for (let frame = 0; frame < steadyFrames; frame++) {
    await clock.advance(FRAME_MS);
    visibleStart += VIEWPORT_ROWS / 4;
    recordDemand();
    controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
    sampleActiveResources();
  }

  // Hold the final window for one complete measured logical frame.
  await clock.advance(FRAME_MS);
  recordDemand();
  controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
  sampleActiveResources();

  for (let frame = 0; frame < REVERSE_BANDS * 4; frame++) {
    await clock.advance(FRAME_MS);
    visibleStart -= VIEWPORT_ROWS / 4;
    recordDemand();
    controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
    sampleActiveResources();
  }
  await flushRequests();

  const steady = controller.getTelemetry();
  const sourceAfterSteady = { ...source };
  const demandedBytes = new TextEncoder().encode(
    JSON.stringify(traceRows(0, demandedRows.size)),
  ).byteLength;

  // Repeated non-jump band steps create fresh visible/speculative ownership so
  // the immediate distant jump deterministically proves both cancellation paths.
  for (let step = 0; step < 3; step++) {
    visibleStart += VIEWPORT_ROWS * 2;
    controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
    sampleActiveResources();
  }

  // The distant jump must expose unloaded state until its real 90 ms response.
  visibleStart = 3_000;
  controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
  sampleActiveResources();
  const jumpVisibleResidentBeforeResponse = store.isRangeFullyLoaded({
    sheet: "trace",
    start: { row: visibleStart, col: 0 },
    end: { row: visibleStart + VIEWPORT_ROWS - 1, col: COLUMN_COUNT - 1 },
  });
  await clock.advance(SOURCE_LATENCY_MS);
  await flushRequests();
  controller.updateViewport(visibleStart, visibleStart + VIEWPORT_ROWS);
  sampleActiveResources();
  const jumpVisibleResidentAfterResponse = store.isRangeFullyLoaded({
    sheet: "trace",
    start: { row: visibleStart, col: 0 },
    end: { row: visibleStart + VIEWPORT_ROWS - 1, col: COLUMN_COUNT - 1 },
  });
  const complete = controller.getTelemetry();
  const cache = store.getPagedStats("trace");
  const measuredRequestedRows = sourceAfterSteady.requestedRows - warmSource.requestedRows;
  const measuredRowsServed = sourceAfterSteady.rowsServed - warmSource.rowsServed;
  const measuredBytesServed = sourceAfterSteady.bytesServed - warmSource.bytesServed;

  const result: PrefetchTraceRepetition = {
    repetition,
    residencyRatio: steady.residencyRatio,
    p95VisibleWaitMs: steady.p95VisibleWaitMs,
    measuredFrames: steady.measuredFrames,
    residentFrames: steady.residentFrames,
    requests: sourceAfterSteady.requests - warmSource.requests,
    requestedRows: measuredRequestedRows,
    rowsServed: measuredRowsServed,
    bytesServed: measuredBytesServed,
    requestedRowMultiplier: measuredRequestedRows / demandedRows.size,
    servedByteMultiplier: demandedBytes === 0 ? 0 : measuredBytesServed / demandedBytes,
    aborts: source.aborts - warmSource.aborts,
    reversalAborts: complete.reversalAborts,
    jumpAborts: complete.jumpAborts,
    promotions: complete.promotions,
    cacheAllocatedBytes: cache.allocatedBytes,
    cacheChunks: cache.chunks,
    peakActiveRequests,
    peakActiveSpeculativeRows,
    jumpVisibleResidentBeforeResponse,
    jumpVisibleResidentAfterResponse,
  };

  controller.destroy();
  store.dispose();
  if (pendingSignals.size !== 0) throw new Error("Prefetch trace leaked datasource requests");
  return result;
}

function assertRepetition(result: PrefetchTraceRepetition): void {
  if (result.residencyRatio < 0.95) {
    throw new Error(`repetition ${result.repetition}: residency ${result.residencyRatio} < 0.95`);
  }
  if (result.p95VisibleWaitMs >= FRAME_MS) {
    throw new Error(
      `repetition ${result.repetition}: p95 visible wait ${result.p95VisibleWaitMs} >= ${FRAME_MS}`,
    );
  }
  if (result.requestedRowMultiplier > REQUEST_MULTIPLIER_LIMIT) {
    throw new Error(
      `repetition ${result.repetition}: row multiplier ${result.requestedRowMultiplier} > ${REQUEST_MULTIPLIER_LIMIT}`,
    );
  }
  if (result.servedByteMultiplier > REQUEST_MULTIPLIER_LIMIT) {
    throw new Error(
      `repetition ${result.repetition}: byte multiplier ${result.servedByteMultiplier} > ${REQUEST_MULTIPLIER_LIMIT}`,
    );
  }
  if (result.reversalAborts === 0 || result.jumpAborts === 0) {
    throw new Error(
      `repetition ${result.repetition}: reversal/jump aborts ${result.reversalAborts}/${result.jumpAborts}`,
    );
  }
  if (result.peakActiveRequests > ACTIVE_REQUEST_LIMIT) {
    throw new Error(
      `repetition ${result.repetition}: peak active requests ${result.peakActiveRequests} > ${ACTIVE_REQUEST_LIMIT}`,
    );
  }
  if (result.peakActiveSpeculativeRows > DATASOURCE_PREFETCH_MAX_ROWS) {
    throw new Error(
      `repetition ${result.repetition}: peak speculative rows ${result.peakActiveSpeculativeRows} > ${DATASOURCE_PREFETCH_MAX_ROWS}`,
    );
  }
  if (result.cacheAllocatedBytes > CACHE_BYTES) {
    throw new Error(
      `repetition ${result.repetition}: cache ${result.cacheAllocatedBytes} > ${CACHE_BYTES}`,
    );
  }
  if (result.jumpVisibleResidentBeforeResponse || !result.jumpVisibleResidentAfterResponse) {
    throw new Error(`repetition ${result.repetition}: jump violated unloaded/loaded semantics`);
  }
}

export async function runDatasourcePrefetchBenchmark(): Promise<PrefetchBenchmarkReport> {
  await initSheetwrite();
  const repetitions: PrefetchTraceRepetition[] = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition++) {
    const result = await runRepetition(repetition);
    assertRepetition(result);
    repetitions.push(result);
  }
  const residency = repetitions.map((result) => result.residencyRatio);
  const waits = repetitions.map((result) => result.p95VisibleWaitMs);
  const report: PrefetchBenchmarkReport = {
    policy: {
      sourceLatencyMs: SOURCE_LATENCY_MS,
      frameMs: FRAME_MS,
      viewportRows: VIEWPORT_ROWS,
      lookaheadRowsLimit: DATASOURCE_PREFETCH_MAX_ROWS,
      lookaheadBytesLimit: DATASOURCE_PREFETCH_MAX_BYTES,
      requestMultiplierLimit: REQUEST_MULTIPLIER_LIMIT,
      activeRequestLimit: ACTIVE_REQUEST_LIMIT,
      cacheBytes: CACHE_BYTES,
    },
    repetitions,
    medianResidencyRatio: percentile(residency, 0.5),
    p95ResidencyRatio: percentile(residency, 0.95),
    medianP95VisibleWaitMs: percentile(waits, 0.5),
    p95VisibleWaitMs: percentile(waits, 0.95),
  };
  if (report.medianResidencyRatio < 0.95 || report.medianP95VisibleWaitMs >= FRAME_MS) {
    throw new Error("Datasource prefetch median gate failed");
  }
  return report;
}

if (import.meta.main) {
  const report = await runDatasourcePrefetchBenchmark();
  console.log(JSON.stringify(report, null, 2));
}
