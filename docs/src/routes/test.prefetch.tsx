import type {
  DataSourceColumnBand,
  DataSourcePage,
  Grid,
  RowData,
  Workbook,
} from "@sheetwrite/core";
import { createGrid, initSheetwrite, type SheetwriteStore } from "@sheetwrite/core";
import { installDatasourceClockForTest } from "@sheetwrite/core/testing";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import "@sheetwrite/core/styles.css";
import type { RendererPrefetchRepetition, RendererPrefetchReport } from "../lib/prefetch-report.js";

const FRAME_MS = 16.7;
const SOURCE_LATENCY_MS = 90;
const VIEWPORT_ROWS = 20;
const ROW_HEIGHT = 20;
const REPETITIONS = 5;
const CACHE_BYTES = 12 * 1024;
const COLUMN_COUNT = 6;
const TRACE_BANDS: readonly DataSourceColumnBand[] = [
  {
    start: 0,
    end: COLUMN_COUNT,
    keys: Array.from({ length: COLUMN_COUNT }, (_, column) => `c${column}`),
  },
];
const REQUEST_MULTIPLIER_LIMIT = 3;
const ACTIVE_REQUEST_LIMIT = 6;

declare global {
  interface Window {
    __sheetwriteRunPrefetchTrace?: () => Promise<RendererPrefetchReport>;
  }
}

interface ScheduledTask {
  at: number;
  sequence: number;
  run: () => void;
  cancelled: boolean;
}

class LogicalClock {
  now = 0;
  private sequence = 0;
  private readonly tasks: ScheduledTask[] = [];

  schedule(run: () => void): () => void {
    const task: ScheduledTask = {
      at: this.now + SOURCE_LATENCY_MS,
      sequence: this.sequence++,
      run,
      cancelled: false,
    };
    this.tasks.push(task);
    this.tasks.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
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

function traceWorkbook(): Workbook {
  return {
    activeSheet: "trace",
    sheets: [
      {
        id: "trace",
        name: "Trace",
        rowCount: 5_000,
        columns: Array.from({ length: COLUMN_COUNT }, (_, column) => ({
          key: `c${column}`,
          header: `C${column}`,
          width: 92,
          type: column === 0 ? ("number" as const) : ("text" as const),
        })),
      },
    ],
  };
}

function traceValue(key: string, row: number): RowData[string] {
  switch (key) {
    case "c0":
      return row;
    case "c1":
      return `sensor-${row % 97}`;
    case "c2":
      return `region-${row % 5}`;
    case "c3":
      return `status-${row % 3}`;
    case "c4":
      return `payload-${row}`;
    case "c5":
      return `checksum-${Math.imul(row + 1, 2654435761) >>> 0}`;
    default:
      return null;
  }
}

function rows(start: number, end: number, columns: readonly DataSourceColumnBand[]): RowData[] {
  const keys = columns.flatMap((band) => band.keys);
  return Array.from({ length: end - start }, (_, offset) => {
    const row = start + offset;
    const pageRow: RowData = {};
    for (const key of keys) pageRow[key] = traceValue(key, row);
    return pageRow;
  });
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]!;
}

function installControlledAnimationFrames(): () => void {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const queued = new Set<number>();
  let nextFrame = 1;
  globalThis.requestAnimationFrame = () => {
    const frame = nextFrame++;
    queued.add(frame);
    return frame;
  };
  globalThis.cancelAnimationFrame = (frame) => {
    queued.delete(frame);
  };
  return () => {
    queued.clear();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  };
}

async function runRepetition(repetition: number): Promise<RendererPrefetchRepetition> {
  const clock = new LogicalClock();
  const restoreDatasourceClock = installDatasourceClockForTest(() => clock.now);
  const restoreAnimationFrames = installControlledAnimationFrames();
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:640px;height:427px;contain:strict;";
  document.body.append(host);
  let grid: Grid | null = null;
  let requests = 0;
  let requestedRows = 0;
  let rowsServed = 0;
  let bytesServed = 0;
  let aborts = 0;
  const activeRequests = new Set<AbortSignal>();
  let peakActiveRequests = 0;

  try {
    grid = createGrid(host, {
      workbook: traceWorkbook(),
      datasource: {
        capabilities: { protocol: 2, columns: "windowed" },
        getRows({ start, end, columns, signal }) {
          requests += 1;
          requestedRows += end - start;
          activeRequests.add(signal);
          const result = Promise.withResolvers<DataSourcePage>();
          const cancel = clock.schedule(() => {
            const pageRows = rows(start, end, columns);
            rowsServed += pageRows.length;
            bytesServed += new TextEncoder().encode(JSON.stringify(pageRows)).byteLength;
            activeRequests.delete(signal);
            result.resolve({ protocol: 2, start, columns, rows: pageRows });
          });
          signal.addEventListener(
            "abort",
            () => {
              cancel();
              activeRequests.delete(signal);
              aborts += 1;
              result.reject(new DOMException("Logical datasource request aborted", "AbortError"));
            },
            { once: true },
          );
          return result.promise;
        },
      },
      datasourceStorage: { mode: "paged", chunkRows: VIEWPORT_ROWS, cacheBytes: CACHE_BYTES },
      overscan: 0,
      config: { toolbar: false, tabs: false },
      theme: { rowHeight: ROW_HEIGHT, headerHeight: 28, rowHeaderWidth: 48 },
    });
    const store = grid.store as SheetwriteStore;
    const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!scroller) throw new Error("Prefetch fixture did not mount its scroller");
    let visible = { start: 0, end: VIEWPORT_ROWS };
    const unsubscribe = grid.on("scroll", ({ firstRow, lastRow }) => {
      visible = { start: firstRow, end: lastRow + 1 };
    });
    const renderAt = (row: number): boolean => {
      scroller.scrollTop = row * ROW_HEIGHT;
      grid!.refresh();
      peakActiveRequests = Math.max(peakActiveRequests, activeRequests.size);
      return store.isRangeFullyLoaded({
        sheet: "trace",
        start: { row: visible.start, col: 0 },
        end: { row: visible.end - 1, col: COLUMN_COUNT - 1 },
      });
    };

    renderAt(0);
    await clock.advance(SOURCE_LATENCY_MS);
    renderAt(0);
    let visibleStart = VIEWPORT_ROWS / 2;
    renderAt(visibleStart);
    await clock.advance(SOURCE_LATENCY_MS);
    renderAt(visibleStart);

    // Excluded warm-up: the fixed viewport and its two real aligned look-ahead bands are resident.
    const warm = { requests, requestedRows, rowsServed, bytesServed, aborts };
    const waits: number[] = [];
    const demandedRows = new Set<number>();
    let waitStarted: number | null = null;
    let measuredFrames = 0;
    let residentFrames = 0;
    const measure = (resident: boolean) => {
      measuredFrames += 1;
      for (let row = visible.start; row < visible.end; row++) demandedRows.add(row);
      if (resident) {
        residentFrames += 1;
        if (waitStarted !== null) {
          waits.push(clock.now - waitStarted);
          waitStarted = null;
        }
      } else if (waitStarted === null) {
        waitStarted = clock.now;
      }
    };

    for (let frame = 0; frame < 40; frame++) {
      await clock.advance(FRAME_MS);
      visibleStart += VIEWPORT_ROWS / 4;
      measure(renderAt(visibleStart));
    }
    await clock.advance(FRAME_MS);
    measure(renderAt(visibleStart));
    for (let frame = 0; frame < 8; frame++) {
      await clock.advance(FRAME_MS);
      visibleStart -= VIEWPORT_ROWS / 4;
      measure(renderAt(visibleStart));
    }
    const steady = { requests, requestedRows, rowsServed, bytesServed, aborts };
    const demandedStart = Math.min(...demandedRows);
    const demandedEnd = Math.max(...demandedRows) + 1;
    const demandedBytes = new TextEncoder().encode(
      JSON.stringify(rows(demandedStart, demandedEnd, TRACE_BANDS)),
    ).byteLength;

    visibleStart = 3_000;
    const jumpVisibleResidentBeforeResponse = renderAt(visibleStart);
    const abortsAfterJump = aborts;
    await clock.advance(SOURCE_LATENCY_MS);
    const jumpVisibleResidentAfterResponse = renderAt(visibleStart);
    const cache = store.getPagedStats("trace");
    unsubscribe();

    const measuredRequestedRows = steady.requestedRows - warm.requestedRows;
    const measuredRowsServed = steady.rowsServed - warm.rowsServed;
    const measuredBytesServed = steady.bytesServed - warm.bytesServed;
    return {
      repetition,
      residencyRatio: residentFrames / measuredFrames,
      p95VisibleWaitMs: percentile(waits, 0.95),
      measuredFrames,
      residentFrames,
      requests: steady.requests - warm.requests,
      requestedRows: measuredRequestedRows,
      rowsServed: measuredRowsServed,
      bytesServed: measuredBytesServed,
      requestedRowMultiplier: measuredRequestedRows / demandedRows.size,
      servedByteMultiplier: demandedBytes === 0 ? 0 : measuredBytesServed / demandedBytes,
      reversalAborts: steady.aborts - warm.aborts,
      jumpAborts: abortsAfterJump - steady.aborts,
      cacheAllocatedBytes: cache.allocatedBytes,
      cacheChunks: cache.chunks,
      peakActiveRequests,
      jumpVisibleResidentBeforeResponse,
      jumpVisibleResidentAfterResponse,
    };
  } finally {
    grid?.destroy();
    host.remove();
    restoreAnimationFrames();
    restoreDatasourceClock();
  }
}

async function runRendererPrefetchTrace(): Promise<RendererPrefetchReport> {
  await initSheetwrite();
  const repetitions: RendererPrefetchRepetition[] = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition++) {
    repetitions.push(await runRepetition(repetition));
  }
  return {
    policy: {
      sourceLatencyMs: SOURCE_LATENCY_MS,
      frameMs: FRAME_MS,
      viewportRows: VIEWPORT_ROWS,
      velocityWindowsPerFrame: 0.25,
      requestMultiplierLimit: REQUEST_MULTIPLIER_LIMIT,
      activeRequestLimit: ACTIVE_REQUEST_LIMIT,
      cacheBytes: CACHE_BYTES,
      devicePixelRatio: globalThis.devicePixelRatio,
    },
    repetitions,
    medianResidencyRatio: percentile(
      repetitions.map((result) => result.residencyRatio),
      0.5,
    ),
    medianP95VisibleWaitMs: percentile(
      repetitions.map((result) => result.p95VisibleWaitMs),
      0.5,
    ),
  };
}

function PrefetchFixture() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.__sheetwriteRunPrefetchTrace = runRendererPrefetchTrace;
    setReady(true);
    return () => {
      delete window.__sheetwriteRunPrefetchTrace;
    };
  }, []);
  return <main data-testid="prefetch-fixture" data-ready={ready || undefined} />;
}

export const Route = createFileRoute("/test/prefetch")({ component: PrefetchFixture });
