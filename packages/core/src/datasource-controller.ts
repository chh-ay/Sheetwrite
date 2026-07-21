import type { SheetwriteStore } from "./store.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DataSourcePage, DataSourceRequest } from "./types/data.js";

/** Stable internal policy bounds. Prefetch never exceeds either horizon. */
export const DATASOURCE_PREFETCH_MAX_ROWS = 512;
export const DATASOURCE_PREFETCH_MAX_BYTES = 512 * 1024;
export const DATASOURCE_PREFETCH_MAX_BANDS = 2;
const LOGICAL_FRAME_MS = 16.7;
const ESTIMATED_CELL_BYTES = 16;

let datasourceClockForTest: (() => number) | undefined;

/** Installs a deterministic monotonic clock through the public testing entrypoint. */
export function installDatasourceClockForTest(now: () => number): () => void {
  const previous = datasourceClockForTest;
  datasourceClockForTest = now;
  return () => {
    datasourceClockForTest = previous;
  };
}

type RequestPriority = "visible" | "speculative";
type AbortReason = "obsolete" | "reversal" | "jump" | "reset" | "destroy";

export interface DatasourceControllerOptions {
  datasource?: (request: DataSourceRequest) => Promise<DataSourcePage>;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  rowCount: (sheet: SheetId) => number;
  revision: () => number;
  isCellNewerThan: (address: CellAddress, revision: number) => boolean;
  retainRevision: (revision: number) => () => void;
  onRowsLoaded: () => void;
  onError: (request: Omit<DataSourceRequest, "signal">, error: unknown) => void;
  /** Monotonic clock injection for deterministic residency traces. */
  now?: () => number;
}

interface ActiveRequest {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly controller: AbortController;
  readonly releaseRevision: () => void;
  readonly speculativeOrigin: boolean;
  readonly viewportOrigin: boolean;
  durableDemand: boolean;
  priority: RequestPriority;
  direction: -1 | 0 | 1;
  released: boolean;
}

export interface DatasourcePrefetchTelemetry {
  readonly direction: -1 | 0 | 1;
  readonly velocityRowsPerMs: number;
  readonly measuredFrames: number;
  readonly residentFrames: number;
  readonly residencyRatio: number;
  readonly visibleWaitSamples: number;
  readonly p95VisibleWaitMs: number;
  readonly maxVisibleWaitMs: number;
  readonly requests: number;
  readonly visibleRequests: number;
  readonly speculativeRequests: number;
  readonly requestedRows: number;
  readonly visibleRequestedRows: number;
  readonly speculativeRequestedRows: number;
  readonly estimatedRequestedBytes: number;
  readonly promotions: number;
  readonly aborts: number;
  readonly reversalAborts: number;
  readonly jumpAborts: number;
  readonly resetAborts: number;
  readonly destroyAborts: number;
  readonly activeRequests: number;
  readonly activeSpeculativeRequests: number;
  readonly activeSpeculativeRows: number;
  readonly cacheChunks: number;
  readonly cacheAllocatedBytes: number;
}

interface MutableTelemetry {
  measuredFrames: number;
  residentFrames: number;
  requests: number;
  visibleRequests: number;
  speculativeRequests: number;
  requestedRows: number;
  visibleRequestedRows: number;
  speculativeRequestedRows: number;
  estimatedRequestedBytes: number;
  promotions: number;
  aborts: number;
  reversalAborts: number;
  jumpAborts: number;
  resetAborts: number;
  destroyAborts: number;
}

function emptyTelemetry(): MutableTelemetry {
  return {
    measuredFrames: 0,
    residentFrames: 0,
    requests: 0,
    visibleRequests: 0,
    speculativeRequests: 0,
    requestedRows: 0,
    visibleRequestedRows: 0,
    speculativeRequestedRows: 0,
    estimatedRequestedBytes: 0,
    promotions: 0,
    aborts: 0,
    reversalAborts: 0,
    jumpAborts: 0,
    resetAborts: 0,
    destroyAborts: 0,
  };
}

function intersects(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

/** Owns datasource request bands, priority, cancellation, generations, and loaded-row state. */
export class DatasourceController {
  private loaded: Uint8Array;
  private owners: Uint32Array;
  private visibleWaitStarted: Float64Array;
  private readonly activeIds = new Map<number, ActiveRequest>();
  private readonly requests = new Set<ActiveRequest>();
  private nextRequestId = 1;
  private generation = 0;
  private destroyed = false;
  private direction: -1 | 0 | 1 = 0;
  private velocityRowsPerMs = 0;
  private lastViewport: { start: number; end: number; at: number } | null = null;
  private telemetry = emptyTelemetry();
  private readonly visibleWaitDurations: number[] = [];

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.loaded = new Uint8Array(rowCount);
    this.owners = new Uint32Array(rowCount);
    this.visibleWaitStarted = new Float64Array(rowCount);
    this.visibleWaitStarted.fill(Number.NaN);
  }

  /** Requests a demand-critical interval without applying speculative policy. */
  ensureLoaded(start: number, end: number): void {
    this.ensureRange(start, end, "visible", 0, false);
  }

  /**
   * Records the zero-overscan viewport, starts visible work first, then keeps a
   * bounded aligned look-ahead and a smaller reversal band warm.
   */
  updateViewport(start: number, end: number): void {
    if (this.destroyed) return;
    const visibleStart = Math.min(this.loaded.length, Math.max(0, Math.floor(start)));
    const visibleEnd = Math.min(this.loaded.length, Math.max(visibleStart, Math.ceil(end)));
    if (visibleStart === visibleEnd) return;

    const now = this.now();
    const visibleRows = visibleEnd - visibleStart;
    const previous = this.lastViewport;
    const previousRows = previous ? previous.end - previous.start : visibleRows;
    const delta = previous ? visibleStart - previous.start : 0;
    const movementDirection: -1 | 0 | 1 = delta === 0 ? 0 : delta > 0 ? 1 : -1;
    const elapsed = previous ? Math.max(0, now - previous.at) : 0;
    if (elapsed > 0 && movementDirection !== 0) this.velocityRowsPerMs = delta / elapsed;
    const reversal =
      movementDirection !== 0 && this.direction !== 0 && movementDirection !== this.direction;
    const jump = previous !== null && Math.abs(delta) > Math.max(visibleRows, previousRows) * 2;
    if (movementDirection !== 0) this.direction = movementDirection;
    const effectiveDirection: -1 | 1 = this.direction === 0 ? 1 : this.direction;

    const speculative = this.speculativeIntervals(
      visibleStart,
      visibleEnd,
      effectiveDirection,
      visibleRows,
    );
    this.lastViewport = { start: visibleStart, end: visibleEnd, at: now };
    this.cancelObsoleteSpeculation(
      visibleStart,
      visibleEnd,
      speculative,
      jump ? "jump" : reversal ? "reversal" : "obsolete",
      reversal || jump,
    );

    this.refreshPagedResidency(this.options.loadable, visibleStart, visibleEnd);
    let fullyResident = true;
    for (let row = visibleStart; row < visibleEnd; row++) {
      if (this.loaded[row] !== 0) continue;
      fullyResident = false;
      if (Number.isNaN(this.visibleWaitStarted[row]!)) this.visibleWaitStarted[row] = now;
    }
    this.telemetry.measuredFrames += 1;
    if (fullyResident) this.telemetry.residentFrames += 1;

    // Visible demand is always issued/promoted before any new speculation.
    this.ensureRange(visibleStart, visibleEnd, "visible", 0, true);
    for (const interval of speculative) {
      this.ensureSpeculativeBands(interval.start, interval.end, visibleRows, effectiveDirection);
    }
  }

  getTelemetry(): DatasourcePrefetchTelemetry {
    const waits = [...this.visibleWaitDurations].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(waits.length * 0.95) - 1);
    const loadable = this.options.loadable;
    const sheet = this.options.activeSheet();
    const cache = loadable?.isPaged(sheet) ? loadable.getPagedStats(sheet) : null;
    let activeSpeculativeRequests = 0;
    let activeSpeculativeRows = 0;
    for (const request of this.requests) {
      if (!request.speculativeOrigin) continue;
      activeSpeculativeRequests += 1;
      activeSpeculativeRows += request.end - request.start;
    }
    return {
      direction: this.direction,
      velocityRowsPerMs: this.velocityRowsPerMs,
      measuredFrames: this.telemetry.measuredFrames,
      residentFrames: this.telemetry.residentFrames,
      residencyRatio:
        this.telemetry.measuredFrames === 0
          ? 1
          : this.telemetry.residentFrames / this.telemetry.measuredFrames,
      visibleWaitSamples: waits.length,
      p95VisibleWaitMs: waits[p95Index] ?? 0,
      maxVisibleWaitMs: waits.at(-1) ?? 0,
      requests: this.telemetry.requests,
      visibleRequests: this.telemetry.visibleRequests,
      speculativeRequests: this.telemetry.speculativeRequests,
      requestedRows: this.telemetry.requestedRows,
      visibleRequestedRows: this.telemetry.visibleRequestedRows,
      speculativeRequestedRows: this.telemetry.speculativeRequestedRows,
      estimatedRequestedBytes: this.telemetry.estimatedRequestedBytes,
      promotions: this.telemetry.promotions,
      aborts: this.telemetry.aborts,
      reversalAborts: this.telemetry.reversalAborts,
      jumpAborts: this.telemetry.jumpAborts,
      resetAborts: this.telemetry.resetAborts,
      destroyAborts: this.telemetry.destroyAborts,
      activeRequests: this.requests.size,
      activeSpeculativeRequests,
      activeSpeculativeRows,
      cacheChunks: cache?.chunks ?? 0,
      cacheAllocatedBytes: cache?.allocatedBytes ?? 0,
    };
  }

  resetTelemetry(): void {
    this.telemetry = emptyTelemetry();
    this.visibleWaitDurations.length = 0;
    this.visibleWaitStarted.fill(Number.NaN);
  }

  private ensureSpeculativeBands(
    start: number,
    end: number,
    bandRows: number,
    direction: -1 | 1,
  ): void {
    if (start >= end) return;
    if (direction > 0) {
      let cursor = start;
      while (cursor < end) {
        const remainingRows = this.remainingSpeculativeRows();
        if (remainingRows === 0) return;
        const requestEnd = Math.min(end, cursor + bandRows, cursor + remainingRows);
        this.ensureRange(cursor, requestEnd, "speculative", direction, false);
        cursor = requestEnd;
      }
      return;
    }
    let cursor = end;
    while (cursor > start) {
      const remainingRows = this.remainingSpeculativeRows();
      if (remainingRows === 0) return;
      const requestStart = Math.max(start, cursor - bandRows, cursor - remainingRows);
      this.ensureRange(requestStart, cursor, "speculative", direction, false);
      cursor = requestStart;
    }
  }

  private remainingSpeculativeRows(): number {
    let activeRows = 0;
    for (const request of this.requests) {
      if (request.speculativeOrigin) activeRows += request.end - request.start;
    }
    return Math.max(0, this.speculativeRowHorizon() - activeRows);
  }

  private speculativeIntervals(
    visibleStart: number,
    visibleEnd: number,
    direction: -1 | 1,
    bandRows: number,
  ): Array<{ start: number; end: number }> {
    const horizonRows = this.speculativeRowHorizon();
    if (horizonRows === 0) return [];
    const speedInWindowsPerFrame =
      (Math.abs(this.velocityRowsPerMs) * LOGICAL_FRAME_MS) / Math.max(1, bandRows);
    const bands = speedInWindowsPerFrame >= 0.125 || this.lastViewport === null ? 2 : 1;
    const behindRows = Math.min(Math.floor(horizonRows / 5), Math.max(1, Math.ceil(bandRows / 2)));
    const aheadRows = Math.min(
      horizonRows - behindRows,
      bandRows * Math.min(bands, DATASOURCE_PREFETCH_MAX_BANDS),
    );
    const intervals: Array<{ start: number; end: number }> = [];

    if (direction > 0) {
      const behindEnd = Math.floor(visibleStart / bandRows) * bandRows;
      const behindStart = Math.max(0, behindEnd - behindRows);
      const actualBehindRows = behindEnd - behindStart;
      const aheadStart = Math.floor(visibleEnd / bandRows) * bandRows;
      const desiredAheadEnd = Math.ceil((visibleEnd + aheadRows) / bandRows) * bandRows;
      const boundedAheadEnd = aheadStart + (horizonRows - actualBehindRows);
      const aheadEnd = Math.min(this.loaded.length, desiredAheadEnd, boundedAheadEnd);
      if (behindStart < behindEnd) intervals.push({ start: behindStart, end: behindEnd });
      if (aheadStart < aheadEnd) intervals.push({ start: aheadStart, end: aheadEnd });
    } else {
      const aheadEnd = Math.min(this.loaded.length, Math.ceil(visibleStart / bandRows) * bandRows);
      const behindStart = Math.min(this.loaded.length, Math.ceil(visibleEnd / bandRows) * bandRows);
      const behindEnd = Math.min(this.loaded.length, behindStart + behindRows);
      const actualBehindRows = behindEnd - behindStart;
      const desiredAheadStart =
        Math.floor(Math.max(0, visibleStart - aheadRows) / bandRows) * bandRows;
      const boundedAheadStart = aheadEnd - (horizonRows - actualBehindRows);
      const aheadStart = Math.max(0, desiredAheadStart, boundedAheadStart);
      if (aheadStart < aheadEnd) intervals.push({ start: aheadStart, end: aheadEnd });
      if (behindStart < behindEnd) intervals.push({ start: behindStart, end: behindEnd });
    }
    return intervals;
  }

  private speculativeRowHorizon(): number {
    const byteBoundRows = Math.floor(DATASOURCE_PREFETCH_MAX_BYTES / this.estimatedRowBytes());
    return Math.min(DATASOURCE_PREFETCH_MAX_ROWS, Math.max(0, byteBoundRows));
  }

  private estimatedRowBytes(): number {
    const sheet = this.options.activeSheet();
    const schema = this.options.loadable
      ?.getWorkbook()
      .sheets.find((candidate) => candidate.id === sheet);
    return Math.max(ESTIMATED_CELL_BYTES, (schema?.columns.length ?? 1) * ESTIMATED_CELL_BYTES);
  }

  private ensureRange(
    start: number,
    end: number,
    priority: RequestPriority,
    direction: -1 | 0 | 1,
    viewportOrigin: boolean,
  ): void {
    const datasource = this.options.datasource;
    const loadable = this.options.loadable;
    if (!datasource || !loadable || this.destroyed) return;

    this.refreshPagedResidency(loadable, start, end);
    const requestLimit = Math.min(this.loaded.length, Math.max(0, Math.ceil(end)));
    let row = Math.min(requestLimit, Math.max(0, Math.floor(start)));
    while (row < requestLimit) {
      while (row < requestLimit && this.loaded[row] !== 0) row += 1;
      if (row >= requestLimit) return;

      const owner = this.owners[row] ?? 0;
      if (owner !== 0) {
        const request = this.activeIds.get(owner);
        if (priority === "visible" && !viewportOrigin && request) request.durableDemand = true;
        if (priority === "visible" && request?.priority === "speculative") {
          request.priority = "visible";
          request.direction = 0;
          this.telemetry.promotions += 1;
        }
        row += 1;
        continue;
      }

      const requestStart = row;
      while (row < requestLimit && this.loaded[row] === 0 && this.owners[row] === 0) row += 1;
      this.requestBand(
        datasource,
        loadable,
        requestStart,
        row,
        priority,
        direction,
        viewportOrigin,
      );
    }
  }

  /** Fast-path resident bands, then refine rows without clearing resident peers. */
  private refreshPagedResidency(
    loadable: SheetwriteStore | null,
    start: number,
    end: number,
  ): void {
    if (!loadable) return;
    const sheet = this.options.activeSheet();
    if (!loadable.isPaged(sheet)) return;
    const schema = loadable.getWorkbook().sheets.find((candidate) => candidate.id === sheet);
    const columnCount = schema?.columns.length ?? 0;
    const rangeStart = Math.min(this.loaded.length, Math.max(0, Math.floor(start)));
    const rangeEnd = Math.min(this.loaded.length, Math.max(rangeStart, Math.ceil(end)));
    if (columnCount === 0 || rangeStart === rangeEnd) return;
    if (
      loadable.isRangeFullyLoaded({
        sheet,
        start: { row: rangeStart, col: 0 },
        end: { row: rangeEnd - 1, col: columnCount - 1 },
      })
    ) {
      this.loaded.fill(1, rangeStart, rangeEnd);
      return;
    }

    for (let row = rangeStart; row < rangeEnd; row++) {
      if (this.owners[row] !== 0) continue;
      this.loaded[row] = loadable.isRangeFullyLoaded({
        sheet,
        start: { row, col: 0 },
        end: { row, col: columnCount - 1 },
      })
        ? 1
        : 0;
    }
  }

  resize(rowCount: number): void {
    if (this.loaded.length !== rowCount) this.reset(rowCount);
  }

  reset(rowCount: number): void {
    this.generation += 1;
    for (const request of [...this.requests]) this.abortRequest(request, "reset");
    this.loaded = new Uint8Array(rowCount);
    this.owners = new Uint32Array(rowCount);
    this.visibleWaitStarted = new Float64Array(rowCount);
    this.visibleWaitStarted.fill(Number.NaN);
    this.lastViewport = null;
    this.direction = 0;
    this.velocityRowsPerMs = 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    for (const request of [...this.requests]) this.abortRequest(request, "destroy");
    this.owners.fill(0);
    this.lastViewport = null;
  }

  private cancelObsoleteSpeculation(
    visibleStart: number,
    visibleEnd: number,
    intervals: readonly { start: number; end: number }[],
    reason: "obsolete" | "reversal" | "jump",
    cancelGeneration: boolean,
  ): void {
    for (const request of [...this.requests]) {
      if (request.durableDemand) continue;
      if (request.speculativeOrigin) {
        if (intersects(request.start, request.end, visibleStart, visibleEnd)) continue;
        const fullyWanted = intervals.some(
          (interval) => request.start >= interval.start && request.end <= interval.end,
        );
        if (!cancelGeneration && fullyWanted) {
          request.priority = "speculative";
          continue;
        }
        this.abortRequest(request, reason);
        continue;
      }
      if (
        request.viewportOrigin &&
        !intersects(request.start, request.end, visibleStart, visibleEnd)
      ) {
        this.abortRequest(request, reason);
      }
    }
  }

  private abortRequest(request: ActiveRequest, reason: AbortReason): void {
    if (request.released) return;
    request.controller.abort();
    this.clearOwned(request);
    this.finishRequest(request);
    this.telemetry.aborts += 1;
    if (reason === "reversal") this.telemetry.reversalAborts += 1;
    else if (reason === "jump") this.telemetry.jumpAborts += 1;
    else if (reason === "reset") this.telemetry.resetAborts += 1;
    else if (reason === "destroy") this.telemetry.destroyAborts += 1;
  }

  private requestBand(
    datasource: NonNullable<DatasourceControllerOptions["datasource"]>,
    loadable: SheetwriteStore,
    requestStart: number,
    requestEnd: number,
    priority: RequestPriority,
    direction: -1 | 0 | 1,
    viewportOrigin: boolean,
  ): void {
    const id = this.allocateRequestId();
    for (let row = requestStart; row < requestEnd; row++) this.owners[row] = id;

    const sheet = this.options.activeSheet();
    const generation = this.generation;
    const revision = this.options.revision();
    const controller = new AbortController();
    const activeRequest: ActiveRequest = {
      id,
      start: requestStart,
      end: requestEnd,
      controller,
      releaseRevision: this.options.retainRevision(revision),
      speculativeOrigin: priority === "speculative",
      viewportOrigin,
      durableDemand: priority === "visible" && !viewportOrigin,
      priority,
      direction,
      released: false,
    };
    this.activeIds.set(id, activeRequest);
    this.requests.add(activeRequest);
    const requestedRows = requestEnd - requestStart;
    this.telemetry.requests += 1;
    this.telemetry.requestedRows += requestedRows;
    this.telemetry.estimatedRequestedBytes += requestedRows * this.estimatedRowBytes();
    if (priority === "visible") {
      this.telemetry.visibleRequests += 1;
      this.telemetry.visibleRequestedRows += requestedRows;
    } else {
      this.telemetry.speculativeRequests += 1;
      this.telemetry.speculativeRequestedRows += requestedRows;
    }

    const request: DataSourceRequest = {
      sheet,
      start: requestStart,
      end: requestEnd,
      signal: controller.signal,
      revision,
    };
    let pending: Promise<DataSourcePage>;

    try {
      pending = datasource(request);
    } catch (error) {
      this.clearOwned(activeRequest);
      this.finishRequest(activeRequest);
      queueMicrotask(() => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      });
      return;
    }

    Promise.resolve(pending)
      .then((page) => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        const rows = page.rows;
        const valid =
          page.start === requestStart &&
          Array.isArray(rows) &&
          rows.length <= requestEnd - requestStart &&
          page.start + rows.length <= this.options.rowCount(sheet);
        if (!valid) {
          this.clearOwned(activeRequest);
          this.options.onError(
            { sheet, start: requestStart, end: requestEnd, revision },
            new RangeError("Datasource page does not match the requested range"),
          );
          return;
        }

        loadable.loadRows(sheet, page.start, rows, (address) =>
          this.options.isCellNewerThan(address, revision),
        );
        const loadedAt = this.now();
        for (let row = page.start; row < page.start + rows.length; row++) {
          if (this.owners[row] === id) this.loaded[row] = 1;
          const waitStarted = this.visibleWaitStarted[row];
          if (waitStarted !== undefined && !Number.isNaN(waitStarted)) {
            this.visibleWaitDurations.push(Math.max(0, loadedAt - waitStarted));
            this.visibleWaitStarted[row] = Number.NaN;
          }
        }
        this.clearOwned(activeRequest);
        this.options.onRowsLoaded();
      })
      .catch((error: unknown) => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.clearOwned(activeRequest);
        this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      })
      .finally(() => this.finishRequest(activeRequest));
  }

  private allocateRequestId(): number {
    for (;;) {
      const id = this.nextRequestId;
      this.nextRequestId = id === 0xffff_ffff ? 1 : id + 1;
      if (!this.activeIds.has(id)) return id;
    }
  }

  private finishRequest(request: ActiveRequest): void {
    if (request.released) return;
    request.released = true;
    this.requests.delete(request);
    this.activeIds.delete(request.id);
    request.releaseRevision();
  }

  private clearOwned(request: ActiveRequest): void {
    for (let row = request.start; row < request.end; row++) {
      if (this.owners[row] === request.id) this.owners[row] = 0;
    }
  }

  private now(): number {
    return (
      this.options.now?.() ??
      datasourceClockForTest?.() ??
      globalThis.performance?.now() ??
      Date.now()
    );
  }
}
