import ts from "typescript";
import { DatasourceController } from "../../packages/core/src/datasource-controller.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import {
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  STORE_MEMORY_PROTOCOL_VERSION,
} from "../../packages/core/src/resource-accounting.js";
import { SheetwriteStore } from "../../packages/core/src/store.js";
import type {
  DataSource,
  DataSourceColumnBand,
  DataSourcePage,
  DataSourceRequest,
  DocumentOp,
  ResourceOwnerBytes,
  RowData,
  Workbook,
} from "../../packages/core/src/types.js";

export const BILLION_CELL_BENCHMARK_SCHEMA_VERSION = 2 as const;
export const BILLION_CELL_SAMPLE_RUNS = 5;
export const VISIBLE_TILE_ROWS = 120;
export const VISIBLE_TILE_COLUMNS = 20;
export const PAGED_CACHE_BYTES = 32 * 1024 * 1024;
export const PAGED_CHUNK_ROWS = 4_096;
export const HORIZONTAL_TILE_AMPLIFICATION_LIMIT = 1;
export const STARTUP_MEDIAN_LIMIT_MS = 15;
export const SCENARIO_P95_LIMIT_MS = 50;
export const STARTUP_METADATA_LIMIT_BYTES = 128 * 1024;
export const CLEAN_ALLOCATION_LIMIT_BYTES = 36 * 1024 * 1024;
export const LOADED_CLEAN_CELL_LIMIT = 100_000;
export const DIRTY_EDIT_COUNT = 100;
export const CONTROLLER_TILE_METADATA_LIMIT_BYTES = 1024 * 1024;
export const FIXED_WINDOW_SLOPE_LIMIT = 1.25;
export const FFI_CROSSINGS_PER_REQUEST_LIMIT = 8;

export const BILLION_CELL_SCALE_CONFIGS = [
  { id: "10m", rows: 500_000, columns: 20, logicalCells: 10_000_000 },
  { id: "100m", rows: 1_000_000, columns: 100, logicalCells: 100_000_000 },
  { id: "1b", rows: 1_000_000, columns: 1_000, logicalCells: 1_000_000_000 },
] as const;

export const BILLION_CELL_SCENARIOS = [
  "construction",
  "first-visible-tile",
  "deep-two-axis-jump",
  "horizontal-sweep",
  "vertical-sweep",
  "diagonal-churn-100",
  "distant-edits-100",
  "dirty-revisit-after-eviction",
  "clear",
  "destroy",
] as const;

export type BillionCellScaleId = (typeof BILLION_CELL_SCALE_CONFIGS)[number]["id"];
export type BillionCellScenarioId = (typeof BILLION_CELL_SCENARIOS)[number];
export type BillionCellGateStatus = "passed" | "failed";

type ScaleConfig = (typeof BILLION_CELL_SCALE_CONFIGS)[number];
type Comparator = "<=" | "=";
type BandMode = "empty" | "contiguous" | "disjoint-frozen";

export interface TimingSummary {
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface TrafficCounters {
  readonly requests: number;
  readonly pages: number;
  readonly requestedRows: number;
  readonly returnedRows: number;
  readonly requestedCells: number;
  readonly returnedCells: number;
  readonly transferredCells: number;
  readonly requestedBytes: number;
  readonly returnedBytes: number;
  readonly transferredBytes: number;
  readonly explicitNullCells: number;
}

export interface CrossingCounters {
  readonly datasourceRequests: number;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
  readonly totalCrossings: number;
  readonly ffiCallsPerRequest: number;
}

export interface ResourceEvidence {
  readonly logicalCells: number;
  readonly loadedCleanCells: number;
  readonly dirtyCells: number;
  readonly residentCells: number;
  readonly residentChunks: number;
  readonly cleanAllocatedBytes: number;
  readonly dirtyAllocatedBytes: number;
  readonly controllerTileMetadataBytes: number;
  readonly controllerTileMetadataEntries: number;
  readonly nonSchemaAllocatedBytes: number;
  readonly unmeasuredOwnerEntries: number;
  readonly owners: readonly ResourceOwnerBytes[];
  readonly ownerSums: {
    readonly logicalBytes: number;
    readonly allocatedBytes: number;
    readonly entries: number;
  };
  readonly runtime: RuntimeMemoryObservation & { readonly rssBytes: number | null };
  readonly wasm: {
    readonly liveBytes: number;
    readonly allocatedBytes: number;
    readonly committedBytes: number | null;
    readonly unaccountedBytes: number;
  };
  readonly controller: {
    readonly loadedBands: number;
    readonly ownedBands: number;
    readonly visibleWaitingRows: number;
    readonly visibleWaitingBands: number;
  } | null;
}

export interface ProtocolExchange {
  readonly scenario: BillionCellScenarioId;
  readonly request: {
    readonly protocol: 2;
    readonly sheet: string;
    readonly start: number;
    readonly end: number;
    readonly columns: readonly DataSourceColumnBand[];
    readonly revision: number;
    readonly keys: readonly string[];
    readonly bytes: number;
    readonly cells: number;
  };
  readonly page: {
    readonly protocol: 2;
    readonly start: number;
    readonly columns: readonly DataSourceColumnBand[];
    readonly revision: number;
    readonly keys: readonly string[];
    readonly rows: number;
    readonly cells: number;
    readonly bytes: number;
    readonly explicitNullCells: number;
    readonly everyRowHasEveryDeclaredKey: true;
  };
}

export interface ScenarioEvidence {
  readonly id: BillionCellScenarioId;
  readonly status: "completed";
  readonly runs: number;
  readonly operationCountPerRun: number;
  readonly timing: TimingSummary;
  readonly trafficPerRun: TrafficCounters;
  readonly crossingsPerRun: CrossingCounters;
  readonly resources: ResourceEvidence;
  readonly parameters: Readonly<Record<string, number | string | readonly number[]>>;
}

export interface ScaleEvidence {
  readonly id: BillionCellScaleId;
  readonly rows: number;
  readonly columns: number;
  readonly logicalCells: number;
  readonly startupRuntimeBaseline: RuntimeMemoryObservation & { readonly rssBytes: number | null };
  readonly startupRuntimeMetadataBytes: number;
  readonly protocol: {
    readonly contract: "protocol-2-windowed";
    readonly capabilities: { readonly protocol: 2; readonly columns: "windowed" };
    readonly requestKeys: readonly string[];
    readonly pageKeys: readonly string[];
    readonly observedBandModes: readonly BandMode[];
    readonly emptyDemandRequests: 0;
    readonly exchanges: readonly ProtocolExchange[];
  };
  readonly scenarios: readonly ScenarioEvidence[];
}

export interface GateCheck {
  readonly id: string;
  readonly scope: string;
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
  readonly comparator: Comparator;
  readonly passed: boolean;
  readonly reason: string;
}

export interface BillionCellBenchmarkArtifact {
  readonly schemaVersion: typeof BILLION_CELL_BENCHMARK_SCHEMA_VERSION;
  readonly status: BillionCellGateStatus;
  readonly toolchain: {
    readonly runtime: "bun";
    readonly bunVersion: string;
    readonly typescriptVersion: string;
    readonly platform: string;
    readonly architecture: string;
    readonly resourceSchemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
    readonly storeMemoryProtocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
  };
  readonly configuration: {
    readonly sampleRuns: number;
    readonly visibleTileRows: number;
    readonly visibleTileColumns: number;
    readonly cacheBytes: number;
    readonly chunkRows: number;
    readonly deepJumpTargetRow: number;
    readonly deepJumpRowFraction: number;
    readonly horizontalSweepTiles: number;
    readonly verticalSweepTiles: number;
    readonly diagonalChurnTiles: number;
    readonly dirtyEdits: number;
    readonly ownershipSumPolicy: "exclusive-owner-sum; runtime observations and subset counters excluded";
    readonly runtimeMetadataPolicy: "positive JS-heap delta after schema construction";
    readonly ceilings: {
      readonly directCellAmplification: number;
      readonly startupMedianMs: number;
      readonly scenarioP95Ms: number;
      readonly startupMetadataBytes: number;
      readonly cleanAllocationBytes: number;
      readonly loadedCleanCellsAfterChurn: number;
      readonly dirtyCellsAfterEdits: number;
      readonly controllerTileMetadataBytes: number;
      readonly fixedWindowSlopeRatio: number;
      readonly ffiCrossingsPerRequest: number;
    };
  };
  readonly scales: readonly ScaleEvidence[];
  readonly gate: {
    readonly status: BillionCellGateStatus;
    readonly checks: readonly GateCheck[];
    readonly failures: readonly GateCheck[];
  };
}

interface MutableTrafficCounters {
  requests: number;
  pages: number;
  requestedRows: number;
  returnedRows: number;
  requestedCells: number;
  returnedCells: number;
  transferredCells: number;
  requestedBytes: number;
  returnedBytes: number;
  transferredBytes: number;
  explicitNullCells: number;
}

interface SingleScenarioResult {
  readonly id: BillionCellScenarioId;
  readonly samplesMs: readonly number[];
  readonly operationCount: number;
  readonly traffic: TrafficCounters;
  readonly crossings: CrossingCounters;
  readonly resources: ResourceEvidence;
  readonly parameters: Readonly<Record<string, number | string | readonly number[]>>;
}

interface SingleScaleRun {
  readonly startupBaseline: RuntimeMemoryObservation & { readonly rssBytes: number | null };
  readonly startupRuntimeMetadataBytes: number;
  readonly emptyDemandRequests: 0;
  readonly exchanges: readonly ProtocolExchange[];
  readonly scenarios: readonly SingleScenarioResult[];
}

const SHEET = "billion";
const DEEP_JUMP_TARGET_ROW = 742_000;
const DEEP_JUMP_ROW_FRACTION = 0.742;
const HORIZONTAL_SWEEP_TILES = 12;
const VERTICAL_SWEEP_TILES = 12;
const DIAGONAL_CHURN_TILES = 100;
const REQUEST_KEYS = [
  "columns",
  "end",
  "protocol",
  "revision",
  "sheet",
  "signal",
  "start",
] as const;
const PAGE_KEYS = ["columns", "protocol", "revision", "rows", "start"] as const;
const EXPECTED_OPERATION_COUNTS: Record<BillionCellScenarioId, number> = {
  construction: 1,
  "first-visible-tile": 1,
  "deep-two-axis-jump": 1,
  "horizontal-sweep": HORIZONTAL_SWEEP_TILES,
  "vertical-sweep": VERTICAL_SWEEP_TILES,
  "diagonal-churn-100": DIAGONAL_CHURN_TILES,
  "distant-edits-100": 1,
  "dirty-revisit-after-eviction": DIAGONAL_CHURN_TILES + 1,
  clear: 1,
  destroy: 1,
};
const FIXED_SCHEMA_OWNERS = new Set(["wasm.sheet-indexes-metadata", "js.datasource.schema-index"]);

function runtimeMemory(): RuntimeMemoryObservation & { readonly rssBytes: number | null } {
  const usage = process.memoryUsage();
  return {
    usedJSHeapSize: Number.isFinite(usage.heapUsed) ? usage.heapUsed : null,
    arrayBufferBytes: Number.isFinite(usage.arrayBuffers) ? usage.arrayBuffers : null,
    externalBytes: Number.isFinite(usage.external) ? usage.external : null,
    browserBackingStoreBytes: null,
    rssBytes: Number.isFinite(usage.rss) ? usage.rss : null,
  };
}

function workbook(config: ScaleConfig): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [
      {
        id: SHEET,
        name: `${config.logicalCells}-cell fixed window`,
        rowCount: config.rows,
        columns: Array.from({ length: config.columns }, (_, column) => ({
          key: `c${column}`,
          header: `C${column}`,
          width: 96,
          type: "number" as const,
        })),
      },
    ],
  };
}

function copyBands(bands: readonly DataSourceColumnBand[]): DataSourceColumnBand[] {
  return bands.map((band) => ({ start: band.start, end: band.end, keys: [...band.keys] }));
}

function countBandColumns(bands: readonly DataSourceColumnBand[]): number {
  return bands.reduce((sum, band) => sum + band.end - band.start, 0);
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function emptyTraffic(): MutableTrafficCounters {
  return {
    requests: 0,
    pages: 0,
    requestedRows: 0,
    returnedRows: 0,
    requestedCells: 0,
    returnedCells: 0,
    transferredCells: 0,
    requestedBytes: 0,
    returnedBytes: 0,
    transferredBytes: 0,
    explicitNullCells: 0,
  };
}

function addTraffic(target: MutableTrafficCounters, exchange: ProtocolExchange): void {
  target.requests += 1;
  target.pages += 1;
  target.requestedRows += exchange.request.end - exchange.request.start;
  target.returnedRows += exchange.page.rows;
  target.requestedCells += exchange.request.cells;
  target.returnedCells += exchange.page.cells;
  target.transferredCells += exchange.page.cells;
  target.requestedBytes += exchange.request.bytes;
  target.returnedBytes += exchange.page.bytes;
  target.transferredBytes += exchange.page.bytes;
  target.explicitNullCells += exchange.page.explicitNullCells;
}

class DeterministicDatasource implements DataSource {
  readonly capabilities = { protocol: 2, columns: "windowed" } as const;
  readonly exchanges: ProtocolExchange[] = [];
  private scenario: BillionCellScenarioId = "first-visible-tile";

  constructor(private readonly config: ScaleConfig) {}

  setScenario(scenario: BillionCellScenarioId): void {
    this.scenario = scenario;
  }

  trafficSince(mark: number): TrafficCounters {
    const counters = emptyTraffic();
    for (let index = mark; index < this.exchanges.length; index += 1) {
      addTraffic(counters, this.exchanges[index]!);
    }
    return counters;
  }

  async getRows(request: DataSourceRequest): Promise<DataSourcePage> {
    if (request.protocol !== 2 || request.sheet !== SHEET) {
      throw new Error("billion-cell datasource received an invalid protocol or sheet");
    }
    if (request.signal.aborted) throw request.signal.reason;
    let previousEnd = -1;
    const declared: Array<{ key: string; column: number }> = [];
    for (const band of request.columns) {
      if (
        !Number.isSafeInteger(band.start) ||
        !Number.isSafeInteger(band.end) ||
        band.start < 0 ||
        band.start < previousEnd ||
        band.end <= band.start ||
        band.end > this.config.columns ||
        band.keys.length !== band.end - band.start
      ) {
        throw new Error("billion-cell datasource received non-canonical column bands");
      }
      for (let offset = 0; offset < band.keys.length; offset += 1) {
        const column = band.start + offset;
        const key = band.keys[offset]!;
        if (key !== `c${column}`) throw new Error("billion-cell datasource received a stale key");
        declared.push({ key, column });
      }
      previousEnd = band.end;
    }

    const rows: RowData[] = [];
    let explicitNullCells = 0;
    for (let row = request.start; row < request.end; row += 1) {
      const result: RowData = {};
      for (const { key, column } of declared) {
        const blank = (row * 17 + column * 13) % 29 === 0;
        result[key] = blank ? null : (row * 1_003 + column) % 1_000_003;
        if (blank) explicitNullCells += 1;
      }
      if (Object.keys(result).length !== declared.length) {
        throw new Error("billion-cell datasource omitted a declared cell key");
      }
      rows.push(result);
    }

    const columns = copyBands(request.columns);
    const page: DataSourcePage = {
      protocol: 2,
      start: request.start,
      columns,
      rows,
      revision: request.revision,
    };
    const requestedCells = (request.end - request.start) * declared.length;
    const requestEnvelope = {
      protocol: request.protocol,
      sheet: request.sheet,
      start: request.start,
      end: request.end,
      columns,
      revision: request.revision,
    };
    const exchange: ProtocolExchange = {
      scenario: this.scenario,
      request: {
        ...requestEnvelope,
        keys: Object.keys(request).sort(),
        bytes: jsonBytes(requestEnvelope),
        cells: requestedCells,
      },
      page: {
        protocol: 2,
        start: page.start,
        columns,
        revision: request.revision,
        keys: Object.keys(page).sort(),
        rows: rows.length,
        cells: rows.length * declared.length,
        bytes: jsonBytes(page),
        explicitNullCells,
        everyRowHasEveryDeclaredKey: true,
      },
    };
    this.exchanges.push(exchange);
    return page;
  }
}

function indices(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset);
}

function visibleColumns(): number[] {
  return indices(0, VISIBLE_TILE_COLUMNS);
}

function frozenWindowColumns(columnCount: number, movingStart: number): number[] {
  const width = VISIBLE_TILE_COLUMNS - 2;
  const boundedStart = Math.max(2, Math.min(columnCount - width, movingStart));
  return [0, 1, ...indices(boundedStart, width)];
}

function uniformStart(index: number, count: number, maximum: number): number {
  if (count <= 1 || maximum <= 0) return 0;
  return Math.floor((index * maximum) / (count - 1));
}

function horizontalColumns(config: ScaleConfig, index: number, count: number): number[] {
  const maximumMovingStart = config.columns - (VISIBLE_TILE_COLUMNS - 2);
  const start = 2 + uniformStart(index, count, maximumMovingStart - 2);
  return frozenWindowColumns(config.columns, start);
}

function diagonalPosition(
  config: ScaleConfig,
  index: number,
  multiplier: number,
): { rowStart: number; columns: number[] } {
  const maximumRowStart = config.rows - VISIBLE_TILE_ROWS;
  const rowOrdinal = (index * multiplier) % DIAGONAL_CHURN_TILES;
  const columnOrdinal = (index * 37 + multiplier) % DIAGONAL_CHURN_TILES;
  return {
    rowStart: uniformStart(rowOrdinal, DIAGONAL_CHURN_TILES, maximumRowStart),
    columns: horizontalColumns(config, columnOrdinal, DIAGONAL_CHURN_TILES),
  };
}

function summarize(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) throw new Error("timing summary requires at least one sample");
  const normalized = samples.map((sample) => Number(sample.toFixed(6)));
  const sorted = [...normalized].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
  return {
    samplesMs: normalized,
    medianMs: median,
    p95Ms: p95,
    minMs: sorted[0]!,
    maxMs: sorted.at(-1)!,
  };
}

async function settleController(
  controller: DatasourceController,
  errors: unknown[],
): Promise<void> {
  for (let turn = 0; turn < 10_000; turn += 1) {
    await Promise.resolve();
    if (errors.length > 0) throw errors[0];
    if (controller.getTelemetry().activeRequests !== 0) continue;
    await Promise.resolve();
    if (controller.getTelemetry().activeRequests === 0) return;
  }
  throw new Error("billion-cell datasource did not settle");
}

function sumOwners(owners: readonly ResourceOwnerBytes[]): ResourceEvidence["ownerSums"] {
  return owners.reduce(
    (sum, owner) => ({
      logicalBytes: sum.logicalBytes + owner.logicalBytes,
      allocatedBytes: sum.allocatedBytes + owner.allocatedBytes,
      entries: sum.entries + owner.entries,
    }),
    { logicalBytes: 0, allocatedBytes: 0, entries: 0 },
  );
}

function collectResources(
  config: ScaleConfig,
  store: SheetwriteStore,
  controller: DatasourceController,
  operation: RuntimeResourceOperation,
  disposed = false,
): ResourceEvidence {
  Bun.gc(true);
  const memory = runtimeMemory();
  const snapshot = store.getRuntimeResourceSnapshot(
    operation,
    disposed ? "after-destroy" : "settled",
    memory,
  );
  const controllerOwners = controller.getResourceOwners();
  const owners = [...snapshot.wasm.owners, ...snapshot.jsOwners, ...controllerOwners].map(
    (owner) => ({
      ...owner,
    }),
  );
  const names = new Set<string>();
  for (const owner of owners) {
    if (names.has(owner.owner)) throw new Error(`resource owner ${owner.owner} was counted twice`);
    names.add(owner.owner);
  }
  const ownerSums = sumOwners(owners);
  const controllerTileOwners = controllerOwners.filter(
    (owner) =>
      owner.owner.startsWith("js.datasource.") && owner.owner !== "js.datasource.schema-index",
  );
  const controllerTileMetadataBytes = controllerTileOwners.reduce(
    (sum, owner) => sum + owner.allocatedBytes,
    0,
  );
  const controllerTileMetadataEntries = controllerTileOwners.reduce(
    (sum, owner) => sum + owner.entries,
    0,
  );
  const nonSchemaAllocatedBytes = owners.reduce(
    (sum, owner) => sum + (FIXED_SCHEMA_OWNERS.has(owner.owner) ? 0 : owner.allocatedBytes),
    0,
  );
  const unmeasuredOwnerEntries = owners.reduce(
    (sum, owner) => sum + (owner.measurement === "entry-count-only" ? owner.entries : 0),
    0,
  );
  const paged = disposed
    ? { loadedCells: 0, dirtyCells: 0, chunks: 0, allocatedBytes: 0, dirtyAllocatedBytes: 0 }
    : store.getPagedStats(SHEET);
  const telemetry = disposed ? null : controller.getTelemetry();
  return {
    logicalCells: config.logicalCells,
    loadedCleanCells: paged.loadedCells,
    dirtyCells: paged.dirtyCells,
    residentCells: paged.loadedCells + paged.dirtyCells,
    residentChunks: paged.chunks,
    cleanAllocatedBytes: paged.allocatedBytes,
    dirtyAllocatedBytes: paged.dirtyAllocatedBytes,
    controllerTileMetadataBytes,
    controllerTileMetadataEntries,
    nonSchemaAllocatedBytes,
    unmeasuredOwnerEntries,
    owners,
    ownerSums,
    runtime: memory,
    wasm: {
      liveBytes: snapshot.wasm.logicalLiveBytes,
      allocatedBytes: snapshot.wasm.allocatedCapacityBytes,
      committedBytes: snapshot.wasm.wasmCommittedBytes,
      unaccountedBytes: snapshot.wasm.unaccountedBytes,
    },
    controller: telemetry
      ? {
          loadedBands: telemetry.loadedBands,
          ownedBands: telemetry.ownedBands,
          visibleWaitingRows: telemetry.visibleWaitingRows,
          visibleWaitingBands: telemetry.visibleWaitingBands,
        }
      : null,
  };
}

function collectCrossings(
  store: SheetwriteStore,
  operation: RuntimeResourceOperation,
  requests: number,
): CrossingCounters {
  const snapshot = store.getRuntimeResourceSnapshot(operation, "settled", runtimeMemory());
  let ffiCalls = 0;
  let jsToWasmBytes = 0;
  let wasmToJsBytes = 0;
  let bulkCalls = 0;
  let scalarCalls = 0;
  for (const boundary of snapshot.boundary) {
    ffiCalls += boundary.ffiCalls;
    jsToWasmBytes += boundary.jsToWasmBytes;
    wasmToJsBytes += boundary.wasmToJsBytes;
    bulkCalls += boundary.bulkCalls;
    scalarCalls += boundary.scalarCalls;
  }
  return {
    datasourceRequests: requests,
    ffiCalls,
    jsToWasmBytes,
    wasmToJsBytes,
    bulkCalls,
    scalarCalls,
    totalCrossings: requests + ffiCalls,
    ffiCallsPerRequest: requests === 0 ? 0 : ffiCalls / requests,
  };
}

async function runScaleOnce(config: ScaleConfig): Promise<SingleScaleRun> {
  const wb = workbook(config);
  Bun.gc(true);
  const startupBaseline = runtimeMemory();
  const startupStarted = performance.now();
  const store = new SheetwriteStore(wb, undefined, {
    storage: "paged",
    chunkRows: PAGED_CHUNK_ROWS,
    cacheBytes: PAGED_CACHE_BYTES,
    dirtyCellLimit: DIRTY_EDIT_COUNT,
  });
  const datasource = new DeterministicDatasource(config);
  const errors: unknown[] = [];
  let logicalClock = 0;
  const controller = new DatasourceController(
    {
      datasource,
      loadable: store,
      activeSheet: () => SHEET,
      rowCount: () => config.rows,
      columns: () => wb.sheets[0]!.columns,
      revision: () => 0,
      isCellNewerThan: (address) => store.getCellLoadState(address) === "local-edit",
      retainRevision: () => () => {},
      onRowsLoaded: () => {},
      onError: (_request, error) => errors.push(error),
      now: () => logicalClock,
    },
    config.rows,
  );
  const startupElapsed = performance.now() - startupStarted;
  const startupResources = collectResources(config, store, controller, "startup");
  const startupHeap = startupResources.runtime.usedJSHeapSize;
  const baselineHeap = startupBaseline.usedJSHeapSize;
  const startupRuntimeMetadataBytes =
    startupHeap === null || baselineHeap === null ? 0 : Math.max(0, startupHeap - baselineHeap);
  const scenarios: SingleScenarioResult[] = [];
  const startupCrossings = collectCrossings(store, "startup", 0);
  scenarios.push({
    id: "construction",
    samplesMs: [startupElapsed],
    operationCount: 1,
    traffic: emptyTraffic(),
    crossings: startupCrossings,
    resources: startupResources,
    parameters: { rows: config.rows, columns: config.columns },
  });

  const scenario = async (
    id: BillionCellScenarioId,
    operation: RuntimeResourceOperation,
    parameters: Readonly<Record<string, number | string | readonly number[]>>,
    run: (measure: (action: () => void | Promise<void>) => Promise<void>) => Promise<number>,
  ): Promise<void> => {
    datasource.setScenario(id);
    controller.resetTelemetry();
    store.resetRuntimeResourceAccounting();
    const exchangeMark = datasource.exchanges.length;
    const samples: number[] = [];
    const measure = async (action: () => void | Promise<void>): Promise<void> => {
      const started = performance.now();
      await action();
      await settleController(controller, errors);
      samples.push(performance.now() - started);
    };
    const operationCount = await run(measure);
    const traffic = datasource.trafficSince(exchangeMark);
    if (traffic.requests !== controller.getTelemetry().requests) {
      throw new Error(`${id} controller/datasource request count diverged`);
    }
    const crossings = collectCrossings(store, operation, traffic.requests);
    const resources = collectResources(config, store, controller, operation);
    scenarios.push({
      id,
      samplesMs: samples,
      operationCount,
      traffic,
      crossings,
      resources,
      parameters,
    });
  };

  const emptyMark = datasource.exchanges.length;
  controller.ensureLoaded(0, VISIBLE_TILE_ROWS, []);
  await settleController(controller, errors);
  const emptyDemandRequests = datasource.exchanges.length - emptyMark;
  if (emptyDemandRequests !== 0)
    throw new Error("empty column demand emitted a datasource request");

  await scenario(
    "first-visible-tile",
    "scroll",
    { rowStart: 0, rows: VISIBLE_TILE_ROWS, columns: visibleColumns() },
    async (measure) => {
      logicalClock += 16.7;
      await measure(() => controller.updateViewport(0, VISIBLE_TILE_ROWS, visibleColumns()));
      return 1;
    },
  );

  const deepRow = Math.floor(config.rows * DEEP_JUMP_ROW_FRACTION);
  const farColumnStart = config.columns - VISIBLE_TILE_COLUMNS;
  const farColumns = indices(farColumnStart, VISIBLE_TILE_COLUMNS);
  await scenario(
    "deep-two-axis-jump",
    "scroll",
    {
      rowStart: deepRow,
      targetRow: deepRow,
      rowFraction: DEEP_JUMP_ROW_FRACTION,
      columnStart: farColumnStart,
      rows: VISIBLE_TILE_ROWS,
      columns: farColumns,
    },
    async (measure) => {
      logicalClock += 16.7;
      await measure(() =>
        controller.updateViewport(deepRow, deepRow + VISIBLE_TILE_ROWS, farColumns),
      );
      return 1;
    },
  );

  await scenario(
    "horizontal-sweep",
    "scroll",
    { tiles: HORIZONTAL_SWEEP_TILES, frozenColumns: 2, movingColumns: VISIBLE_TILE_COLUMNS - 2 },
    async (measure) => {
      for (let tile = 0; tile < HORIZONTAL_SWEEP_TILES; tile += 1) {
        const columns = horizontalColumns(config, tile, HORIZONTAL_SWEEP_TILES);
        logicalClock += 16.7;
        await measure(() =>
          controller.updateViewport(deepRow, deepRow + VISIBLE_TILE_ROWS, columns),
        );
      }
      return HORIZONTAL_SWEEP_TILES;
    },
  );

  await scenario(
    "vertical-sweep",
    "scroll",
    { tiles: VERTICAL_SWEEP_TILES, columns: farColumns },
    async (measure) => {
      for (let tile = 0; tile < VERTICAL_SWEEP_TILES; tile += 1) {
        const rowStart = uniformStart(tile, VERTICAL_SWEEP_TILES, config.rows - VISIBLE_TILE_ROWS);
        logicalClock += 16.7;
        await measure(() =>
          controller.updateViewport(rowStart, rowStart + VISIBLE_TILE_ROWS, farColumns),
        );
      }
      return VERTICAL_SWEEP_TILES;
    },
  );

  await scenario(
    "diagonal-churn-100",
    "scroll",
    {
      tiles: DIAGONAL_CHURN_TILES,
      rowsPerTile: VISIBLE_TILE_ROWS,
      columnsPerTile: VISIBLE_TILE_COLUMNS,
    },
    async (measure) => {
      for (let tile = 0; tile < DIAGONAL_CHURN_TILES; tile += 1) {
        const position = diagonalPosition(config, tile, 17);
        await measure(() =>
          controller.ensureLoaded(
            position.rowStart,
            position.rowStart + VISIBLE_TILE_ROWS,
            position.columns,
          ),
        );
      }
      return DIAGONAL_CHURN_TILES;
    },
  );

  const editAddresses = Array.from({ length: DIRTY_EDIT_COUNT }, (_, index) => ({
    sheet: SHEET,
    row: uniformStart(index, DIRTY_EDIT_COUNT, config.rows - 1),
    col: uniformStart(index, DIRTY_EDIT_COUNT, config.columns - 1),
  }));
  const editPatches: DocumentOp[] = editAddresses.map((addr, index) => ({
    op: "set",
    addr,
    value: { kind: "literal", value: 10_000_000 + index },
  }));
  await scenario(
    "distant-edits-100",
    "edit",
    { edits: DIRTY_EDIT_COUNT, distribution: "uniform-across-both-axes" },
    async (measure) => {
      await measure(() => {
        const outcome = store.withResourceOperation("edit", () =>
          store.applyTransaction({ patches: editPatches }),
        );
        if (outcome.status !== "applied") {
          throw new Error(`100 distant edits were ${outcome.status}`);
        }
      });
      if (store.getPagedStats(SHEET).dirtyCells !== DIRTY_EDIT_COUNT) {
        throw new Error("100 distant edits did not remain dirty");
      }
      return 1;
    },
  );

  await scenario(
    "dirty-revisit-after-eviction",
    "scroll",
    { evictionTiles: DIAGONAL_CHURN_TILES, revisitedDirtyCells: DIRTY_EDIT_COUNT },
    async (measure) => {
      for (let tile = 0; tile < DIAGONAL_CHURN_TILES; tile += 1) {
        const position = diagonalPosition(config, tile, 73);
        await measure(() =>
          controller.ensureLoaded(
            position.rowStart,
            position.rowStart + VISIBLE_TILE_ROWS,
            position.columns,
          ),
        );
      }
      await measure(() => {
        store.withResourceOperation("scroll", () => {
          for (let index = 0; index < editAddresses.length; index += 1) {
            const address = editAddresses[index]!;
            const resolved = store.getCell(address).resolved;
            if (
              resolved !== 10_000_000 + index ||
              store.getCellLoadState(address) !== "local-edit"
            ) {
              throw new Error(`dirty edit ${index} did not survive clean eviction and revisit`);
            }
          }
        });
      });
      if (store.getPagedStats(SHEET).dirtyCells !== DIRTY_EDIT_COUNT) {
        throw new Error("dirty cells were lost during clean eviction");
      }
      return DIAGONAL_CHURN_TILES + 1;
    },
  );

  await scenario(
    "clear",
    "dirty-clear",
    { acknowledgedDirtyCells: DIRTY_EDIT_COUNT },
    async (measure) => {
      await measure(() => {
        store.withResourceOperation("dirty-clear", () => store.acknowledgeOperations(editPatches));
        controller.reset(config.rows);
      });
      if (store.getPagedStats(SHEET).dirtyCells !== 0) {
        throw new Error("clear did not release all dirty cells");
      }
      return 1;
    },
  );

  datasource.setScenario("destroy");
  controller.resetTelemetry();
  store.resetRuntimeResourceAccounting();
  const destroyStarted = performance.now();
  controller.destroy();
  store.dispose();
  const destroyElapsed = performance.now() - destroyStarted;
  const destroyResources = collectResources(config, store, controller, "teardown", true);
  const destroyCrossings = collectCrossings(store, "teardown", 0);
  scenarios.push({
    id: "destroy",
    samplesMs: [destroyElapsed],
    operationCount: 1,
    traffic: emptyTraffic(),
    crossings: destroyCrossings,
    resources: destroyResources,
    parameters: { controllerDestroyed: 1, storeDisposed: 1 },
  });

  return {
    startupBaseline,
    startupRuntimeMetadataBytes,
    emptyDemandRequests: 0,
    exchanges: datasource.exchanges,
    scenarios,
  };
}

function sameDeterministicCounters(
  expected: SingleScenarioResult,
  actual: SingleScenarioResult,
): void {
  if (expected.id !== actual.id || expected.operationCount !== actual.operationCount) {
    throw new Error("fixed workload operation counts changed between sample runs");
  }
  if (JSON.stringify(expected.traffic) !== JSON.stringify(actual.traffic)) {
    throw new Error(`${expected.id} traffic changed between sample runs`);
  }
  if (JSON.stringify(expected.crossings) !== JSON.stringify(actual.crossings)) {
    throw new Error(`${expected.id} crossing counts changed between sample runs`);
  }
  const deterministicResourceFields = [
    "logicalCells",
    "loadedCleanCells",
    "dirtyCells",
    "residentCells",
    "residentChunks",
    "controllerTileMetadataEntries",
    "unmeasuredOwnerEntries",
    "controller",
  ] as const;
  for (const field of deterministicResourceFields) {
    const expectedValue = JSON.stringify(expected.resources[field]);
    const actualValue = JSON.stringify(actual.resources[field]);
    if (expectedValue !== actualValue) {
      throw new Error(
        `${expected.id} retained ${field} changed between sample runs: ${expectedValue} != ${actualValue}`,
      );
    }
  }
}

async function runScale(config: ScaleConfig): Promise<ScaleEvidence> {
  const runs: SingleScaleRun[] = [];
  for (let run = 0; run < BILLION_CELL_SAMPLE_RUNS; run += 1) runs.push(await runScaleOnce(config));
  const representative = runs[0]!;
  const scenarios = representative.scenarios.map((base, scenarioIndex): ScenarioEvidence => {
    const samples: number[] = [];
    for (const run of runs) {
      const candidate = run.scenarios[scenarioIndex]!;
      sameDeterministicCounters(base, candidate);
      samples.push(...candidate.samplesMs);
    }
    return {
      id: base.id,
      status: "completed",
      runs: BILLION_CELL_SAMPLE_RUNS,
      operationCountPerRun: base.operationCount,
      timing: summarize(samples),
      trafficPerRun: base.traffic,
      crossingsPerRun: base.crossings,
      resources: base.resources,
      parameters: base.parameters,
    };
  });
  const observedBandModes: BandMode[] = ["empty"];
  if (representative.exchanges.some((exchange) => exchange.request.columns.length === 1)) {
    observedBandModes.push("contiguous");
  }
  if (representative.exchanges.some((exchange) => exchange.request.columns.length > 1)) {
    observedBandModes.push("disjoint-frozen");
  }
  return {
    id: config.id,
    rows: config.rows,
    columns: config.columns,
    logicalCells: config.logicalCells,
    startupRuntimeBaseline: representative.startupBaseline,
    startupRuntimeMetadataBytes: representative.startupRuntimeMetadataBytes,
    protocol: {
      contract: "protocol-2-windowed",
      capabilities: { protocol: 2, columns: "windowed" },
      requestKeys: [...REQUEST_KEYS],
      pageKeys: [...PAGE_KEYS],
      observedBandModes,
      emptyDemandRequests: 0,
      exchanges: representative.exchanges,
    },
    scenarios,
  };
}

function check(
  id: string,
  scope: string,
  metric: string,
  actual: number,
  limit: number,
  comparator: Comparator = "<=",
): GateCheck {
  const passed = comparator === "<=" ? actual <= limit : actual === limit;
  return {
    id,
    scope,
    metric,
    actual,
    limit,
    comparator,
    passed,
    reason: `${scope} ${metric} must be ${comparator} ${limit}; actual ${actual}`,
  };
}

function scenarioOf(scale: ScaleEvidence, id: BillionCellScenarioId): ScenarioEvidence {
  const scenario = scale.scenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`scale ${scale.id} is missing ${id}`);
  return scenario;
}

function finiteRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 1 : Number.MAX_SAFE_INTEGER;
  return numerator / denominator;
}

export function deriveBillionCellGateChecks(scales: readonly ScaleEvidence[]): GateCheck[] {
  const checks: GateCheck[] = [];
  for (const scale of scales) {
    const construction = scenarioOf(scale, "construction");
    const deepJump = scenarioOf(scale, "deep-two-axis-jump");
    const deepRow = deepJump.parameters.rowStart;
    const deepColumn = deepJump.parameters.columnStart;
    if (typeof deepRow !== "number" || typeof deepColumn !== "number") {
      throw new Error(`scale ${scale.id} deep-jump targets are missing`);
    }
    const churn = scenarioOf(scale, "diagonal-churn-100");
    const edits = scenarioOf(scale, "distant-edits-100");
    const revisit = scenarioOf(scale, "dirty-revisit-after-eviction");
    const clear = scenarioOf(scale, "clear");
    const destroy = scenarioOf(scale, "destroy");
    checks.push(
      check(
        `${scale.id}:deep-row-target`,
        scale.id,
        "scale-relative deep-jump row",
        deepRow,
        Math.floor(scale.rows * DEEP_JUMP_ROW_FRACTION),
        "=",
      ),
      check(
        `${scale.id}:deep-column-target`,
        scale.id,
        "far 20-column window start",
        deepColumn,
        scale.columns - VISIBLE_TILE_COLUMNS,
        "=",
      ),
      check(
        `${scale.id}:startup-median`,
        scale.id,
        "startup median ms",
        construction.timing.medianMs,
        STARTUP_MEDIAN_LIMIT_MS,
      ),
      check(
        `${scale.id}:startup-metadata`,
        scale.id,
        "startup runtime metadata bytes beyond prebuilt O(columns) schema",
        scale.startupRuntimeMetadataBytes,
        STARTUP_METADATA_LIMIT_BYTES,
      ),
      check(
        `${scale.id}:loaded-clean-after-churn`,
        scale.id,
        "loaded clean cells after 100-tile churn",
        churn.resources.loadedCleanCells,
        LOADED_CLEAN_CELL_LIMIT,
      ),
      check(
        `${scale.id}:dirty-edits`,
        scale.id,
        "dirty cells after 100 edits",
        edits.resources.dirtyCells,
        DIRTY_EDIT_COUNT,
        "=",
      ),
      check(
        `${scale.id}:dirty-revisit`,
        scale.id,
        "dirty cells after clean eviction and revisit",
        revisit.resources.dirtyCells,
        DIRTY_EDIT_COUNT,
        "=",
      ),
      check(
        `${scale.id}:clear`,
        scale.id,
        "dirty cells after clear",
        clear.resources.dirtyCells,
        0,
        "=",
      ),
      check(
        `${scale.id}:destroy-live`,
        scale.id,
        "owned live bytes after destroy",
        destroy.resources.ownerSums.logicalBytes,
        0,
        "=",
      ),
      check(
        `${scale.id}:destroy-allocated`,
        scale.id,
        "owned allocated bytes after destroy",
        destroy.resources.ownerSums.allocatedBytes,
        0,
        "=",
      ),
      check(
        `${scale.id}:empty-demand`,
        scale.id,
        "requests emitted for empty columns",
        scale.protocol.emptyDemandRequests,
        0,
        "=",
      ),
    );

    const maxCleanAllocation = Math.max(
      ...scale.scenarios.map((scenario) => scenario.resources.cleanAllocatedBytes),
    );
    const maxControllerMetadata = Math.max(
      ...scale.scenarios.map((scenario) => scenario.resources.controllerTileMetadataBytes),
    );
    checks.push(
      check(
        `${scale.id}:clean-allocation`,
        scale.id,
        "clean paged allocated bytes",
        maxCleanAllocation,
        CLEAN_ALLOCATION_LIMIT_BYTES,
      ),
      check(
        `${scale.id}:controller-metadata`,
        scale.id,
        "controller tile metadata bytes",
        maxControllerMetadata,
        CONTROLLER_TILE_METADATA_LIMIT_BYTES,
      ),
    );

    for (const scenario of scale.scenarios) {
      checks.push(
        check(
          `${scale.id}:${scenario.id}:p95`,
          `${scale.id}/${scenario.id}`,
          "operation p95 ms",
          scenario.timing.p95Ms,
          SCENARIO_P95_LIMIT_MS,
        ),
      );
      const traffic = scenario.trafficPerRun;
      if (traffic.requests > 0) {
        checks.push(
          check(
            `${scale.id}:${scenario.id}:returned-amplification`,
            `${scale.id}/${scenario.id}`,
            "returned/requested cell amplification",
            finiteRatio(traffic.returnedCells, traffic.requestedCells),
            HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
          ),
          check(
            `${scale.id}:${scenario.id}:transferred-amplification`,
            `${scale.id}/${scenario.id}`,
            "transferred/requested cell amplification",
            finiteRatio(traffic.transferredCells, traffic.requestedCells),
            HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
          ),
          check(
            `${scale.id}:${scenario.id}:ffi-crossings`,
            `${scale.id}/${scenario.id}`,
            "hydration/recompute FFI crossings per datasource request",
            scenario.crossingsPerRun.ffiCallsPerRequest,
            FFI_CROSSINGS_PER_REQUEST_LIMIT,
          ),
        );
      }
    }
  }

  for (let index = 1; index < scales.length; index += 1) {
    const previous = scenarioOf(scales[index - 1]!, "diagonal-churn-100").resources;
    const current = scenarioOf(scales[index]!, "diagonal-churn-100").resources;
    const scope = `${scales[index - 1]!.id}->${scales[index]!.id}`;
    checks.push(
      check(
        `${scope}:retained-byte-slope`,
        scope,
        "fixed-window non-schema retained-byte ratio",
        finiteRatio(current.nonSchemaAllocatedBytes, previous.nonSchemaAllocatedBytes),
        FIXED_WINDOW_SLOPE_LIMIT,
      ),
      check(
        `${scope}:retained-cardinality-slope`,
        scope,
        "fixed-window resident-cardinality ratio",
        finiteRatio(
          current.residentCells + current.residentChunks + current.controllerTileMetadataEntries,
          previous.residentCells + previous.residentChunks + previous.controllerTileMetadataEntries,
        ),
        FIXED_WINDOW_SLOPE_LIMIT,
      ),
    );
  }
  return checks;
}

export async function runBillionCellBenchmark(): Promise<BillionCellBenchmarkArtifact> {
  await initSheetwrite();
  const scales: ScaleEvidence[] = [];
  for (const config of BILLION_CELL_SCALE_CONFIGS) scales.push(await runScale(config));
  const checks = deriveBillionCellGateChecks(scales);
  const failures = checks.filter((candidate) => !candidate.passed);
  const status: BillionCellGateStatus = failures.length === 0 ? "passed" : "failed";
  const artifact: BillionCellBenchmarkArtifact = {
    schemaVersion: BILLION_CELL_BENCHMARK_SCHEMA_VERSION,
    status,
    toolchain: {
      runtime: "bun",
      bunVersion: Bun.version,
      typescriptVersion: ts.version,
      platform: process.platform,
      architecture: process.arch,
      resourceSchemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
      storeMemoryProtocolVersion: STORE_MEMORY_PROTOCOL_VERSION,
    },
    configuration: {
      sampleRuns: BILLION_CELL_SAMPLE_RUNS,
      visibleTileRows: VISIBLE_TILE_ROWS,
      visibleTileColumns: VISIBLE_TILE_COLUMNS,
      cacheBytes: PAGED_CACHE_BYTES,
      chunkRows: PAGED_CHUNK_ROWS,
      deepJumpTargetRow: DEEP_JUMP_TARGET_ROW,
      deepJumpRowFraction: DEEP_JUMP_ROW_FRACTION,
      horizontalSweepTiles: HORIZONTAL_SWEEP_TILES,
      verticalSweepTiles: VERTICAL_SWEEP_TILES,
      diagonalChurnTiles: DIAGONAL_CHURN_TILES,
      dirtyEdits: DIRTY_EDIT_COUNT,
      ownershipSumPolicy: "exclusive-owner-sum; runtime observations and subset counters excluded",
      runtimeMetadataPolicy: "positive JS-heap delta after schema construction",
      ceilings: {
        directCellAmplification: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
        startupMedianMs: STARTUP_MEDIAN_LIMIT_MS,
        scenarioP95Ms: SCENARIO_P95_LIMIT_MS,
        startupMetadataBytes: STARTUP_METADATA_LIMIT_BYTES,
        cleanAllocationBytes: CLEAN_ALLOCATION_LIMIT_BYTES,
        loadedCleanCellsAfterChurn: LOADED_CLEAN_CELL_LIMIT,
        dirtyCellsAfterEdits: DIRTY_EDIT_COUNT,
        controllerTileMetadataBytes: CONTROLLER_TILE_METADATA_LIMIT_BYTES,
        fixedWindowSlopeRatio: FIXED_WINDOW_SLOPE_LIMIT,
        ffiCrossingsPerRequest: FFI_CROSSINGS_PER_REQUEST_LIMIT,
      },
    },
    scales,
    gate: { status, checks, failures },
  };
  validateBillionCellBenchmark(artifact);
  return artifact;
}

function invalid(message: string): never {
  throw new Error(`Invalid billion-cell benchmark artifact: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid(`${label} missing`);
  return value as Record<string, unknown>;
}

function finiteNumbers(value: unknown, path = "artifact"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      finiteNumbers(child, `${path}[${index}]`);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) finiteNumbers(child, `${path}.${key}`);
  }
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) invalid(`${label} must equal ${String(expected)}`);
}
function validateRuntimeMemory(value: unknown, label: string): void {
  const runtime = record(value, label);
  for (const field of [
    "usedJSHeapSize",
    "arrayBufferBytes",
    "externalBytes",
    "browserBackingStoreBytes",
    "rssBytes",
  ]) {
    if (runtime[field] !== null) nonNegativeInteger(runtime[field], `${label}.${field}`);
  }
}
function isScenarioId(value: unknown): value is BillionCellScenarioId {
  return typeof value === "string" && BILLION_CELL_SCENARIOS.some((scenario) => scenario === value);
}

function validateBands(
  value: unknown,
  columnCount: number,
  label: string,
): readonly DataSourceColumnBand[] {
  if (!Array.isArray(value) || value.length === 0) invalid(`${label} must contain column bands`);
  let previousEnd = -1;
  for (let index = 0; index < value.length; index += 1) {
    const band = record(value[index], `${label}[${index}]`);
    const start = nonNegativeInteger(band.start, `${label}[${index}].start`);
    const end = nonNegativeInteger(band.end, `${label}[${index}].end`);
    if (start < previousEnd || end <= start || end > columnCount)
      invalid(`${label} is not sorted/disjoint`);
    if (!Array.isArray(band.keys) || band.keys.length !== end - start)
      invalid(`${label} key count mismatch`);
    for (let offset = 0; offset < band.keys.length; offset += 1) {
      exact(band.keys[offset], `c${start + offset}`, `${label}[${index}].keys[${offset}]`);
    }
    previousEnd = end;
  }
  return value as DataSourceColumnBand[];
}

function validateResources(value: unknown, logicalCells: number, label: string): void {
  const resources = record(value, label);
  exact(resources.logicalCells, logicalCells, `${label}.logicalCells`);
  const loadedCleanCells = nonNegativeInteger(
    resources.loadedCleanCells,
    `${label}.loadedCleanCells`,
  );
  const dirtyCells = nonNegativeInteger(resources.dirtyCells, `${label}.dirtyCells`);
  const residentCells = nonNegativeInteger(resources.residentCells, `${label}.residentCells`);
  for (const field of [
    "residentChunks",
    "cleanAllocatedBytes",
    "dirtyAllocatedBytes",
    "controllerTileMetadataBytes",
    "controllerTileMetadataEntries",
    "nonSchemaAllocatedBytes",
    "unmeasuredOwnerEntries",
  ]) {
    nonNegativeInteger(resources[field], `${label}.${field}`);
  }
  exact(residentCells, loadedCleanCells + dirtyCells, `${label}.residentCells`);
  if (residentCells >= logicalCells)
    invalid(`${label} conflates residency with logical addressability`);
  if (!Array.isArray(resources.owners)) invalid(`${label}.owners missing`);
  const names = new Set<string>();
  const sums = { logicalBytes: 0, allocatedBytes: 0, entries: 0 };
  for (const [index, candidate] of resources.owners.entries()) {
    const owner = record(candidate, `${label}.owners[${index}]`);
    if (typeof owner.owner !== "string" || names.has(owner.owner))
      invalid(`${label} owner names must be unique`);
    names.add(owner.owner);
    sums.logicalBytes += nonNegativeInteger(
      owner.logicalBytes,
      `${label}.owners[${index}].logicalBytes`,
    );
    sums.allocatedBytes += nonNegativeInteger(
      owner.allocatedBytes,
      `${label}.owners[${index}].allocatedBytes`,
    );
    sums.entries += nonNegativeInteger(owner.entries, `${label}.owners[${index}].entries`);
    const validMeasurements = [
      "exact-capacity",
      "hash-capacity-v1",
      "typed-array-byte-length",
      "utf16-upper-bound",
      "entry-count-only",
    ];
    if (typeof owner.measurement !== "string" || !validMeasurements.includes(owner.measurement)) {
      invalid(`${label}.owners[${index}].measurement is invalid`);
    }
  }
  const ownerSums = record(resources.ownerSums, `${label}.ownerSums`);
  exact(ownerSums.logicalBytes, sums.logicalBytes, `${label}.ownerSums.logicalBytes`);
  exact(ownerSums.allocatedBytes, sums.allocatedBytes, `${label}.ownerSums.allocatedBytes`);
  exact(ownerSums.entries, sums.entries, `${label}.ownerSums.entries`);
  const wasm = record(resources.wasm, `${label}.wasm`);
  for (const field of ["liveBytes", "allocatedBytes", "unaccountedBytes"]) {
    nonNegativeInteger(wasm[field], `${label}.wasm.${field}`);
  }
  if (wasm.committedBytes !== null)
    nonNegativeInteger(wasm.committedBytes, `${label}.wasm.committedBytes`);
  validateRuntimeMemory(resources.runtime, `${label}.runtime`);
}

function validateTraffic(value: unknown, label: string): TrafficCounters {
  const traffic = record(value, label);
  const counters = {
    requests: nonNegativeInteger(traffic.requests, `${label}.requests`),
    pages: nonNegativeInteger(traffic.pages, `${label}.pages`),
    requestedRows: nonNegativeInteger(traffic.requestedRows, `${label}.requestedRows`),
    returnedRows: nonNegativeInteger(traffic.returnedRows, `${label}.returnedRows`),
    requestedCells: nonNegativeInteger(traffic.requestedCells, `${label}.requestedCells`),
    returnedCells: nonNegativeInteger(traffic.returnedCells, `${label}.returnedCells`),
    transferredCells: nonNegativeInteger(traffic.transferredCells, `${label}.transferredCells`),
    requestedBytes: nonNegativeInteger(traffic.requestedBytes, `${label}.requestedBytes`),
    returnedBytes: nonNegativeInteger(traffic.returnedBytes, `${label}.returnedBytes`),
    transferredBytes: nonNegativeInteger(traffic.transferredBytes, `${label}.transferredBytes`),
    explicitNullCells: nonNegativeInteger(traffic.explicitNullCells, `${label}.explicitNullCells`),
  };
  exact(counters.pages, counters.requests, `${label}.pages`);
  exact(counters.returnedCells, counters.requestedCells, `${label}.returnedCells`);
  exact(counters.transferredCells, counters.returnedCells, `${label}.transferredCells`);
  exact(counters.transferredBytes, counters.returnedBytes, `${label}.transferredBytes`);
  return counters;
}

export function validateBillionCellBenchmark(
  value: unknown,
): asserts value is BillionCellBenchmarkArtifact {
  finiteNumbers(value);
  const artifact = record(value, "artifact");
  exact(artifact.schemaVersion, BILLION_CELL_BENCHMARK_SCHEMA_VERSION, "schemaVersion");
  const toolchain = record(artifact.toolchain, "toolchain");
  exact(toolchain.runtime, "bun", "toolchain.runtime");
  exact(toolchain.bunVersion, Bun.version, "toolchain.bunVersion");
  exact(toolchain.typescriptVersion, ts.version, "toolchain.typescriptVersion");
  exact(toolchain.platform, process.platform, "toolchain.platform");
  exact(toolchain.architecture, process.arch, "toolchain.architecture");
  exact(
    toolchain.resourceSchemaVersion,
    RUNTIME_RESOURCE_SCHEMA_VERSION,
    "toolchain.resourceSchemaVersion",
  );
  exact(
    toolchain.storeMemoryProtocolVersion,
    STORE_MEMORY_PROTOCOL_VERSION,
    "toolchain.storeMemoryProtocolVersion",
  );
  const configuration = record(artifact.configuration, "configuration");
  exact(configuration.sampleRuns, BILLION_CELL_SAMPLE_RUNS, "configuration.sampleRuns");
  exact(configuration.cacheBytes, PAGED_CACHE_BYTES, "configuration.cacheBytes");
  exact(configuration.chunkRows, PAGED_CHUNK_ROWS, "configuration.chunkRows");
  exact(configuration.visibleTileRows, VISIBLE_TILE_ROWS, "configuration.visibleTileRows");
  exact(configuration.visibleTileColumns, VISIBLE_TILE_COLUMNS, "configuration.visibleTileColumns");
  exact(configuration.deepJumpTargetRow, DEEP_JUMP_TARGET_ROW, "configuration.deepJumpTargetRow");
  exact(
    configuration.deepJumpRowFraction,
    DEEP_JUMP_ROW_FRACTION,
    "configuration.deepJumpRowFraction",
  );
  exact(
    configuration.horizontalSweepTiles,
    HORIZONTAL_SWEEP_TILES,
    "configuration.horizontalSweepTiles",
  );
  exact(configuration.verticalSweepTiles, VERTICAL_SWEEP_TILES, "configuration.verticalSweepTiles");
  exact(configuration.diagonalChurnTiles, DIAGONAL_CHURN_TILES, "configuration.diagonalChurnTiles");
  exact(configuration.dirtyEdits, DIRTY_EDIT_COUNT, "configuration.dirtyEdits");
  exact(
    configuration.ownershipSumPolicy,
    "exclusive-owner-sum; runtime observations and subset counters excluded",
    "configuration.ownershipSumPolicy",
  );
  exact(
    configuration.runtimeMetadataPolicy,
    "positive JS-heap delta after schema construction",
    "configuration.runtimeMetadataPolicy",
  );
  const ceilings = record(configuration.ceilings, "configuration.ceilings");
  const expectedCeilings = {
    directCellAmplification: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
    startupMedianMs: STARTUP_MEDIAN_LIMIT_MS,
    scenarioP95Ms: SCENARIO_P95_LIMIT_MS,
    startupMetadataBytes: STARTUP_METADATA_LIMIT_BYTES,
    cleanAllocationBytes: CLEAN_ALLOCATION_LIMIT_BYTES,
    loadedCleanCellsAfterChurn: LOADED_CLEAN_CELL_LIMIT,
    dirtyCellsAfterEdits: DIRTY_EDIT_COUNT,
    controllerTileMetadataBytes: CONTROLLER_TILE_METADATA_LIMIT_BYTES,
    fixedWindowSlopeRatio: FIXED_WINDOW_SLOPE_LIMIT,
    ffiCrossingsPerRequest: FFI_CROSSINGS_PER_REQUEST_LIMIT,
  };
  for (const [key, expected] of Object.entries(expectedCeilings))
    exact(ceilings[key], expected, `ceilings.${key}`);

  if (
    !Array.isArray(artifact.scales) ||
    artifact.scales.length !== BILLION_CELL_SCALE_CONFIGS.length
  ) {
    invalid(`scales must contain exactly ${BILLION_CELL_SCALE_CONFIGS.length} entries`);
  }
  for (let scaleIndex = 0; scaleIndex < BILLION_CELL_SCALE_CONFIGS.length; scaleIndex += 1) {
    const expectedScale = BILLION_CELL_SCALE_CONFIGS[scaleIndex]!;
    const scale = record(artifact.scales[scaleIndex], `scales[${scaleIndex}]`);
    exact(scale.id, expectedScale.id, `scales[${scaleIndex}].id`);
    exact(scale.rows, expectedScale.rows, `scales[${scaleIndex}].rows`);
    exact(scale.columns, expectedScale.columns, `scales[${scaleIndex}].columns`);
    exact(scale.logicalCells, expectedScale.logicalCells, `scales[${scaleIndex}].logicalCells`);
    exact(
      expectedScale.rows * expectedScale.columns,
      expectedScale.logicalCells,
      `scales[${scaleIndex}] row/column product`,
    );
    nonNegativeInteger(
      scale.startupRuntimeMetadataBytes,
      `scales[${scaleIndex}].startupRuntimeMetadataBytes`,
    );
    validateRuntimeMemory(
      scale.startupRuntimeBaseline,
      `scales[${scaleIndex}].startupRuntimeBaseline`,
    );
    const protocol = record(scale.protocol, `scales[${scaleIndex}].protocol`);
    exact(protocol.contract, "protocol-2-windowed", `scales[${scaleIndex}].protocol.contract`);
    const capabilities = record(
      protocol.capabilities,
      `scales[${scaleIndex}].protocol.capabilities`,
    );
    exact(capabilities.protocol, 2, `scales[${scaleIndex}].protocol.capabilities.protocol`);
    exact(capabilities.columns, "windowed", `scales[${scaleIndex}].protocol.capabilities.columns`);
    exact(protocol.emptyDemandRequests, 0, `scales[${scaleIndex}].protocol.emptyDemandRequests`);
    if (JSON.stringify(protocol.requestKeys) !== JSON.stringify(REQUEST_KEYS))
      invalid("request keys changed");
    if (JSON.stringify(protocol.pageKeys) !== JSON.stringify(PAGE_KEYS))
      invalid("page keys changed");
    const expectedBandModes: BandMode[] = ["empty", "contiguous", "disjoint-frozen"];
    if (JSON.stringify(protocol.observedBandModes) !== JSON.stringify(expectedBandModes)) {
      invalid(
        `protocol band modes ${JSON.stringify(protocol.observedBandModes)}; expected ${JSON.stringify(expectedBandModes)} for ${expectedScale.id}`,
      );
    }
    if (!Array.isArray(protocol.exchanges) || protocol.exchanges.length === 0)
      invalid("protocol exchanges missing");
    const traceTraffic = new Map<BillionCellScenarioId, MutableTrafficCounters>();
    for (const [exchangeIndex, candidate] of protocol.exchanges.entries()) {
      const exchange = record(candidate, `protocol.exchanges[${exchangeIndex}]`);
      if (!isScenarioId(exchange.scenario)) invalid("exchange scenario is invalid");
      const scenario = exchange.scenario;
      const request = record(exchange.request, `protocol.exchanges[${exchangeIndex}].request`);
      const page = record(exchange.page, `protocol.exchanges[${exchangeIndex}].page`);
      exact(request.protocol, 2, "request.protocol");
      exact(page.protocol, 2, "page.protocol");
      exact(page.start, request.start, "page.start");
      const bands = validateBands(request.columns, expectedScale.columns, "request.columns");
      validateBands(page.columns, expectedScale.columns, "page.columns");
      if (JSON.stringify(request.columns) !== JSON.stringify(page.columns))
        invalid("page columns differ from request");
      const requestStart = nonNegativeInteger(request.start, "request.start");
      const requestEnd = nonNegativeInteger(request.end, "request.end");
      if (requestEnd <= requestStart) invalid("request row interval is empty");
      const requestedRows = requestEnd - requestStart;
      const declaredColumns = countBandColumns(bands);
      const requestCells = nonNegativeInteger(request.cells, "request.cells");
      const pageRows = nonNegativeInteger(page.rows, "page.rows");
      const pageCells = nonNegativeInteger(page.cells, "page.cells");
      const requestBytes = nonNegativeInteger(request.bytes, "request.bytes");
      const pageBytes = nonNegativeInteger(page.bytes, "page.bytes");
      const explicitNullCells = nonNegativeInteger(
        page.explicitNullCells,
        "page.explicitNullCells",
      );
      exact(requestCells, requestedRows * declaredColumns, "request.cells");
      exact(pageRows, requestedRows, "page.rows");
      exact(pageCells, requestCells, "page.cells");
      exact(page.everyRowHasEveryDeclaredKey, true, "page.everyRowHasEveryDeclaredKey");
      if (JSON.stringify(request.keys) !== JSON.stringify(REQUEST_KEYS))
        invalid("request trace keys changed");
      if (JSON.stringify(page.keys) !== JSON.stringify(PAGE_KEYS))
        invalid("page trace keys changed");
      let counters = traceTraffic.get(scenario);
      if (!counters) {
        counters = emptyTraffic();
        traceTraffic.set(scenario, counters);
      }
      counters.requests += 1;
      counters.pages += 1;
      counters.requestedRows += requestedRows;
      counters.returnedRows += pageRows;
      counters.requestedCells += requestCells;
      counters.returnedCells += pageCells;
      counters.transferredCells += pageCells;
      counters.requestedBytes += requestBytes;
      counters.returnedBytes += pageBytes;
      counters.transferredBytes += pageBytes;
      counters.explicitNullCells += explicitNullCells;
    }

    if (
      !Array.isArray(scale.scenarios) ||
      scale.scenarios.length !== BILLION_CELL_SCENARIOS.length
    ) {
      invalid(`scale ${expectedScale.id} scenarios missing`);
    }
    for (let scenarioIndex = 0; scenarioIndex < BILLION_CELL_SCENARIOS.length; scenarioIndex += 1) {
      const expectedId = BILLION_CELL_SCENARIOS[scenarioIndex]!;
      const scenario = record(
        scale.scenarios[scenarioIndex],
        `scale ${expectedScale.id} scenario ${expectedId}`,
      );
      exact(scenario.id, expectedId, `scenario ${expectedId}.id`);
      exact(scenario.status, "completed", `scenario ${expectedId}.status`);
      exact(scenario.runs, BILLION_CELL_SAMPLE_RUNS, `scenario ${expectedId}.runs`);
      const operationCount = nonNegativeInteger(
        scenario.operationCountPerRun,
        `scenario ${expectedId}.operationCountPerRun`,
      );
      exact(
        operationCount,
        EXPECTED_OPERATION_COUNTS[expectedId],
        `scenario ${expectedId}.operationCountPerRun`,
      );
      const timing = record(scenario.timing, `scenario ${expectedId}.timing`);
      if (
        !Array.isArray(timing.samplesMs) ||
        timing.samplesMs.length !== operationCount * BILLION_CELL_SAMPLE_RUNS
      ) {
        invalid(`scenario ${expectedId} timing sample count is inconsistent`);
      }
      const expectedTiming = summarize(timing.samplesMs);
      for (const field of ["medianMs", "p95Ms", "minMs", "maxMs"] as const) {
        exact(timing[field], expectedTiming[field], `scenario ${expectedId}.timing.${field}`);
      }
      const traffic = validateTraffic(
        scenario.trafficPerRun,
        `scenario ${expectedId}.trafficPerRun`,
      );
      const traced = traceTraffic.get(expectedId) ?? emptyTraffic();
      if (JSON.stringify(traffic) !== JSON.stringify(traced))
        invalid(`scenario ${expectedId} traffic does not match trace`);
      const crossings = record(scenario.crossingsPerRun, `scenario ${expectedId}.crossingsPerRun`);
      for (const field of [
        "datasourceRequests",
        "ffiCalls",
        "jsToWasmBytes",
        "wasmToJsBytes",
        "bulkCalls",
        "scalarCalls",
        "totalCrossings",
      ]) {
        nonNegativeInteger(crossings[field], `scenario ${expectedId}.crossingsPerRun.${field}`);
      }
      const datasourceRequests = nonNegativeInteger(
        crossings.datasourceRequests,
        `scenario ${expectedId}.datasourceRequests`,
      );
      const ffiCalls = nonNegativeInteger(crossings.ffiCalls, `scenario ${expectedId}.ffiCalls`);
      exact(datasourceRequests, traffic.requests, `scenario ${expectedId}.datasourceRequests`);
      exact(
        crossings.totalCrossings,
        datasourceRequests + ffiCalls,
        `scenario ${expectedId}.totalCrossings`,
      );
      exact(
        crossings.ffiCallsPerRequest,
        traffic.requests === 0 ? 0 : ffiCalls / traffic.requests,
        `scenario ${expectedId}.ffiCallsPerRequest`,
      );
      validateResources(
        scenario.resources,
        expectedScale.logicalCells,
        `scenario ${expectedId}.resources`,
      );
    }
    if (
      [...traceTraffic.values()].reduce((sum, traffic) => sum + traffic.explicitNullCells, 0) === 0
    ) {
      invalid(`scale ${expectedScale.id} did not transfer explicit null blanks`);
    }
  }

  const scales = artifact.scales as ScaleEvidence[];
  const expectedChecks = deriveBillionCellGateChecks(scales);
  const gate = record(artifact.gate, "gate");
  if (JSON.stringify(gate.checks) !== JSON.stringify(expectedChecks))
    invalid("gate checks do not match measured evidence");
  const expectedFailures = expectedChecks.filter((candidate) => !candidate.passed);
  if (JSON.stringify(gate.failures) !== JSON.stringify(expectedFailures))
    invalid("gate failures are incomplete");
  const expectedStatus = expectedFailures.length === 0 ? "passed" : "failed";
  exact(artifact.status, expectedStatus, "status");
  exact(gate.status, expectedStatus, "gate.status");
}

if (import.meta.main) {
  const artifact = await runBillionCellBenchmark();
  const output = new URL("../results/billion-cell-results.json", import.meta.url);
  await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
  const summary = {
    status: artifact.status,
    scales: artifact.scales.map((scale) => ({
      id: scale.id,
      logicalCells: scale.logicalCells,
      startupMedianMs: scenarioOf(scale, "construction").timing.medianMs,
      churnLoadedCells: scenarioOf(scale, "diagonal-churn-100").resources.loadedCleanCells,
      dirtyCells: scenarioOf(scale, "dirty-revisit-after-eviction").resources.dirtyCells,
    })),
    failures: artifact.gate.failures,
    output: output.pathname,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (artifact.status !== "passed") process.exitCode = 1;
}
