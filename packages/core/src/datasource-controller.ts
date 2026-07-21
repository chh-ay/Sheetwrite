import type { ResourceOwnerBytes } from "./resource-accounting.js";
import type { SheetwriteStore } from "./store.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type { DataSourcePage, DataSourceRequest } from "./types/data.js";

/** Stable internal policy bounds. Prefetch never exceeds either horizon. */
export const DATASOURCE_PREFETCH_MAX_ROWS = 512;
export const DATASOURCE_PREFETCH_MAX_BYTES = 512 * 1024;
export const DATASOURCE_PREFETCH_MAX_BANDS = 2;
export const DATASOURCE_MAX_ACTIVE_REQUESTS = 6;
const LOGICAL_FRAME_MS = 16.7;
const ESTIMATED_CELL_BYTES = 16;
export const DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT = 4_096;

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

interface PendingDemand extends RowBand {
  readonly priority: RequestPriority;
  readonly direction: -1 | 0 | 1;
  readonly viewportOrigin: boolean;
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
  /** Sparse bookkeeping cardinality, independent of logical row count. */
  readonly loadedBands: number;
  readonly ownedBands: number;
  readonly visibleWaitingRows: number;
  readonly visibleWaitingBands: number;
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

interface RowBand {
  start: number;
  end: number;
}

/** Sorted, disjoint half-open row intervals. */
class SparseRowSet {
  private readonly bands: RowBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  first(): RowBand | undefined {
    return this.bands[0];
  }

  clear(): void {
    this.bands.length = 0;
  }

  covers(start: number, end: number): boolean {
    if (start >= end) return true;
    const band = this.atOrAfter(start);
    return band !== undefined && band.start <= start && band.end >= end;
  }

  intersections(start: number, end: number): RowBand[] {
    const result: RowBand[] = [];
    let band = this.atOrAfter(start);
    while (band && band.start < end) {
      result.push({ start: Math.max(start, band.start), end: Math.min(end, band.end) });
      band = this.atOrAfter(band.end);
    }
    return result;
  }

  atOrAfter(row: number): RowBand | undefined {
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.end <= row) low = middle + 1;
      else high = middle;
    }
    return this.bands[low];
  }

  add(start: number, end: number): void {
    if (start >= end) return;
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.end < start) low = middle + 1;
      else high = middle;
    }

    let mergedStart = start;
    let mergedEnd = end;
    let last = low;
    while (last < this.bands.length && this.bands[last]!.start <= mergedEnd) {
      mergedStart = Math.min(mergedStart, this.bands[last]!.start);
      mergedEnd = Math.max(mergedEnd, this.bands[last]!.end);
      last += 1;
    }
    this.bands.splice(low, last - low, { start: mergedStart, end: mergedEnd });
  }

  remove(start: number, end: number): void {
    if (start >= end) return;
    let index = 0;
    while (index < this.bands.length && this.bands[index]!.end <= start) index += 1;
    while (index < this.bands.length) {
      const band = this.bands[index]!;
      if (band.start >= end) return;
      if (band.start < start && band.end > end) {
        const right = { start: end, end: band.end };
        band.end = start;
        this.bands.splice(index + 1, 0, right);
        return;
      }
      if (band.start < start) {
        band.end = start;
        index += 1;
        continue;
      }
      if (band.end > end) {
        band.start = end;
        return;
      }
      this.bands.splice(index, 1);
    }
  }

  forEachGap(start: number, end: number, visit: (start: number, end: number) => void): void {
    if (start >= end) return;
    let cursor = start;
    let band = this.atOrAfter(start);
    while (band && band.start < end) {
      if (band.start > cursor) visit(cursor, Math.min(end, band.start));
      cursor = Math.max(cursor, band.end);
      if (cursor >= end) return;
      band = this.atOrAfter(cursor);
    }
    if (cursor < end) visit(cursor, end);
  }
}

interface OwnerBand extends RowBand {
  readonly owner: number;
}

/** Sorted ownership bands. Every active request owns exactly one disjoint band. */
class SparseOwnerBands {
  private readonly bands: OwnerBand[] = [];
  private readonly byOwner = new Map<number, OwnerBand>();

  get bandCount(): number {
    return this.bands.length;
  }

  clear(): void {
    this.bands.length = 0;
    this.byOwner.clear();
  }

  atOrAfter(row: number): OwnerBand | undefined {
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.end <= row) low = middle + 1;
      else high = middle;
    }
    return this.bands[low];
  }

  add(start: number, end: number, owner: number): void {
    if (start >= end || this.byOwner.has(owner)) {
      throw new Error("Datasource request ownership must be a new non-empty band");
    }
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.start < start) low = middle + 1;
      else high = middle;
    }
    const previous = this.bands[low - 1];
    const next = this.bands[low];
    if ((previous && previous.end > start) || (next && next.start < end)) {
      throw new Error("Datasource request ownership bands must not overlap");
    }
    const band = { start, end, owner };
    this.bands.splice(low, 0, band);
    this.byOwner.set(owner, band);
  }

  remove(owner: number): void {
    const band = this.byOwner.get(owner);
    if (!band) return;
    this.byOwner.delete(owner);
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.start < band.start) low = middle + 1;
      else high = middle;
    }
    while (low < this.bands.length && this.bands[low]!.start === band.start) {
      if (this.bands[low] === band) {
        this.bands.splice(low, 1);
        return;
      }
      low += 1;
    }
  }

  forEachGap(start: number, end: number, visit: (start: number, end: number) => void): void {
    if (start >= end) return;
    let cursor = start;
    let band = this.atOrAfter(start);
    while (band && band.start < end) {
      if (band.start > cursor) visit(cursor, Math.min(end, band.start));
      cursor = Math.max(cursor, band.end);
      if (cursor >= end) return;
      band = this.atOrAfter(cursor);
    }
    if (cursor < end) visit(cursor, end);
  }

  unionLength(include: (owner: number) => boolean): number {
    let rows = 0;
    let unionStart = -1;
    let unionEnd = -1;
    for (const band of this.bands) {
      if (!include(band.owner)) continue;
      if (unionStart < 0) {
        unionStart = band.start;
        unionEnd = band.end;
      } else if (band.start <= unionEnd) {
        unionEnd = Math.max(unionEnd, band.end);
      } else {
        rows += unionEnd - unionStart;
        unionStart = band.start;
        unionEnd = band.end;
      }
    }
    return unionStart < 0 ? rows : rows + unionEnd - unionStart;
  }
}

interface VisibleWaitBand extends RowBand {
  readonly startedAt: number;
}

interface VisibleWaitSample {
  readonly duration: number;
  readonly rows: number;
}

/** Sparse timestamped visible-demand bands, split only when timestamps differ. */
class SparseVisibleWaits {
  private readonly bands: VisibleWaitBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  get rowCount(): number {
    let rows = 0;
    for (const band of this.bands) rows += band.end - band.start;
    return rows;
  }

  clear(): void {
    this.bands.length = 0;
  }

  discard(start: number, end: number): void {
    if (start >= end) return;
    let index = 0;
    while (index < this.bands.length && this.bands[index]!.end <= start) index += 1;
    while (index < this.bands.length) {
      const band = this.bands[index]!;
      if (band.start >= end) return;
      if (band.start < start && band.end > end) {
        const right = { start: end, end: band.end, startedAt: band.startedAt };
        band.end = start;
        this.bands.splice(index + 1, 0, right);
        return;
      }
      if (band.start < start) {
        band.end = start;
        index += 1;
        continue;
      }
      if (band.end > end) {
        band.start = end;
        return;
      }
      this.bands.splice(index, 1);
    }
  }

  addMissing(start: number, end: number, startedAt: number): void {
    let cursor = start;
    while (cursor < end) {
      const band = this.atOrAfter(cursor);
      if (band && band.start <= cursor) {
        cursor = Math.min(end, band.end);
        continue;
      }
      const gapEnd = Math.min(end, band?.start ?? end);
      this.insert(cursor, gapEnd, startedAt);
      cursor = gapEnd;
    }
  }

  complete(start: number, end: number, completedAt: number): VisibleWaitSample[] {
    const samples: VisibleWaitSample[] = [];
    if (start >= end) return samples;
    let index = 0;
    while (index < this.bands.length && this.bands[index]!.end <= start) index += 1;
    while (index < this.bands.length) {
      const band = this.bands[index]!;
      if (band.start >= end) break;
      const overlapStart = Math.max(start, band.start);
      const overlapEnd = Math.min(end, band.end);
      samples.push({
        duration: Math.max(0, completedAt - band.startedAt),
        rows: overlapEnd - overlapStart,
      });
      if (band.start < overlapStart && band.end > overlapEnd) {
        const right = { start: overlapEnd, end: band.end, startedAt: band.startedAt };
        band.end = overlapStart;
        this.bands.splice(index + 1, 0, right);
        break;
      }
      if (band.start < overlapStart) {
        band.end = overlapStart;
        index += 1;
        continue;
      }
      if (band.end > overlapEnd) {
        band.start = overlapEnd;
        break;
      }
      this.bands.splice(index, 1);
    }
    return samples;
  }

  private atOrAfter(row: number): VisibleWaitBand | undefined {
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.end <= row) low = middle + 1;
      else high = middle;
    }
    return this.bands[low];
  }

  private insert(start: number, end: number, startedAt: number): void {
    if (start >= end) return;
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.start < start) low = middle + 1;
      else high = middle;
    }
    const previous = this.bands[low - 1];
    const next = this.bands[low];
    if (previous?.end === start && previous.startedAt === startedAt) {
      previous.end = end;
      if (next?.start === end && next.startedAt === startedAt) {
        previous.end = next.end;
        this.bands.splice(low, 1);
      }
      return;
    }
    if (next?.start === end && next.startedAt === startedAt) {
      next.start = start;
      return;
    }
    this.bands.splice(low, 0, { start, end, startedAt });
  }
}

function normalizeRowCount(rowCount: number): number {
  if (!Number.isFinite(rowCount) || rowCount > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Datasource row count must be finite and safely representable");
  }
  return Math.max(0, Math.floor(rowCount));
}

/** Owns datasource request bands, priority, cancellation, generations, and loaded-row state. */
export class DatasourceController {
  private readonly loaded = new SparseRowSet();
  private readonly owners = new SparseOwnerBands();
  private readonly visibleWaitStarted = new SparseVisibleWaits();
  private readonly activeIds = new Map<number, ActiveRequest>();
  private readonly requests = new Set<ActiveRequest>();
  private readonly durableDemand = new SparseRowSet();
  private viewportDemand: PendingDemand | null = null;
  private speculativeDemand: PendingDemand[] = [];
  private drainingDemand = false;
  private rowCount: number;
  private nextRequestId = 1;
  private generation = 0;
  private destroyed = false;
  private direction: -1 | 0 | 1 = 0;
  private velocityRowsPerMs = 0;
  private telemetry = emptyTelemetry();
  private lastViewport: { start: number; end: number; at: number } | null = null;
  private readonly visibleWaitDurations: VisibleWaitSample[] = [];
  private visibleWaitSampleCursor = 0;

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.rowCount = normalizeRowCount(rowCount);
  }

  /** Requests a demand-critical interval without applying speculative policy. */
  ensureLoaded(start: number, end: number): void {
    if (!this.options.datasource || !this.options.loadable || this.destroyed) return;
    const demandStart = Math.min(this.rowCount, Math.max(0, Math.floor(start)));
    const demandEnd = Math.min(this.rowCount, Math.max(demandStart, Math.ceil(end)));
    if (demandStart === demandEnd) return;
    this.durableDemand.add(demandStart, demandEnd);
    this.drainDemand();
  }

  /**
   * Records the zero-overscan viewport, starts visible work first, then keeps a
   * bounded aligned look-ahead and a smaller reversal band warm.
   */
  updateViewport(start: number, end: number): void {
    if (this.destroyed) return;
    const visibleStart = Math.min(this.rowCount, Math.max(0, Math.floor(start)));
    const visibleEnd = Math.min(this.rowCount, Math.max(visibleStart, Math.ceil(end)));
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
    this.owners.forEachGap(0, this.rowCount, (gapStart, gapEnd) => {
      this.visibleWaitStarted.discard(gapStart, Math.min(gapEnd, visibleStart));
      this.visibleWaitStarted.discard(Math.max(gapStart, visibleEnd), gapEnd);
    });
    const fullyResident = this.loaded.covers(visibleStart, visibleEnd);
    if (!fullyResident) {
      this.loaded.forEachGap(visibleStart, visibleEnd, (gapStart, gapEnd) => {
        this.visibleWaitStarted.addMissing(gapStart, gapEnd, now);
      });
    }
    this.telemetry.measuredFrames += 1;
    if (fullyResident) this.telemetry.residentFrames += 1;

    if (this.options.datasource && this.options.loadable) {
      this.viewportDemand = {
        start: visibleStart,
        end: visibleEnd,
        priority: "visible",
        direction: 0,
        viewportOrigin: true,
      };
      this.setSpeculativeDemand(speculative, visibleRows, effectiveDirection);
      this.drainDemand();
    } else {
      this.viewportDemand = null;
      this.speculativeDemand.length = 0;
    }
  }

  getTelemetry(): DatasourcePrefetchTelemetry {
    const waits = [...this.visibleWaitDurations].sort((a, b) => a.duration - b.duration);
    let visibleWaitSamples = 0;
    for (const wait of waits) visibleWaitSamples += wait.rows;
    const p95Rank = Math.max(1, Math.ceil(visibleWaitSamples * 0.95));
    let p95VisibleWaitMs = 0;
    let rankedRows = 0;
    for (const wait of waits) {
      rankedRows += wait.rows;
      if (rankedRows < p95Rank) continue;
      p95VisibleWaitMs = wait.duration;
      break;
    }
    const loadable = this.options.loadable;
    const sheet = this.options.activeSheet();
    const cache = loadable?.isPaged(sheet) ? loadable.getPagedStats(sheet) : null;
    let activeSpeculativeRequests = 0;
    for (const request of this.requests) {
      if (request.speculativeOrigin) activeSpeculativeRequests += 1;
    }
    const activeSpeculativeRows = this.owners.unionLength(
      (owner) => this.activeIds.get(owner)?.speculativeOrigin === true,
    );
    return {
      direction: this.direction,
      velocityRowsPerMs: this.velocityRowsPerMs,
      measuredFrames: this.telemetry.measuredFrames,
      residentFrames: this.telemetry.residentFrames,
      residencyRatio:
        this.telemetry.measuredFrames === 0
          ? 1
          : this.telemetry.residentFrames / this.telemetry.measuredFrames,
      visibleWaitSamples,
      p95VisibleWaitMs,
      maxVisibleWaitMs: waits.at(-1)?.duration ?? 0,
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
      loadedBands: this.loaded.bandCount,
      ownedBands: this.owners.bandCount,
      visibleWaitingRows: this.visibleWaitStarted.rowCount,
      visibleWaitingBands: this.visibleWaitStarted.bandCount,
      cacheChunks: cache?.chunks ?? 0,
      cacheAllocatedBytes: cache?.allocatedBytes ?? 0,
    };
  }

  /** On-demand, non-overlapping ownership for datasource state and pending work. */
  getResourceOwners(): ResourceOwnerBytes[] {
    const rowStateEntries =
      this.loaded.bandCount + this.owners.bandCount + this.visibleWaitStarted.bandCount;
    const queuedDemandEntries =
      this.durableDemand.bandCount +
      (this.viewportDemand === null ? 0 : 1) +
      this.speculativeDemand.length;
    return [
      {
        owner: "js.datasource.row-state",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: rowStateEntries,
        measurement: "entry-count-only",
      },
      {
        owner: "js.datasource.pending-requests",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: this.requests.size + this.activeIds.size + queuedDemandEntries,
        measurement: "entry-count-only",
      },
      {
        owner: "js.datasource.wait-samples",
        logicalBytes: 0,
        allocatedBytes: 0,
        entries: this.visibleWaitDurations.length,
        measurement: "entry-count-only",
      },
    ];
  }

  resetTelemetry(): void {
    this.telemetry = emptyTelemetry();
    this.visibleWaitDurations.length = 0;
    this.visibleWaitSampleCursor = 0;
    this.visibleWaitStarted.clear();
  }

  private setSpeculativeDemand(
    intervals: readonly RowBand[],
    bandRows: number,
    direction: -1 | 1,
  ): void {
    this.speculativeDemand.length = 0;
    for (const interval of intervals) {
      if (direction > 0) {
        for (let cursor = interval.start; cursor < interval.end; cursor += bandRows) {
          this.speculativeDemand.push({
            start: cursor,
            end: Math.min(interval.end, cursor + bandRows),
            priority: "speculative",
            direction,
            viewportOrigin: false,
          });
        }
        continue;
      }
      for (let cursor = interval.end; cursor > interval.start; cursor -= bandRows) {
        this.speculativeDemand.push({
          start: Math.max(interval.start, cursor - bandRows),
          end: cursor,
          priority: "speculative",
          direction,
          viewportOrigin: false,
        });
      }
    }
  }

  private drainDemand(): void {
    const datasource = this.options.datasource;
    const loadable = this.options.loadable;
    if (!datasource || !loadable || this.destroyed || this.drainingDemand) return;
    this.drainingDemand = true;
    try {
      for (;;) {
        const viewport = this.viewportDemand;
        if (viewport) {
          const remaining = this.dispatchRange(datasource, loadable, viewport);
          if (remaining === null) this.viewportDemand = null;
          else if (remaining > viewport.start)
            this.viewportDemand = { ...viewport, start: remaining };
          else return;
          continue;
        }

        const durable = this.durableDemand.first();
        if (durable) {
          const remaining = this.dispatchRange(datasource, loadable, {
            ...durable,
            priority: "visible",
            direction: 0,
            viewportOrigin: false,
          });
          if (remaining === null) this.durableDemand.remove(durable.start, durable.end);
          else if (remaining > durable.start) this.durableDemand.remove(durable.start, remaining);
          else return;
          continue;
        }

        const speculative = this.speculativeDemand[0];
        if (!speculative) return;
        const availableRows = this.remainingSpeculativeRows();
        if (availableRows === 0) return;
        const dispatchEnd = Math.min(speculative.end, speculative.start + availableRows);
        const remaining = this.dispatchRange(datasource, loadable, {
          ...speculative,
          end: dispatchEnd,
        });
        if (remaining === null) {
          if (dispatchEnd === speculative.end) this.speculativeDemand.shift();
          else speculative.start = dispatchEnd;
        } else if (remaining > speculative.start) {
          speculative.start = remaining;
        } else {
          return;
        }
      }
    } finally {
      this.drainingDemand = false;
    }
  }

  private remainingSpeculativeRows(): number {
    const activeRows = this.owners.unionLength(
      (owner) => this.activeIds.get(owner)?.speculativeOrigin === true,
    );
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
      const aheadEnd = Math.min(this.rowCount, desiredAheadEnd, boundedAheadEnd);
      if (behindStart < behindEnd) intervals.push({ start: behindStart, end: behindEnd });
      if (aheadStart < aheadEnd) intervals.push({ start: aheadStart, end: aheadEnd });
    } else {
      const aheadEnd = Math.min(this.rowCount, Math.ceil(visibleStart / bandRows) * bandRows);
      const behindStart = Math.min(this.rowCount, Math.ceil(visibleEnd / bandRows) * bandRows);
      const behindEnd = Math.min(this.rowCount, behindStart + behindRows);
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

  private dispatchRange(
    datasource: NonNullable<DatasourceControllerOptions["datasource"]>,
    loadable: SheetwriteStore,
    demand: PendingDemand,
  ): number | null {
    this.refreshPagedResidency(loadable, demand.start, demand.end);
    let row = demand.start;
    while (row < demand.end) {
      const loadedBand = this.loaded.atOrAfter(row);
      if (loadedBand && loadedBand.start <= row) {
        row = Math.min(demand.end, loadedBand.end);
        continue;
      }

      const ownerBand = this.owners.atOrAfter(row);
      if (ownerBand && ownerBand.start <= row) {
        const request = this.activeIds.get(ownerBand.owner);
        if (demand.priority === "visible" && !demand.viewportOrigin && request) {
          request.durableDemand = true;
        }
        if (demand.priority === "visible" && request?.priority === "speculative") {
          request.priority = "visible";
          request.direction = 0;
          this.telemetry.promotions += 1;
        }
        row = Math.min(demand.end, ownerBand.end);
        continue;
      }

      if (this.requests.size >= DATASOURCE_MAX_ACTIVE_REQUESTS) {
        let preempted = [...this.requests].find(
          (request) => request.priority === "speculative" && !request.durableDemand,
        );
        if (!preempted && demand.viewportOrigin) {
          preempted = [...this.requests].find(
            (request) =>
              request.durableDemand &&
              !intersects(request.start, request.end, demand.start, demand.end),
          );
          if (preempted) this.durableDemand.add(preempted.start, preempted.end);
        }
        if (preempted && demand.priority === "visible") {
          this.abortRequest(preempted, "obsolete");
          continue;
        }
        return row;
      }

      const requestEnd = Math.min(
        demand.end,
        loadedBand?.start ?? demand.end,
        ownerBand?.start ?? demand.end,
      );
      this.requestBand(
        datasource,
        loadable,
        row,
        requestEnd,
        demand.priority,
        demand.direction,
        demand.viewportOrigin,
      );
      row = requestEnd;
    }
    return null;
  }

  private requeueShortPage(request: ActiveRequest, loadedEnd: number): void {
    if (loadedEnd >= request.end) return;
    if (request.durableDemand) {
      this.durableDemand.add(loadedEnd, request.end);
      return;
    }
    if (request.priority === "speculative") {
      this.speculativeDemand.unshift({
        start: loadedEnd,
        end: request.end,
        priority: "speculative",
        direction: request.direction,
        viewportOrigin: false,
      });
      return;
    }
    const viewport = this.lastViewport;
    if (!viewport) return;
    const start = Math.max(loadedEnd, viewport.start);
    const end = Math.min(request.end, viewport.end);
    if (start >= end) return;
    const pending = this.viewportDemand;
    this.viewportDemand = {
      start: Math.min(start, pending?.start ?? start),
      end: Math.max(end, pending?.end ?? end),
      priority: "visible",
      direction: 0,
      viewportOrigin: true,
    };
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
    const rangeStart = Math.min(this.rowCount, Math.max(0, Math.floor(start)));
    const rangeEnd = Math.min(this.rowCount, Math.max(rangeStart, Math.ceil(end)));
    if (columnCount === 0 || rangeStart === rangeEnd) return;
    if (
      loadable.isRangeFullyLoaded({
        sheet,
        start: { row: rangeStart, col: 0 },
        end: { row: rangeEnd - 1, col: columnCount - 1 },
      })
    ) {
      this.loaded.add(rangeStart, rangeEnd);
      return;
    }

    this.owners.forEachGap(rangeStart, rangeEnd, (gapStart, gapEnd) => {
      for (const band of this.loaded.intersections(gapStart, gapEnd)) {
        this.reconcileLoadedResidency(loadable, sheet, columnCount, band.start, band.end);
      }
    });
  }

  /**
   * Refines only rows already tracked as loaded. A wholly missing billion-row
   * jump therefore costs one range probe rather than a billion cell probes.
   */
  private reconcileLoadedResidency(
    loadable: SheetwriteStore,
    sheet: SheetId,
    columnCount: number,
    start: number,
    end: number,
  ): void {
    if (
      loadable.isRangeFullyLoaded({
        sheet,
        start: { row: start, col: 0 },
        end: { row: end - 1, col: columnCount - 1 },
      })
    ) {
      return;
    }
    if (end - start === 1) {
      this.loaded.remove(start, end);
      return;
    }
    const middle = start + Math.floor((end - start) / 2);
    this.reconcileLoadedResidency(loadable, sheet, columnCount, start, middle);
    this.reconcileLoadedResidency(loadable, sheet, columnCount, middle, end);
  }

  resize(rowCount: number): void {
    const normalized = normalizeRowCount(rowCount);
    if (this.rowCount !== normalized) this.reset(normalized);
  }

  reset(rowCount: number): void {
    const normalized = normalizeRowCount(rowCount);
    this.generation += 1;
    this.durableDemand.clear();
    this.viewportDemand = null;
    this.speculativeDemand.length = 0;
    for (const request of [...this.requests]) this.abortRequest(request, "reset");
    this.rowCount = normalized;
    this.loaded.clear();
    this.owners.clear();
    this.visibleWaitStarted.clear();
    this.lastViewport = null;
    this.direction = 0;
    this.velocityRowsPerMs = 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.durableDemand.clear();
    this.viewportDemand = null;
    this.speculativeDemand.length = 0;
    for (const request of [...this.requests]) this.abortRequest(request, "destroy");
    this.loaded.clear();
    this.owners.clear();
    this.visibleWaitStarted.clear();
    this.visibleWaitDurations.length = 0;
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
      if (request.viewportOrigin) {
        const requestRows = request.end - request.start;
        const currentRows = visibleEnd - visibleStart;
        const oversized =
          requestRows >
          Math.max(DATASOURCE_PREFETCH_MAX_ROWS, currentRows * DATASOURCE_PREFETCH_MAX_BANDS);
        if (!intersects(request.start, request.end, visibleStart, visibleEnd) || oversized) {
          this.abortRequest(request, reason);
        }
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
    this.owners.add(requestStart, requestEnd, id);

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
        const loadedEnd = page.start + rows.length;
        const ownerBand = this.owners.atOrAfter(page.start);
        if (ownerBand?.owner === id && ownerBand.start <= page.start) {
          this.loaded.add(page.start, loadedEnd);
        }
        for (const sample of this.visibleWaitStarted.complete(page.start, loadedEnd, loadedAt)) {
          if (this.visibleWaitDurations.length < DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT) {
            this.visibleWaitDurations.push(sample);
          } else {
            this.visibleWaitDurations[this.visibleWaitSampleCursor] = sample;
            this.visibleWaitSampleCursor =
              (this.visibleWaitSampleCursor + 1) % DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT;
          }
        }
        if (rows.length > 0) this.requeueShortPage(activeRequest, loadedEnd);
        this.clearOwned(activeRequest);
        this.options.onRowsLoaded();
      })
      .catch((error: unknown) => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.clearOwned(activeRequest);
        this.options.onError({ sheet, start: requestStart, end: requestEnd, revision }, error);
      })
      .finally(() => {
        this.finishRequest(activeRequest);
        if (!this.destroyed && generation === this.generation) this.drainDemand();
      });
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
    this.owners.remove(request.id);
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
