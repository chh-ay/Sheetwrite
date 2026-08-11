import type { SheetwriteStore } from "./store.js";
import type { CellAddress, SheetId } from "./types/coordinates.js";
import type {
  DataSource,
  DataSourceColumnBand,
  DataSourcePage,
  DataSourceRequest,
} from "./types/data.js";
import type { ResourceOwnerBytes } from "./types/store.js";

/** Stable internal policy bounds. Prefetch never exceeds either horizon. */
export const DATASOURCE_PREFETCH_MAX_ROWS = 512;
export const DATASOURCE_PREFETCH_MAX_BYTES = 512 * 1024;
const DATASOURCE_PREFETCH_MAX_BANDS = 2;
export const DATASOURCE_MAX_ACTIVE_REQUESTS = 6;
export const DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT = 4_096;
const DATASOURCE_NO_PROGRESS_RETRIES = 1;
const ESTIMATED_CELL_BYTES = 16;
const LOGICAL_FRAME_MS = 16.7;

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

type ColumnSchema = readonly { readonly key: string }[];

export interface DatasourceControllerOptions {
  datasource?: DataSource;
  loadable: SheetwriteStore | null;
  activeSheet: () => SheetId;
  rowCount: (sheet: SheetId) => number;
  /** Returns the current physical column schema in stable workbook order. */
  columns: (sheet: SheetId) => ColumnSchema;
  revision: () => number;
  isCellNewerThan: (address: CellAddress, revision: number) => boolean;
  retainRevision: (revision: number) => () => void;
  onRowsLoaded: () => void;
  onError: (request: Omit<DataSourceRequest, "signal">, error: unknown) => void;
  /** Monotonic clock injection for deterministic residency traces. */
  now?: () => number;
}

interface RowBand {
  start: number;
  end: number;
}

/** Sorted, disjoint half-open intervals. */
class SparseIntervals {
  private readonly bands: RowBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  get length(): number {
    let length = 0;
    for (const band of this.bands) length += band.end - band.start;
    return length;
  }

  first(): RowBand | undefined {
    return this.bands[0];
  }

  clear(): void {
    this.bands.length = 0;
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

  covers(start: number, end: number): boolean {
    if (start >= end) return true;
    const band = this.atOrAfter(start);
    return band !== undefined && band.start <= start && band.end >= end;
  }

  intersects(start: number, end: number): boolean {
    const band = this.atOrAfter(start);
    return band !== undefined && band.start < end;
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

  add(start: number, end: number): void {
    if (start >= end) return;
    let index = 0;
    while (index < this.bands.length && this.bands[index]!.end < start) index += 1;
    let nextStart = start;
    let nextEnd = end;
    const first = index;
    while (index < this.bands.length && this.bands[index]!.start <= nextEnd) {
      const band = this.bands[index]!;
      nextStart = Math.min(nextStart, band.start);
      nextEnd = Math.max(nextEnd, band.end);
      index += 1;
    }
    this.bands.splice(first, index - first, { start: nextStart, end: nextEnd });
  }

  remove(start: number, end: number): void {
    if (start >= end) return;
    const next: RowBand[] = [];
    for (const band of this.bands) {
      if (band.end <= start || band.start >= end) {
        next.push(band);
        continue;
      }
      if (band.start < start) next.push({ start: band.start, end: start });
      if (band.end > end) next.push({ start: end, end: band.end });
    }
    this.bands.splice(0, this.bands.length, ...next);
  }

  forEachGap(start: number, end: number, visit: (start: number, end: number) => void): void {
    let cursor = start;
    let band = this.atOrAfter(start);
    while (cursor < end) {
      if (!band || band.start >= end) {
        visit(cursor, end);
        return;
      }
      if (band.start > cursor) visit(cursor, Math.min(end, band.start));
      cursor = Math.max(cursor, band.end);
      band = this.atOrAfter(cursor);
    }
  }
}

/** Per-physical-column row coverage; empty column metadata is removed eagerly. */
class SparseColumnIntervals {
  private readonly columns = new Map<number, SparseIntervals>();

  get bandCount(): number {
    let count = 0;
    for (const rows of this.columns.values()) count += rows.bandCount;
    return count;
  }

  get columnCount(): number {
    return this.columns.size;
  }

  clear(): void {
    this.columns.clear();
  }

  rows(column: number): SparseIntervals | undefined {
    return this.columns.get(column);
  }

  add(columns: readonly number[], start: number, end: number): void {
    if (start >= end) return;
    for (const column of columns) {
      let rows = this.columns.get(column);
      if (!rows) {
        rows = new SparseIntervals();
        this.columns.set(column, rows);
      }
      rows.add(start, end);
    }
  }

  remove(columns: readonly number[], start: number, end: number): void {
    for (const column of columns) this.removeColumn(column, start, end);
  }

  removeColumn(column: number, start: number, end: number): void {
    const rows = this.columns.get(column);
    if (!rows) return;
    rows.remove(start, end);
    if (rows.bandCount === 0) this.columns.delete(column);
  }

  covers(start: number, end: number, columns: readonly number[]): boolean {
    for (const column of columns) {
      if (!this.columns.get(column)?.covers(start, end)) return false;
    }
    return true;
  }

  firstRectangle(): { start: number; end: number; columns: number[] } | null {
    const firstColumn = [...this.columns.keys()].sort((a, b) => a - b)[0];
    if (firstColumn === undefined) return null;
    const band = this.columns.get(firstColumn)!.first();
    if (!band) return null;
    const columns: number[] = [];
    for (const [column, rows] of this.columns) {
      if (rows.covers(band.start, band.end)) columns.push(column);
    }
    columns.sort((a, b) => a - b);
    return { start: band.start, end: band.end, columns };
  }
}

interface OwnerBand extends RowBand {
  owner: number;
}

class SparseOwnerIntervals {
  private readonly bands: OwnerBand[] = [];

  get bandCount(): number {
    return this.bands.length;
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

  intersects(start: number, end: number): boolean {
    const band = this.atOrAfter(start);
    return band !== undefined && band.start < end;
  }

  forEachGap(start: number, end: number, visit: (start: number, end: number) => void): void {
    let cursor = start;
    let band = this.atOrAfter(start);
    while (cursor < end) {
      if (!band || band.start >= end) {
        visit(cursor, end);
        return;
      }
      if (band.start > cursor) visit(cursor, Math.min(end, band.start));
      cursor = Math.max(cursor, band.end);
      band = this.atOrAfter(cursor);
    }
  }

  add(start: number, end: number, owner: number): void {
    if (start >= end) return;
    const index = this.bands.findIndex((band) => band.start >= start);
    const insertAt = index < 0 ? this.bands.length : index;
    const previous = this.bands[insertAt - 1];
    const next = this.bands[insertAt];
    if ((previous && previous.end > start) || (next && next.start < end)) {
      throw new Error("Overlapping datasource request ownership");
    }
    this.bands.splice(insertAt, 0, { start, end, owner });
  }

  removeOwner(owner: number): void {
    for (let index = this.bands.length - 1; index >= 0; index -= 1) {
      if (this.bands[index]!.owner === owner) this.bands.splice(index, 1);
    }
  }
}

/** Sparse request ownership indexed only by columns with active work. */
class SparseColumnOwners {
  private readonly columns = new Map<number, SparseOwnerIntervals>();

  get bandCount(): number {
    let count = 0;
    for (const rows of this.columns.values()) count += rows.bandCount;
    return count;
  }

  get columnCount(): number {
    return this.columns.size;
  }

  clear(): void {
    this.columns.clear();
  }

  rows(column: number): SparseOwnerIntervals | undefined {
    return this.columns.get(column);
  }

  add(columns: readonly number[], start: number, end: number, owner: number): void {
    for (const column of columns) {
      let rows = this.columns.get(column);
      if (!rows) {
        rows = new SparseOwnerIntervals();
        this.columns.set(column, rows);
      }
      rows.add(start, end, owner);
    }
  }

  remove(owner: number, columns: readonly number[]): void {
    for (const column of columns) {
      const rows = this.columns.get(column);
      if (!rows) continue;
      rows.removeOwner(owner);
      if (rows.bandCount === 0) this.columns.delete(column);
    }
  }
}

interface VisibleWaitBand extends RowBand {
  startedAt: number;
}

interface VisibleWaitSample {
  duration: number;
  rows: number;
}

class SparseVisibleWaits {
  private readonly bands: VisibleWaitBand[] = [];

  get bandCount(): number {
    return this.bands.length;
  }

  get rowCount(): number {
    let count = 0;
    for (const band of this.bands) count += band.end - band.start;
    return count;
  }

  appendCoverage(target: SparseIntervals): void {
    for (const band of this.bands) target.add(band.start, band.end);
  }

  atOrAfter(row: number): VisibleWaitBand | undefined {
    let low = 0;
    let high = this.bands.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bands[middle]!.end <= row) low = middle + 1;
      else high = middle;
    }
    return this.bands[low];
  }

  addMissing(start: number, end: number, startedAt: number): void {
    if (start >= end) return;
    let cursor = start;
    let band = this.atOrAfter(start);
    while (cursor < end) {
      if (!band || band.start >= end) {
        this.insert(cursor, end, startedAt);
        return;
      }
      if (band.start > cursor) this.insert(cursor, Math.min(end, band.start), startedAt);
      cursor = Math.max(cursor, band.end);
      band = this.atOrAfter(cursor);
    }
  }

  discard(start: number, end: number): void {
    if (start >= end) return;
    const next: VisibleWaitBand[] = [];
    for (const band of this.bands) {
      if (band.end <= start || band.start >= end) {
        next.push(band);
        continue;
      }
      if (band.start < start) next.push({ ...band, end: start });
      if (band.end > end) next.push({ ...band, start: end });
    }
    this.bands.splice(0, this.bands.length, ...next);
  }

  complete(start: number, end: number, completedAt: number): VisibleWaitSample[] {
    const samples: VisibleWaitSample[] = [];
    for (const band of this.bands) {
      const overlapStart = Math.max(start, band.start);
      const overlapEnd = Math.min(end, band.end);
      if (overlapStart < overlapEnd) {
        samples.push({
          duration: Math.max(0, completedAt - band.startedAt),
          rows: overlapEnd - overlapStart,
        });
      }
    }
    this.discard(start, end);
    return samples;
  }

  private insert(start: number, end: number, startedAt: number): void {
    let index = 0;
    while (index < this.bands.length && this.bands[index]!.start < start) index += 1;
    this.bands.splice(index, 0, { start, end, startedAt });
  }
}

class SparseColumnVisibleWaits {
  private readonly columns = new Map<number, SparseVisibleWaits>();

  get bandCount(): number {
    let count = 0;
    for (const waits of this.columns.values()) count += waits.bandCount;
    return count;
  }
  get columnCount(): number {
    return this.columns.size;
  }

  get rowCount(): number {
    let count = 0;
    for (const waits of this.columns.values()) count += waits.rowCount;
    return count;
  }

  rowUnion(): SparseIntervals {
    const union = new SparseIntervals();
    for (const waits of this.columns.values()) waits.appendCoverage(union);
    return union;
  }

  clear(): void {
    this.columns.clear();
  }

  retain(columns: readonly number[], start: number, end: number, owners: SparseColumnOwners): void {
    const retained = new Set(columns);
    for (const [column, waits] of this.columns) {
      if (!retained.has(column)) {
        this.columns.delete(column);
        continue;
      }
      const owned = owners.rows(column);
      if (owned) {
        owned.forEachGap(0, start, (gapStart, gapEnd) => waits.discard(gapStart, gapEnd));
        owned.forEachGap(end, Number.MAX_SAFE_INTEGER, (gapStart, gapEnd) =>
          waits.discard(gapStart, gapEnd),
        );
      } else {
        waits.discard(0, start);
        waits.discard(end, Number.MAX_SAFE_INTEGER);
      }
      if (waits.bandCount === 0) this.columns.delete(column);
    }
  }

  addMissing(column: number, start: number, end: number, startedAt: number): void {
    if (start >= end) return;
    let waits = this.columns.get(column);
    if (!waits) {
      waits = new SparseVisibleWaits();
      this.columns.set(column, waits);
    }
    waits.addMissing(start, end, startedAt);
  }

  discard(columns: readonly number[], start: number, end: number): void {
    for (const column of columns) {
      const waits = this.columns.get(column);
      if (!waits) continue;
      waits.discard(start, end);
      if (waits.bandCount === 0) this.columns.delete(column);
    }
  }
  complete(
    columns: readonly number[],
    start: number,
    end: number,
    completedAt: number,
  ): VisibleWaitSample[] {
    const samples: VisibleWaitSample[] = [];
    for (const column of columns) {
      const waits = this.columns.get(column);
      if (!waits) continue;
      samples.push(...waits.complete(start, end, completedAt));
      if (waits.bandCount === 0) this.columns.delete(column);
    }
    return samples;
  }
}

interface SchemaSnapshot {
  readonly sheet: SheetId;
  readonly keys: readonly string[];
  readonly singletonIndices: Map<number, readonly number[]>;
  allIndices?: readonly number[];
  allBands?: readonly DataSourceColumnBand[];
}

interface PendingDemand extends RowBand {
  readonly columns: readonly number[];
  readonly priority: RequestPriority;
  readonly direction: -1 | 0 | 1;
  readonly viewportOrigin: boolean;
  readonly durableOrigin: boolean;
  readonly attempt: number;
}

interface ActiveRequest extends RowBand {
  readonly id: number;
  readonly sheet: SheetId;
  readonly columns: readonly number[];
  readonly bands: readonly DataSourceColumnBand[];
  readonly schema: SchemaSnapshot;
  readonly revision: number;
  readonly controller: AbortController;
  readonly releaseRevision: () => void;
  readonly speculativeOrigin: boolean;
  readonly viewportOrigin: boolean;
  durableDemand: boolean;
  priority: RequestPriority;
  direction: -1 | 0 | 1;
  readonly attempt: number;
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
  /** Per-column interval count, independent of logical sheet area. */
  readonly loadedBands: number;
  /** Per-column request-ownership interval count. */
  readonly ownedBands: number;
  /** Union of waiting row spans across requested physical columns. */
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

function normalizeRowCount(rowCount: number): number {
  if (!Number.isFinite(rowCount) || !Number.isSafeInteger(rowCount)) {
    throw new RangeError("Datasource row count must be a finite safe integer");
  }
  return Math.max(0, rowCount);
}

function normalizeBounds(start: number, end: number, rowCount: number): RowBand {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    Math.abs(start) > Number.MAX_SAFE_INTEGER ||
    Math.abs(end) > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("Datasource row bounds must be finite and safely representable");
  }
  const normalizedStart = Math.min(rowCount, Math.max(0, Math.floor(start)));
  const normalizedEnd = Math.min(rowCount, Math.max(normalizedStart, Math.ceil(end)));
  return { start: normalizedStart, end: normalizedEnd };
}

function rowsIntersect(a: RowBand, b: RowBand): boolean {
  return a.start < b.end && b.start < a.end;
}

function columnsIntersect(a: readonly number[], b: readonly number[]): boolean {
  let left = 0;
  let right = 0;
  while (left < a.length && right < b.length) {
    const leftColumn = a[left]!;
    const rightColumn = b[right]!;
    if (leftColumn === rightColumn) return true;
    if (leftColumn < rightColumn) left += 1;
    else right += 1;
  }
  return false;
}

function columnsSubset(columns: readonly number[], superset: readonly number[]): boolean {
  let candidate = 0;
  let available = 0;
  while (candidate < columns.length && available < superset.length) {
    if (columns[candidate] === superset[available]) {
      candidate += 1;
      available += 1;
    } else if (columns[candidate]! > superset[available]!) {
      available += 1;
    } else {
      return false;
    }
  }
  return candidate === columns.length;
}

function requestWithoutSignal(request: ActiveRequest): Omit<DataSourceRequest, "signal"> {
  return {
    protocol: 2,
    sheet: request.sheet,
    start: request.start,
    end: request.end,
    columns: request.bands,
    revision: request.revision,
  };
}

/** Owns sparse two-dimensional datasource demand, request priority, and cancellation. */
export class DatasourceController {
  private readonly loaded = new SparseColumnIntervals();
  private readonly owners = new SparseColumnOwners();
  private readonly visibleWaitStarted = new SparseColumnVisibleWaits();
  private readonly activeIds = new Map<number, ActiveRequest>();
  private readonly requests = new Set<ActiveRequest>();
  private readonly durableDemand = new SparseColumnIntervals();
  private viewportDemand: PendingDemand | null = null;
  private speculativeDemand: PendingDemand[] = [];
  private retryDemand: PendingDemand[] = [];
  private drainingDemand = false;
  private rowCount: number;
  private nextRequestId = 1;
  private generation = 0;
  private destroyed = false;
  private direction: -1 | 0 | 1 = 0;
  private velocityRowsPerMs = 0;
  private telemetry = emptyTelemetry();
  private lastViewport: {
    start: number;
    end: number;
    columns: readonly number[];
    at: number;
  } | null = null;
  private readonly visibleWaitDurations: VisibleWaitSample[] = [];
  private visibleWaitSampleCursor = 0;
  private schemaCache: SchemaSnapshot | null = null;
  private lastCanonicalColumns: readonly number[] | null = null;

  constructor(
    private readonly options: DatasourceControllerOptions,
    rowCount: number,
  ) {
    this.rowCount = normalizeRowCount(rowCount);
  }

  /** Requests demand-critical rows for exact canonical physical column indices. */
  ensureLoaded(start: number, end: number, indices: readonly number[]): void {
    if (!this.options.datasource || !this.options.loadable || this.destroyed) return;
    const bounds = normalizeBounds(start, end, this.rowCount);
    if (bounds.start === bounds.end || indices.length === 0) return;
    const columns = this.requestColumns(indices);
    if (columns.length === 0) return;
    this.durableDemand.add(columns, bounds.start, bounds.end);
    this.drainDemand();
  }

  /** Records the viewport, starts visible work, then bounded row-direction speculation. */
  updateViewport(start: number, end: number, indices: readonly number[]): void {
    if (this.destroyed) return;
    const bounds = normalizeBounds(start, end, this.rowCount);
    if (bounds.start === bounds.end || indices.length === 0) {
      this.viewportDemand = null;
      this.speculativeDemand.length = 0;
      this.visibleWaitStarted.clear();
      return;
    }
    const columns = this.requestColumns(indices);
    if (columns.length === 0) return;

    const now = this.now();
    const visibleRows = bounds.end - bounds.start;
    const previous = this.lastViewport;
    const previousRows = previous ? previous.end - previous.start : visibleRows;
    const delta = previous ? bounds.start - previous.start : 0;
    const movementDirection: -1 | 0 | 1 = delta === 0 ? 0 : delta > 0 ? 1 : -1;
    const elapsed = previous ? Math.max(0, now - previous.at) : 0;
    if (elapsed > 0 && movementDirection !== 0) this.velocityRowsPerMs = delta / elapsed;
    const reversal =
      movementDirection !== 0 && this.direction !== 0 && movementDirection !== this.direction;
    const jump = previous !== null && Math.abs(delta) > Math.max(visibleRows, previousRows) * 2;
    if (movementDirection !== 0) this.direction = movementDirection;
    const effectiveDirection: -1 | 1 = this.direction === 0 ? 1 : this.direction;

    const speculative = this.speculativeIntervals(
      bounds.start,
      bounds.end,
      effectiveDirection,
      visibleRows,
      columns.length,
    );
    this.lastViewport = { ...bounds, columns, at: now };
    this.cancelObsoleteSpeculation(
      { ...bounds, columns },
      speculative,
      jump ? "jump" : reversal ? "reversal" : "obsolete",
      reversal || jump,
    );

    this.refreshPagedResidency(this.options.loadable, bounds.start, bounds.end, columns);
    this.visibleWaitStarted.retain(columns, bounds.start, bounds.end, this.owners);
    for (const column of columns) {
      const resident = this.loaded.rows(column);
      if (!resident) {
        this.visibleWaitStarted.addMissing(column, bounds.start, bounds.end, now);
      } else {
        resident.forEachGap(bounds.start, bounds.end, (gapStart, gapEnd) => {
          this.visibleWaitStarted.addMissing(column, gapStart, gapEnd, now);
        });
      }
    }
    const fullyResident = this.loaded.covers(bounds.start, bounds.end, columns);
    this.telemetry.measuredFrames += 1;
    if (fullyResident) this.telemetry.residentFrames += 1;

    if (this.options.datasource && this.options.loadable) {
      this.viewportDemand = {
        ...bounds,
        columns,
        priority: "visible",
        direction: 0,
        viewportOrigin: true,
        durableOrigin: false,
        attempt: 0,
      };
      this.setSpeculativeDemand(speculative, visibleRows, effectiveDirection, columns);
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

    const speculativeRows = new SparseIntervals();
    let activeSpeculativeRequests = 0;
    for (const request of this.requests) {
      if (!request.speculativeOrigin) continue;
      activeSpeculativeRequests += 1;
      speculativeRows.add(request.start, request.end);
    }
    const loadable = this.options.loadable;
    const sheet = this.options.activeSheet();
    const cache = loadable?.isPaged(sheet) ? loadable.getPagedStats(sheet) : null;
    const visibleWaiting = this.visibleWaitStarted.rowUnion();

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
      activeSpeculativeRows: speculativeRows.length,
      loadedBands: this.loaded.bandCount,
      ownedBands: this.owners.bandCount,
      visibleWaitingRows: visibleWaiting.length,
      visibleWaitingBands: visibleWaiting.bandCount,
      cacheChunks: cache?.chunks ?? 0,
      cacheAllocatedBytes: cache?.allocatedBytes ?? 0,
    };
  }

  getResourceOwners(): ResourceOwnerBytes[] {
    const queuedDemandEntries =
      this.durableDemand.bandCount +
      (this.viewportDemand?.columns.length ?? 0) +
      this.speculativeDemand.reduce((sum, demand) => sum + demand.columns.length, 0) +
      this.retryDemand.reduce((sum, demand) => sum + demand.columns.length, 0);
    const tileEntries =
      this.loaded.bandCount + this.owners.bandCount + this.visibleWaitStarted.bandCount;
    const tileColumns =
      this.loaded.columnCount + this.owners.columnCount + this.visibleWaitStarted.columnCount;
    const tileBytes = tileEntries * 32 + tileColumns * 48;
    let pendingRequestBytes = 0;
    for (const request of this.requests) {
      pendingRequestBytes +=
        192 +
        request.columns.length * 8 +
        request.bands.reduce((bytes, band) => bytes + 32 + band.keys.length * 8, 0);
    }
    const requestIndexBytes = this.activeIds.size * 48;
    const queuedDemandBytes = queuedDemandEntries * 40;
    const waitSampleBytes = this.visibleWaitDurations.length * 16;
    const schemaBytes =
      this.schemaCache?.keys.reduce((bytes, key) => bytes + 16 + key.length * 2, 0) ?? 0;
    const schemaIndexBytes =
      schemaBytes +
      (this.schemaCache?.keys.length ?? 0) * 8 +
      (this.schemaCache?.allIndices?.length ?? 0) * 8 +
      (this.schemaCache?.singletonIndices.size ?? 0) * 16;
    return [
      {
        owner: "js.datasource.tile-state",
        logicalBytes: tileBytes,
        allocatedBytes: tileBytes,
        entries: tileEntries,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.pending-requests",
        logicalBytes: pendingRequestBytes,
        allocatedBytes: pendingRequestBytes,
        entries: this.requests.size,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.request-index",
        logicalBytes: requestIndexBytes,
        allocatedBytes: requestIndexBytes,
        entries: this.activeIds.size,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.queued-demand",
        logicalBytes: queuedDemandBytes,
        allocatedBytes: queuedDemandBytes,
        entries: queuedDemandEntries,
        measurement: "hash-capacity-v1",
      },
      {
        owner: "js.datasource.wait-samples",
        logicalBytes: waitSampleBytes,
        allocatedBytes: waitSampleBytes,
        entries: this.visibleWaitDurations.length,
        measurement: "exact-capacity",
      },
      {
        owner: "js.datasource.schema-index",
        logicalBytes: schemaIndexBytes,
        allocatedBytes: schemaIndexBytes,
        entries: this.schemaCache?.keys.length ?? 0,
        measurement: "utf16-upper-bound",
      },
    ];
  }

  resetTelemetry(): void {
    this.telemetry = emptyTelemetry();
    this.visibleWaitDurations.length = 0;
    this.visibleWaitSampleCursor = 0;
    this.visibleWaitStarted.clear();
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
    this.retryDemand.length = 0;
    for (const request of [...this.requests]) this.abortRequest(request, "reset");
    this.rowCount = normalized;
    this.loaded.clear();
    this.owners.clear();
    this.visibleWaitStarted.clear();
    this.lastViewport = null;
    this.schemaCache = null;
    this.lastCanonicalColumns = null;
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
    this.retryDemand.length = 0;
    for (const request of [...this.requests]) this.abortRequest(request, "destroy");
    this.loaded.clear();
    this.owners.clear();
    this.visibleWaitStarted.clear();
    this.visibleWaitDurations.length = 0;
    this.lastViewport = null;
    this.schemaCache = null;
    this.lastCanonicalColumns = null;
  }

  private schema(): SchemaSnapshot {
    const sheet = this.options.activeSheet();
    const source = this.options.columns(sheet);
    const cached = this.schemaCache;
    if (cached?.sheet === sheet && cached.keys.length === source.length) {
      let equal = true;
      for (let index = 0; index < source.length; index += 1) {
        if (source[index]?.key !== cached.keys[index]) {
          equal = false;
          break;
        }
      }
      if (equal) return cached;
    }

    const keys: string[] = [];
    const unique = new Set<string>();
    for (const column of source) {
      const key = column?.key;
      if (typeof key !== "string" || key.length === 0 || unique.has(key)) {
        throw new RangeError("Datasource schema keys must be non-empty and unique");
      }
      unique.add(key);
      keys.push(key);
    }
    const snapshot: SchemaSnapshot = {
      sheet,
      keys: Object.freeze(keys),
      singletonIndices: new Map(),
    };
    this.schemaCache = snapshot;
    this.lastCanonicalColumns = null;
    return snapshot;
  }

  private requestColumns(indices: readonly number[]): readonly number[] {
    const schema = this.schema();
    const normalized = [...indices].sort((a, b) => a - b);
    let write = 0;
    for (const column of normalized) {
      if (!Number.isSafeInteger(column) || column < 0 || column >= schema.keys.length) {
        throw new RangeError("Datasource column indices must reference the current schema");
      }
      if (write === 0 || normalized[write - 1] !== column) normalized[write++] = column;
    }
    normalized.length = write;
    if (normalized.length === 0) return normalized;

    const datasource = this.options.datasource;
    if (datasource) {
      if (datasource.capabilities?.protocol !== 2) {
        throw new RangeError("Datasource must declare protocol 2 capabilities");
      }
      if (datasource.capabilities.columns === "full-width") {
        // Full-width compatibility shares this engine but is horizontally non-scalable.
        if (!schema.allIndices) {
          schema.allIndices = Object.freeze(
            Array.from({ length: schema.keys.length }, (_, index) => index),
          );
        }
        return schema.allIndices;
      }
      if (datasource.capabilities.columns !== "windowed") {
        throw new RangeError("Datasource column capability must be windowed or full-width");
      }
    }

    const previous = this.lastCanonicalColumns;
    if (
      previous?.length === normalized.length &&
      previous.every((column, index) => column === normalized[index])
    ) {
      return previous;
    }
    const stable = Object.freeze(normalized);
    this.lastCanonicalColumns = stable;
    return stable;
  }

  private canonicalBands(
    columns: readonly number[],
    schema: SchemaSnapshot,
  ): readonly DataSourceColumnBand[] {
    if (
      columns.length === schema.keys.length &&
      columns.every((column, index) => column === index)
    ) {
      if (!schema.allBands) schema.allBands = this.buildBands(columns, schema);
      return schema.allBands;
    }
    return this.buildBands(columns, schema);
  }

  private buildBands(
    columns: readonly number[],
    schema: SchemaSnapshot,
  ): readonly DataSourceColumnBand[] {
    const bands: DataSourceColumnBand[] = [];
    let cursor = 0;
    while (cursor < columns.length) {
      const start = columns[cursor]!;
      let end = start + 1;
      cursor += 1;
      while (cursor < columns.length && columns[cursor] === end) {
        end += 1;
        cursor += 1;
      }
      bands.push(
        Object.freeze({
          start,
          end,
          keys: Object.freeze(schema.keys.slice(start, end)),
        }),
      );
    }
    return Object.freeze(bands);
  }

  private setSpeculativeDemand(
    intervals: readonly RowBand[],
    bandRows: number,
    direction: -1 | 1,
    columns: readonly number[],
  ): void {
    this.speculativeDemand.length = 0;
    for (const interval of intervals) {
      if (direction > 0) {
        for (let cursor = interval.start; cursor < interval.end; cursor += bandRows) {
          this.speculativeDemand.push({
            start: cursor,
            end: Math.min(interval.end, cursor + bandRows),
            columns,
            priority: "speculative",
            direction,
            viewportOrigin: false,
            durableOrigin: false,
            attempt: 0,
          });
        }
      } else {
        for (let cursor = interval.end; cursor > interval.start; cursor -= bandRows) {
          this.speculativeDemand.push({
            start: Math.max(interval.start, cursor - bandRows),
            end: cursor,
            columns,
            priority: "speculative",
            direction,
            viewportOrigin: false,
            durableOrigin: false,
            attempt: 0,
          });
        }
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
        if (this.viewportDemand) {
          if (!this.dispatchRange(datasource, loadable, this.viewportDemand)) return;
          this.viewportDemand = null;
          continue;
        }

        const retry = this.retryDemand[0];
        if (retry) {
          if (!this.dispatchRange(datasource, loadable, retry)) return;
          this.retryDemand.shift();
          continue;
        }

        const durable = this.durableDemand.firstRectangle();
        if (durable) {
          const demand: PendingDemand = {
            ...durable,
            priority: "visible",
            direction: 0,
            viewportOrigin: false,
            durableOrigin: true,
            attempt: 0,
          };
          if (!this.dispatchRange(datasource, loadable, demand)) return;
          this.durableDemand.remove(durable.columns, durable.start, durable.end);
          continue;
        }

        const speculative = this.speculativeDemand[0];
        if (!speculative) return;
        const availableRows = this.remainingSpeculativeRows(speculative.columns.length);
        if (availableRows === 0) return;
        const dispatchEnd = Math.min(speculative.end, speculative.start + availableRows);
        const portion = { ...speculative, end: dispatchEnd };
        if (!this.dispatchRange(datasource, loadable, portion)) return;
        if (dispatchEnd === speculative.end) this.speculativeDemand.shift();
        else speculative.start = dispatchEnd;
      }
    } finally {
      this.drainingDemand = false;
    }
  }

  private dispatchRange(
    datasource: DataSource,
    loadable: SheetwriteStore,
    demand: PendingDemand,
  ): boolean {
    this.refreshPagedResidency(loadable, demand.start, demand.end, demand.columns);
    for (const column of demand.columns) {
      let row = demand.start;
      while (row < demand.end) {
        const loadedBand = this.loaded.rows(column)?.atOrAfter(row);
        if (loadedBand && loadedBand.start <= row) {
          row = Math.min(demand.end, loadedBand.end);
          continue;
        }

        const ownerBand = this.owners.rows(column)?.atOrAfter(row);
        if (ownerBand && ownerBand.start <= row) {
          const request = this.activeIds.get(ownerBand.owner);
          if (request) {
            if (demand.durableOrigin) request.durableDemand = true;
            if (demand.priority === "visible" && request.priority === "speculative") {
              request.priority = "visible";
              request.direction = 0;
              this.telemetry.promotions += 1;
            }
          }
          row = Math.min(demand.end, ownerBand.end);
          continue;
        }

        if (this.requests.size >= DATASOURCE_MAX_ACTIVE_REQUESTS) {
          const preempted = this.preemptionCandidate(demand);
          if (preempted && demand.priority === "visible") {
            this.abortRequest(preempted, "obsolete");
            continue;
          }
          return false;
        }

        const requestEnd = Math.min(
          demand.end,
          loadedBand?.start ?? demand.end,
          ownerBand?.start ?? demand.end,
        );
        const requestColumns = demand.columns.filter((candidate) =>
          this.tileUncovered(candidate, row, requestEnd),
        );
        this.requestBand(
          datasource,
          loadable,
          row,
          requestEnd,
          requestColumns,
          demand.priority,
          demand.direction,
          demand.viewportOrigin,
          demand.durableOrigin,
          demand.attempt,
        );
        row = requestEnd;
      }
    }
    return true;
  }

  private tileUncovered(column: number, start: number, end: number): boolean {
    return (
      !this.loaded.rows(column)?.intersects(start, end) &&
      !this.owners.rows(column)?.intersects(start, end)
    );
  }

  private preemptionCandidate(demand: PendingDemand): ActiveRequest | undefined {
    let candidate = [...this.requests].find(
      (request) => request.priority === "speculative" && !request.durableDemand,
    );
    if (candidate || !demand.viewportOrigin) return candidate;
    candidate = [...this.requests].find(
      (request) =>
        request.durableDemand &&
        (!rowsIntersect(request, demand) || !columnsIntersect(request.columns, demand.columns)),
    );
    if (candidate) this.durableDemand.add(candidate.columns, candidate.start, candidate.end);
    return candidate;
  }

  private requestBand(
    datasource: DataSource,
    loadable: SheetwriteStore,
    start: number,
    end: number,
    columns: readonly number[],
    priority: RequestPriority,
    direction: -1 | 0 | 1,
    viewportOrigin: boolean,
    durableOrigin: boolean,
    attempt: number,
  ): void {
    if (columns.length === 0 || start >= end) return;
    const schema = this.schema();
    const bands = this.canonicalBands(columns, schema);
    const id = this.allocateRequestId();
    this.owners.add(columns, start, end, id);

    const revision = this.options.revision();
    const controller = new AbortController();
    const activeRequest: ActiveRequest = {
      id,
      sheet: schema.sheet,
      start,
      end,
      columns,
      bands,
      schema,
      revision,
      controller,
      releaseRevision: this.options.retainRevision(revision),
      speculativeOrigin: priority === "speculative",
      viewportOrigin,
      durableDemand: durableOrigin,
      priority,
      direction,
      attempt,
      released: false,
    };
    this.activeIds.set(id, activeRequest);
    this.requests.add(activeRequest);

    const requestedRows = end - start;
    this.telemetry.requests += 1;
    this.telemetry.requestedRows += requestedRows;
    this.telemetry.estimatedRequestedBytes += requestedRows * columns.length * ESTIMATED_CELL_BYTES;
    if (priority === "visible") {
      this.telemetry.visibleRequests += 1;
      this.telemetry.visibleRequestedRows += requestedRows;
    } else {
      this.telemetry.speculativeRequests += 1;
      this.telemetry.speculativeRequestedRows += requestedRows;
    }

    const request: DataSourceRequest = {
      protocol: 2,
      sheet: schema.sheet,
      start,
      end,
      columns: bands,
      signal: controller.signal,
      revision,
    };
    const generation = this.generation;
    let pending: Promise<DataSourcePage>;
    try {
      pending = datasource.getRows(request);
    } catch (error) {
      this.clearOwned(activeRequest);
      this.visibleWaitStarted.discard(
        activeRequest.columns,
        activeRequest.start,
        activeRequest.end,
      );
      this.finishRequest(activeRequest);
      queueMicrotask(() => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted) return;
        this.options.onError(requestWithoutSignal(activeRequest), error);
      });
      return;
    }

    Promise.resolve(pending)
      .then((page) => {
        if (!this.canHydrate(activeRequest, generation)) return;
        const responseColumns = this.validatePage(page, activeRequest);
        if (!this.canHydrate(activeRequest, generation)) return;
        const loadedEnd = page.start + page.rows.length;
        const progressed = page.rows.length > 0 && responseColumns.length > 0;
        if (progressed) {
          loadable.loadPage(activeRequest.sheet, page.start, page.columns, page.rows, (address) =>
            this.options.isCellNewerThan(address, revision),
          );
          if (!this.canHydrate(activeRequest, generation)) return;
          this.loaded.add(responseColumns, page.start, loadedEnd);
          this.recordCompletedWaits(responseColumns, page.start, loadedEnd);
          this.options.onRowsLoaded();
        }
        if (!this.loaded.covers(activeRequest.start, activeRequest.end, activeRequest.columns)) {
          if (!progressed && activeRequest.attempt >= DATASOURCE_NO_PROGRESS_RETRIES) {
            throw new RangeError("Datasource page made no coverage progress");
          }
          this.requeuePartial(activeRequest, progressed ? 0 : activeRequest.attempt + 1);
        }
        this.clearOwned(activeRequest);
      })
      .catch((error: unknown) => {
        if (!this.canReport(activeRequest, generation)) return;
        this.clearOwned(activeRequest);
        this.visibleWaitStarted.discard(
          activeRequest.columns,
          activeRequest.start,
          activeRequest.end,
        );
        this.options.onError(requestWithoutSignal(activeRequest), error);
      })
      .finally(() => {
        this.finishRequest(activeRequest);
        if (!this.destroyed && generation === this.generation) this.drainDemand();
      });
  }

  private validatePage(page: DataSourcePage, request: ActiveRequest): readonly number[] {
    if (page?.protocol !== 2 || !Array.isArray(page.rows) || !Array.isArray(page.columns)) {
      throw new RangeError("Datasource page must use protocol 2 arrays");
    }
    if (!Number.isSafeInteger(page.start)) {
      throw new RangeError("Datasource page start must be a safe integer");
    }
    const loadedEnd = page.start + page.rows.length;
    const currentRowCount = normalizeRowCount(this.options.rowCount(request.sheet));
    if (
      !Number.isSafeInteger(loadedEnd) ||
      page.start < request.start ||
      loadedEnd > request.end ||
      loadedEnd > currentRowCount
    ) {
      throw new RangeError("Datasource page rows exceed requested coverage");
    }
    if (this.options.activeSheet() !== request.sheet || this.schema() !== request.schema) {
      throw new RangeError("Datasource schema changed while a page was pending");
    }

    const responseColumns: number[] = [];
    const declaredKeys: string[] = [];
    let requestCursor = 0;
    let previousEnd = -1;
    for (const band of page.columns) {
      if (
        !band ||
        !Number.isSafeInteger(band.start) ||
        !Number.isSafeInteger(band.end) ||
        band.start < 0 ||
        band.start >= band.end ||
        band.end > request.schema.keys.length ||
        !Array.isArray(band.keys) ||
        band.keys.length !== band.end - band.start ||
        band.start < previousEnd
      ) {
        throw new RangeError("Datasource page contains malformed column bands");
      }
      while (
        requestCursor < request.bands.length &&
        request.bands[requestCursor]!.end <= band.start
      ) {
        requestCursor += 1;
      }
      const requestedBand = request.bands[requestCursor];
      if (!requestedBand || band.start < requestedBand.start || band.end > requestedBand.end) {
        throw new RangeError("Datasource page column coverage exceeds the request");
      }
      for (let offset = 0; offset < band.keys.length; offset += 1) {
        const expected = request.schema.keys[band.start + offset]!;
        if (band.keys[offset] !== expected) {
          throw new RangeError("Datasource page column keys do not match the current schema");
        }
        declaredKeys.push(expected);
        responseColumns.push(band.start + offset);
      }
      previousEnd = band.end;
    }

    const declared = new Set(declaredKeys);
    for (const row of page.rows) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw new RangeError("Datasource page rows must be keyed objects");
      }
      const ownKeys = Reflect.ownKeys(row);
      if (ownKeys.length !== declaredKeys.length) {
        throw new RangeError("Datasource page row keys do not match declared coverage");
      }
      for (const key of ownKeys) {
        if (typeof key !== "string" || !declared.has(key)) {
          throw new RangeError("Datasource page row contains an undeclared key");
        }
      }
      for (const key of declaredKeys) {
        if (!Object.hasOwn(row, key)) {
          throw new RangeError("Datasource page row is missing a declared key");
        }
      }
    }
    return responseColumns;
  }

  private canHydrate(request: ActiveRequest, generation: number): boolean {
    return (
      !this.destroyed &&
      !request.released &&
      generation === this.generation &&
      !request.controller.signal.aborted
    );
  }

  private canReport(request: ActiveRequest, generation: number): boolean {
    return this.canHydrate(request, generation);
  }

  private requeuePartial(request: ActiveRequest, attempt: number): void {
    this.retryDemand.push({
      start: request.start,
      end: request.end,
      columns: request.columns,
      priority: request.priority,
      direction: request.direction,
      viewportOrigin: request.viewportOrigin,
      durableOrigin: request.durableDemand,
      attempt,
    });
  }

  private recordCompletedWaits(columns: readonly number[], start: number, end: number): void {
    for (const sample of this.visibleWaitStarted.complete(columns, start, end, this.now())) {
      if (this.visibleWaitDurations.length < DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT) {
        this.visibleWaitDurations.push(sample);
      } else {
        this.visibleWaitDurations[this.visibleWaitSampleCursor] = sample;
        this.visibleWaitSampleCursor =
          (this.visibleWaitSampleCursor + 1) % DATASOURCE_VISIBLE_WAIT_SAMPLE_LIMIT;
      }
    }
  }

  private speculativeIntervals(
    visibleStart: number,
    visibleEnd: number,
    direction: -1 | 1,
    bandRows: number,
    columnCount: number,
  ): RowBand[] {
    const horizonRows = this.speculativeRowHorizon(columnCount);
    if (horizonRows === 0) return [];
    const speedInWindowsPerFrame =
      (Math.abs(this.velocityRowsPerMs) * LOGICAL_FRAME_MS) / Math.max(1, bandRows);
    const bands = speedInWindowsPerFrame >= 0.125 || this.lastViewport === null ? 2 : 1;
    const behindRows = Math.min(Math.floor(horizonRows / 5), Math.max(1, Math.ceil(bandRows / 2)));
    const aheadRows = Math.min(
      horizonRows - behindRows,
      bandRows * Math.min(bands, DATASOURCE_PREFETCH_MAX_BANDS),
    );
    const intervals: RowBand[] = [];

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

  private speculativeRowHorizon(columnCount: number): number {
    const rowBytes = Math.max(ESTIMATED_CELL_BYTES, columnCount * ESTIMATED_CELL_BYTES);
    const byteBoundRows = Math.floor(DATASOURCE_PREFETCH_MAX_BYTES / rowBytes);
    return Math.min(DATASOURCE_PREFETCH_MAX_ROWS, Math.max(0, byteBoundRows));
  }

  private remainingSpeculativeRows(columnCount: number): number {
    const active = new SparseIntervals();
    for (const request of this.requests) {
      if (request.speculativeOrigin) active.add(request.start, request.end);
    }
    return Math.max(0, this.speculativeRowHorizon(columnCount) - active.length);
  }

  private refreshPagedResidency(
    loadable: SheetwriteStore | null,
    start: number,
    end: number,
    columns: readonly number[],
  ): void {
    if (!loadable || columns.length === 0) return;
    const sheet = this.options.activeSheet();
    if (!loadable.isPaged(sheet)) return;
    if (loadable.areColumnsFullyLoaded(sheet, start, end, columns)) {
      this.loaded.add(columns, start, end);
      return;
    }
    const schema = this.schema();
    for (const column of columns) {
      const resident = this.loaded.rows(column);
      if (!resident) continue;
      let singleton = schema.singletonIndices.get(column);
      if (!singleton) {
        singleton = Object.freeze([column]);
        schema.singletonIndices.set(column, singleton);
      }
      for (const band of resident.intersections(start, end)) {
        this.reconcileLoadedResidency(loadable, sheet, singleton, band.start, band.end);
      }
    }
  }

  private reconcileLoadedResidency(
    loadable: SheetwriteStore,
    sheet: SheetId,
    columns: readonly number[],
    start: number,
    end: number,
  ): void {
    if (loadable.areColumnsFullyLoaded(sheet, start, end, columns)) return;
    if (end - start === 1) {
      this.loaded.removeColumn(columns[0]!, start, end);
      return;
    }
    const middle = start + Math.floor((end - start) / 2);
    this.reconcileLoadedResidency(loadable, sheet, columns, start, middle);
    this.reconcileLoadedResidency(loadable, sheet, columns, middle, end);
  }

  private cancelObsoleteSpeculation(
    viewport: RowBand & { columns: readonly number[] },
    intervals: readonly RowBand[],
    reason: "obsolete" | "reversal" | "jump",
    cancelGeneration: boolean,
  ): void {
    this.retryDemand = this.retryDemand.filter(
      (demand) =>
        demand.durableOrigin ||
        (rowsIntersect(demand, viewport) && columnsSubset(demand.columns, viewport.columns)),
    );
    for (const request of [...this.requests]) {
      if (request.durableDemand) continue;
      const intersectsViewport =
        rowsIntersect(request, viewport) && columnsSubset(request.columns, viewport.columns);
      if (request.speculativeOrigin) {
        if (intersectsViewport) continue;
        const fullyWanted =
          columnsSubset(request.columns, viewport.columns) &&
          intervals.some(
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
        const currentRows = viewport.end - viewport.start;
        const oversized =
          requestRows >
          Math.max(DATASOURCE_PREFETCH_MAX_ROWS, currentRows * DATASOURCE_PREFETCH_MAX_BANDS);
        if (!intersectsViewport || oversized) this.abortRequest(request, reason);
      }
    }
  }

  private abortRequest(request: ActiveRequest, reason: AbortReason): void {
    if (request.released) return;
    request.controller.abort();
    this.clearOwned(request);
    this.visibleWaitStarted.discard(request.columns, request.start, request.end);
    this.finishRequest(request);
    this.telemetry.aborts += 1;
    if (reason === "reversal") this.telemetry.reversalAborts += 1;
    else if (reason === "jump") this.telemetry.jumpAborts += 1;
    else if (reason === "reset") this.telemetry.resetAborts += 1;
    else if (reason === "destroy") this.telemetry.destroyAborts += 1;
  }

  private clearOwned(request: ActiveRequest): void {
    this.owners.remove(request.id, request.columns);
  }

  private finishRequest(request: ActiveRequest): void {
    if (request.released) return;
    request.released = true;
    this.requests.delete(request);
    this.activeIds.delete(request.id);
    request.releaseRevision();
  }

  private allocateRequestId(): number {
    for (;;) {
      const id = this.nextRequestId;
      this.nextRequestId = id === 0xffff_ffff ? 1 : id + 1;
      if (!this.activeIds.has(id)) return id;
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
