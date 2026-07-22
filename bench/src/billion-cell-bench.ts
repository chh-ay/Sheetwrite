import { DatasourceController } from "../../packages/core/src/datasource-controller.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import { SheetwriteStore } from "../../packages/core/src/store.js";
import type { DataSourcePage, DataSourceRequest, Workbook } from "../../packages/core/src/types.js";
import type {
  RuntimeMemoryObservation,
  RuntimeResourceOperation,
} from "../../packages/core/src/resource-accounting.js";

export const BILLION_CELL_BENCHMARK_SCHEMA_VERSION = 1 as const;
export const BILLION_CELL_ROWS = 1_000_000;
export const BILLION_CELL_COLUMNS = 1_000;
export const BILLION_CELL_LOGICAL_CELLS = BILLION_CELL_ROWS * BILLION_CELL_COLUMNS;
export const VISIBLE_TILE_ROWS = 120;
export const VISIBLE_TILE_COLUMNS = 20;
export const HORIZONTAL_TILE_AMPLIFICATION_LIMIT = 1;
export const BILLION_CELL_SCENARIOS = [
  "startup",
  "visible-tile",
  "deep-two-axis-jump",
  "distant-edits-100",
  "tile-churn-100",
] as const;

export type BillionCellScenarioId = (typeof BILLION_CELL_SCENARIOS)[number];
export type BillionCellGateStatus = "passed" | "blocked";
export type BillionCellScenarioStatus = "completed" | "blocked" | "not-run";
export type ComplexityClass = "O(rows)" | "O(columns)" | "O(rows×columns)" | "O(visited-tiles)";

export interface ComplexityEvidence {
  readonly component: string;
  readonly classification: ComplexityClass;
  readonly allocated: boolean;
  readonly explanation: string;
}

export interface ResourceCounters {
  readonly logicalCells: number;
  readonly loadedCells: number;
  readonly dirtyCells: number;
  readonly logicalMatrixAllocatedCells: number;
  readonly cleanAllocatedBytes: number;
  readonly dirtyAllocatedBytes: number;
  readonly retainedCells: number;
  readonly retainedChunks: number;
  readonly runtimeLogicalBytes: number;
  readonly runtimeAllocatedBytes: number;
  readonly wasmCommittedBytes: number | null;
  readonly jsHeapUsedBytes: number | null;
  readonly arrayBufferBytes: number | null;
  readonly externalBytes: number | null;
  readonly controllerLoadedBands: number;
  readonly controllerOwnedBands: number;
  readonly controllerVisibleWaitingRows: number;
}

export interface CrossingCounters {
  readonly datasourceRequests: number;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
  readonly totalCrossings: number;
}

export interface BillionCellScenarioEvidence {
  readonly id: BillionCellScenarioId;
  readonly status: BillionCellScenarioStatus;
  readonly wallTimeMs: number | null;
  readonly operationCount: number;
  readonly crossings: CrossingCounters;
  readonly resources: ResourceCounters;
  readonly complexity: readonly ComplexityClass[];
  readonly parameters: Readonly<Record<string, number | string>>;
  readonly stopReason: string | null;
}

export interface RequestGeometry {
  readonly sheet: string;
  readonly start: number;
  readonly end: number;
  readonly requestedRows: number;
  readonly selectedColumns: null;
  readonly fullWidthAddressableColumns: number;
  readonly fullWidthAddressableCells: number;
  readonly requestKeys: readonly string[];
}

export interface BillionCellBenchmarkArtifact {
  readonly schemaVersion: typeof BILLION_CELL_BENCHMARK_SCHEMA_VERSION;
  readonly status: BillionCellGateStatus;
  readonly runtime: {
    readonly engine: "bun";
    readonly version: string;
    readonly platform: string;
    readonly architecture: string;
    readonly initializationMs: number;
    readonly heapBeforeStartupBytes: number | null;
    readonly heapAfterStartupBytes: number | null;
  };
  readonly dimensions: {
    readonly rows: number;
    readonly columns: number;
    readonly logicalCells: number;
    readonly visibleTileRows: number;
    readonly visibleTileColumns: number;
    readonly visibleTileCells: number;
  };
  readonly protocol: {
    readonly requestContract: "row-only";
    readonly hasColumnSelector: false;
    readonly actualRequestKeys: readonly string[];
    readonly requests: readonly RequestGeometry[];
    readonly visibleRequest: RequestGeometry;
    readonly controllerResidencyProbe: {
      readonly startColumn: number;
      readonly endColumn: number;
    };
    readonly visibleCells: number;
    readonly fullWidthAddressableCells: number;
    readonly fullWidthAddressableCellsPerVisibleCell: number;
    readonly amplificationLimit: number;
    readonly boundedHorizontalTileExpressible: boolean;
    readonly returnedRows: number;
    readonly returnedCellKeys: number;
  };
  readonly complexity: readonly ComplexityEvidence[];
  readonly scenarios: readonly BillionCellScenarioEvidence[];
  readonly gate: {
    readonly status: BillionCellGateStatus;
    readonly blockedBeforePageAllocation: boolean;
    readonly blocker: {
      readonly scenario: "visible-tile";
      readonly code: "row-only-horizontal-amplification";
      readonly metric: "fullWidthAddressableCellsPerVisibleCell";
      readonly actual: number;
      readonly limit: number;
      readonly visibleCells: number;
      readonly fullWidthAddressableCells: number;
      readonly reason: string;
    } | null;
  };
}

const EXPECTED_REQUEST_KEYS = ["end", "revision", "sheet", "signal", "start"] as const;
const STOP_REASON =
  "DataSourceRequest exposes only the row interval {start,end}; a 120-row request on the 1,000-column sheet has a 120,000-cell full-width addressable area for a 2,400-cell visible tile (50× amplification, limit 1×), so a bounded horizontal tile cannot be expressed.";

function workbook(): Workbook {
  return {
    activeSheet: "billion",
    sheets: [
      {
        id: "billion",
        name: "BillionCellGate",
        rowCount: BILLION_CELL_ROWS,
        columns: Array.from({ length: BILLION_CELL_COLUMNS }, (_, column) => ({
          key: `c${column}`,
          header: `C${column}`,
          width: 96,
          type: "number" as const,
        })),
      },
    ],
  };
}

function runtimeMemory(): RuntimeMemoryObservation {
  const usage = process.memoryUsage();
  return {
    usedJSHeapSize: Number.isFinite(usage.heapUsed) ? usage.heapUsed : null,
    arrayBufferBytes: Number.isFinite(usage.arrayBuffers) ? usage.arrayBuffers : null,
    externalBytes: Number.isFinite(usage.external) ? usage.external : null,
    browserBackingStoreBytes: null,
  };
}

function collectResources(
  store: SheetwriteStore,
  operation: RuntimeResourceOperation,
  controller: DatasourceController | null,
): { resources: ResourceCounters; crossings: CrossingCounters } {
  const paged = store.getPagedStats("billion");
  const snapshot = store.getRuntimeResourceSnapshot(operation, "settled", runtimeMemory());
  const boundary = snapshot.boundary.find((candidate) => candidate.operation === operation);
  if (!boundary) throw new Error(`Missing ${operation} boundary counters`);
  const telemetry = controller?.getTelemetry();
  const datasourceRequests = telemetry?.requests ?? 0;
  return {
    resources: {
      logicalCells: BILLION_CELL_LOGICAL_CELLS,
      loadedCells: paged.loadedCells,
      dirtyCells: paged.dirtyCells,
      logicalMatrixAllocatedCells: paged.loadedCells + paged.dirtyCells,
      cleanAllocatedBytes: paged.allocatedBytes,
      dirtyAllocatedBytes: paged.dirtyAllocatedBytes,
      retainedCells: paged.loadedCells + paged.dirtyCells,
      retainedChunks: paged.chunks,
      runtimeLogicalBytes: snapshot.totals.logicalLiveBytes,
      runtimeAllocatedBytes: snapshot.totals.allocatedCapacityBytes,
      wasmCommittedBytes: snapshot.wasm.wasmCommittedBytes,
      jsHeapUsedBytes: snapshot.runtime.usedJSHeapSize,
      arrayBufferBytes: snapshot.runtime.arrayBufferBytes,
      externalBytes: snapshot.runtime.externalBytes,
      controllerLoadedBands: telemetry?.loadedBands ?? 0,
      controllerOwnedBands: telemetry?.ownedBands ?? 0,
      controllerVisibleWaitingRows: telemetry?.visibleWaitingRows ?? 0,
    },
    crossings: {
      datasourceRequests,
      ffiCalls: boundary.ffiCalls,
      jsToWasmBytes: boundary.jsToWasmBytes,
      wasmToJsBytes: boundary.wasmToJsBytes,
      bulkCalls: boundary.bulkCalls,
      scalarCalls: boundary.scalarCalls,
      totalCrossings: datasourceRequests + boundary.ffiCalls,
    },
  };
}

function requestGeometry(request: DataSourceRequest): RequestGeometry {
  const requestedRows = request.end - request.start;
  return {
    sheet: request.sheet,
    start: request.start,
    end: request.end,
    requestedRows,
    selectedColumns: null,
    fullWidthAddressableColumns: BILLION_CELL_COLUMNS,
    fullWidthAddressableCells: requestedRows * BILLION_CELL_COLUMNS,
    requestKeys: Object.keys(request).sort(),
  };
}

async function settleAborts(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function skippedScenario(
  id: Exclude<BillionCellScenarioId, "startup" | "visible-tile">,
  resources: ResourceCounters,
  parameters: Readonly<Record<string, number | string>>,
): BillionCellScenarioEvidence {
  return {
    id,
    status: "not-run",
    wallTimeMs: null,
    operationCount: 0,
    crossings: {
      datasourceRequests: 0,
      ffiCalls: 0,
      jsToWasmBytes: 0,
      wasmToJsBytes: 0,
      bulkCalls: 0,
      scalarCalls: 0,
      totalCrossings: 0,
    },
    resources,
    complexity: ["O(visited-tiles)"],
    parameters,
    stopReason: STOP_REASON,
  };
}

export async function runBillionCellBenchmark(): Promise<BillionCellBenchmarkArtifact> {
  const initializationStarted = performance.now();
  await initSheetwrite();
  const initializationMs = performance.now() - initializationStarted;
  Bun.gc(true);
  const heapBeforeStartupBytes = runtimeMemory().usedJSHeapSize;

  const requests: RequestGeometry[] = [];
  let store: SheetwriteStore | null = null;
  let controller: DatasourceController | null = null;
  try {
    const startupStarted = performance.now();
    store = new SheetwriteStore(workbook(), undefined, { storage: "paged" });
    controller = new DatasourceController(
      {
        datasource: (request) => {
          requests.push(requestGeometry(request));
          return new Promise<DataSourcePage>((resolve) => {
            const finish = () => resolve({ start: request.start, rows: [] });
            if (request.signal.aborted) finish();
            else request.signal.addEventListener("abort", finish, { once: true });
          });
        },
        loadable: store,
        activeSheet: () => "billion",
        rowCount: () => BILLION_CELL_ROWS,
        revision: () => 0,
        isCellNewerThan: () => false,
        retainRevision: () => () => {},
        onRowsLoaded: () => {},
        onError: (_request, error) => {
          throw error;
        },
        now: () => performance.now(),
      },
      BILLION_CELL_ROWS,
    );
    const startupWallTimeMs = performance.now() - startupStarted;
    const startupMeasurement = collectResources(store, "startup", controller);
    const heapAfterStartupBytes = runtimeMemory().usedJSHeapSize;

    const admissionStarted = performance.now();
    store.withResourceOperation("scroll", () => {
      controller!.updateViewport(0, VISIBLE_TILE_ROWS);
    });
    const admissionWallTimeMs = performance.now() - admissionStarted;
    const admissionMeasurement = collectResources(store, "scroll", controller);
    const visibleRequest = requests.find(
      (request) => request.start === 0 && request.end === VISIBLE_TILE_ROWS,
    );
    if (!visibleRequest)
      throw new Error("DatasourceController did not emit the visible row request");

    const visibleCells = VISIBLE_TILE_ROWS * VISIBLE_TILE_COLUMNS;
    const fullWidthAddressableCells = visibleRequest.fullWidthAddressableCells;
    const amplification = fullWidthAddressableCells / visibleCells;
    const actualRequestKeys = [
      ...new Set(requests.flatMap((request) => request.requestKeys)),
    ].sort();
    const scenarios: BillionCellScenarioEvidence[] = [
      {
        id: "startup",
        status: "completed",
        wallTimeMs: startupWallTimeMs,
        operationCount: 1,
        crossings: startupMeasurement.crossings,
        resources: startupMeasurement.resources,
        complexity: ["O(columns)"],
        parameters: { rows: BILLION_CELL_ROWS, columns: BILLION_CELL_COLUMNS },
        stopReason: null,
      },
      {
        id: "visible-tile",
        status: "blocked",
        wallTimeMs: admissionWallTimeMs,
        operationCount: 1,
        crossings: admissionMeasurement.crossings,
        resources: admissionMeasurement.resources,
        complexity: ["O(rows×columns)", "O(visited-tiles)"],
        parameters: {
          rowStart: 0,
          columnStart: 0,
          rows: VISIBLE_TILE_ROWS,
          visibleColumns: VISIBLE_TILE_COLUMNS,
        },
        stopReason: STOP_REASON,
      },
      skippedScenario("deep-two-axis-jump", admissionMeasurement.resources, {
        rowStart: BILLION_CELL_ROWS - VISIBLE_TILE_ROWS,
        columnStart: BILLION_CELL_COLUMNS - VISIBLE_TILE_COLUMNS,
        rows: VISIBLE_TILE_ROWS,
        visibleColumns: VISIBLE_TILE_COLUMNS,
      }),
      skippedScenario("distant-edits-100", admissionMeasurement.resources, {
        edits: 100,
        distribution: "uniform-across-both-axes",
      }),
      skippedScenario("tile-churn-100", admissionMeasurement.resources, {
        tiles: 100,
        rowsPerTile: VISIBLE_TILE_ROWS,
        visibleColumnsPerTile: VISIBLE_TILE_COLUMNS,
      }),
    ];

    const artifact: BillionCellBenchmarkArtifact = {
      schemaVersion: BILLION_CELL_BENCHMARK_SCHEMA_VERSION,
      status: "blocked",
      runtime: {
        engine: "bun",
        version: Bun.version,
        platform: process.platform,
        architecture: process.arch,
        initializationMs,
        heapBeforeStartupBytes,
        heapAfterStartupBytes,
      },
      dimensions: {
        rows: BILLION_CELL_ROWS,
        columns: BILLION_CELL_COLUMNS,
        logicalCells: BILLION_CELL_LOGICAL_CELLS,
        visibleTileRows: VISIBLE_TILE_ROWS,
        visibleTileColumns: VISIBLE_TILE_COLUMNS,
        visibleTileCells: visibleCells,
      },
      protocol: {
        requestContract: "row-only",
        hasColumnSelector: false,
        actualRequestKeys,
        requests,
        visibleRequest,
        controllerResidencyProbe: { startColumn: 0, endColumn: BILLION_CELL_COLUMNS - 1 },
        visibleCells,
        fullWidthAddressableCells,
        fullWidthAddressableCellsPerVisibleCell: amplification,
        amplificationLimit: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
        boundedHorizontalTileExpressible: false,
        returnedRows: 0,
        returnedCellKeys: 0,
      },
      complexity: [
        {
          component: "logical-row-coordinate-space",
          classification: "O(rows)",
          allocated: false,
          explanation:
            "One million row addresses are logical; no row-sized resident array is created.",
        },
        {
          component: "column-schema",
          classification: "O(columns)",
          allocated: true,
          explanation: "The 1,000 column descriptors are resident schema state.",
        },
        {
          component: "logical-matrix-cardinality",
          classification: "O(rows×columns)",
          allocated: false,
          explanation: "One billion cells are addressable but the logical matrix is not allocated.",
        },
        {
          component: "paged-residency",
          classification: "O(visited-tiles)",
          allocated: false,
          explanation: "No page is admitted; retained chunks and matrix cells remain zero at STOP.",
        },
      ],
      scenarios,
      gate: {
        status: "blocked",
        blockedBeforePageAllocation: true,
        blocker: {
          scenario: "visible-tile",
          code: "row-only-horizontal-amplification",
          metric: "fullWidthAddressableCellsPerVisibleCell",
          actual: amplification,
          limit: HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
          visibleCells,
          fullWidthAddressableCells,
          reason: STOP_REASON,
        },
      },
    };
    validateBillionCellBenchmark(artifact);
    return artifact;
  } finally {
    controller?.destroy();
    await settleAborts();
    store?.dispose();
  }
}

function fail(message: string): never {
  throw new Error(`Invalid billion-cell benchmark artifact: ${message}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} missing`);
  return value as Record<string, unknown>;
}

function assertFiniteNumbers(value: unknown, path = "artifact"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++)
      assertFiniteNumbers(value[index], `${path}[${index}]`);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) assertFiniteNumbers(child, `${path}.${key}`);
  }
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite non-negative number`);
  }
  return value;
}

function exactNumber(value: unknown, expected: number, label: string): void {
  if (value !== expected) fail(`${label} must equal ${expected}`);
}

function validateResources(value: unknown, label: string): void {
  const resources = asRecord(value, label);
  exactNumber(resources.logicalCells, BILLION_CELL_LOGICAL_CELLS, `${label}.logicalCells`);
  const loaded = nonNegativeInteger(resources.loadedCells, `${label}.loadedCells`);
  const dirty = nonNegativeInteger(resources.dirtyCells, `${label}.dirtyCells`);
  const allocated = nonNegativeInteger(
    resources.logicalMatrixAllocatedCells,
    `${label}.logicalMatrixAllocatedCells`,
  );
  if (allocated !== loaded + dirty) fail(`${label}.logicalMatrixAllocatedCells is inconsistent`);
  if (allocated !== 0)
    fail(`${label} allocated logical matrix cells before architecture admission`);
  for (const field of [
    "cleanAllocatedBytes",
    "dirtyAllocatedBytes",
    "retainedCells",
    "retainedChunks",
    "runtimeLogicalBytes",
    "runtimeAllocatedBytes",
    "controllerLoadedBands",
    "controllerOwnedBands",
    "controllerVisibleWaitingRows",
  ] as const) {
    nonNegativeInteger(resources[field], `${label}.${field}`);
  }
  for (const field of [
    "wasmCommittedBytes",
    "jsHeapUsedBytes",
    "arrayBufferBytes",
    "externalBytes",
  ] as const) {
    const observed = resources[field];
    if (observed !== null) nonNegativeInteger(observed, `${label}.${field}`);
  }
  exactNumber(resources.retainedCells, 0, `${label}.retainedCells`);
  exactNumber(resources.retainedChunks, 0, `${label}.retainedChunks`);
}

function validateCrossings(value: unknown, label: string): void {
  const crossings = asRecord(value, label);
  const datasourceRequests = nonNegativeInteger(
    crossings.datasourceRequests,
    `${label}.datasourceRequests`,
  );
  const ffiCalls = nonNegativeInteger(crossings.ffiCalls, `${label}.ffiCalls`);
  for (const field of ["jsToWasmBytes", "wasmToJsBytes", "bulkCalls", "scalarCalls"] as const) {
    nonNegativeInteger(crossings[field], `${label}.${field}`);
  }
  const totalCrossings = nonNegativeInteger(crossings.totalCrossings, `${label}.totalCrossings`);
  if (totalCrossings !== datasourceRequests + ffiCalls) {
    fail(`${label}.totalCrossings is inconsistent`);
  }
}

export function validateBillionCellBenchmark(
  value: unknown,
): asserts value is BillionCellBenchmarkArtifact {
  assertFiniteNumbers(value);
  const artifact = asRecord(value, "artifact");
  exactNumber(artifact.schemaVersion, BILLION_CELL_BENCHMARK_SCHEMA_VERSION, "schemaVersion");
  const dimensions = asRecord(artifact.dimensions, "dimensions");
  exactNumber(dimensions.rows, BILLION_CELL_ROWS, "dimensions.rows");
  exactNumber(dimensions.columns, BILLION_CELL_COLUMNS, "dimensions.columns");
  exactNumber(dimensions.logicalCells, BILLION_CELL_LOGICAL_CELLS, "dimensions.logicalCells");
  exactNumber(dimensions.visibleTileRows, VISIBLE_TILE_ROWS, "dimensions.visibleTileRows");
  exactNumber(dimensions.visibleTileColumns, VISIBLE_TILE_COLUMNS, "dimensions.visibleTileColumns");
  exactNumber(
    dimensions.visibleTileCells,
    VISIBLE_TILE_ROWS * VISIBLE_TILE_COLUMNS,
    "dimensions.visibleTileCells",
  );

  const runtime = asRecord(artifact.runtime, "runtime");
  finiteNonNegative(runtime.initializationMs, "runtime.initializationMs");
  for (const field of ["heapBeforeStartupBytes", "heapAfterStartupBytes"] as const) {
    if (runtime[field] !== null) nonNegativeInteger(runtime[field], `runtime.${field}`);
  }

  if (!Array.isArray(artifact.scenarios)) fail("scenarios missing");
  if (artifact.scenarios.length !== BILLION_CELL_SCENARIOS.length) {
    fail(`scenarios must contain exactly ${BILLION_CELL_SCENARIOS.length} entries`);
  }
  const scenarios = new Map<string, Record<string, unknown>>();
  for (const [index, candidate] of artifact.scenarios.entries()) {
    const scenario = asRecord(candidate, `scenarios[${index}]`);
    if (
      typeof scenario.id !== "string" ||
      !BILLION_CELL_SCENARIOS.includes(scenario.id as BillionCellScenarioId)
    ) {
      fail(`scenarios[${index}].id is not declared`);
    }
    if (scenarios.has(scenario.id)) fail(`duplicate scenario ${scenario.id}`);
    scenarios.set(scenario.id, scenario);
    validateResources(scenario.resources, `scenario ${scenario.id} resources`);
    validateCrossings(scenario.crossings, `scenario ${scenario.id} crossings`);
    nonNegativeInteger(scenario.operationCount, `scenario ${scenario.id} operationCount`);
  }
  for (const id of BILLION_CELL_SCENARIOS) {
    if (!scenarios.has(id)) fail(`missing scenario ${id}`);
  }

  const startup = scenarios.get("startup")!;
  if (startup.status !== "completed" || startup.stopReason !== null) fail("startup must complete");
  finiteNonNegative(startup.wallTimeMs, "startup.wallTimeMs");
  exactNumber(startup.operationCount, 1, "startup.operationCount");
  const visible = scenarios.get("visible-tile")!;
  if (visible.status !== "blocked" || visible.stopReason !== STOP_REASON) {
    fail("visible-tile must contain the architecture STOP");
  }
  finiteNonNegative(visible.wallTimeMs, "visible-tile.wallTimeMs");
  exactNumber(visible.operationCount, 1, "visible-tile.operationCount");
  for (const id of BILLION_CELL_SCENARIOS.slice(2)) {
    const scenario = scenarios.get(id)!;
    if (
      scenario.status !== "not-run" ||
      scenario.wallTimeMs !== null ||
      scenario.stopReason !== STOP_REASON
    ) {
      fail(`${id} must be marked not-run after STOP`);
    }
    exactNumber(scenario.operationCount, 0, `${id}.operationCount`);
    const crossings = asRecord(scenario.crossings, `${id}.crossings`);
    exactNumber(crossings.totalCrossings, 0, `${id}.crossings.totalCrossings`);
  }

  if (!Array.isArray(artifact.complexity)) fail("complexity evidence missing");
  const classes = new Set(
    artifact.complexity.map(
      (entry, index) => asRecord(entry, `complexity[${index}]`).classification,
    ),
  );
  for (const classification of ["O(rows)", "O(columns)", "O(rows×columns)", "O(visited-tiles)"]) {
    if (!classes.has(classification)) fail(`complexity evidence missing ${classification}`);
  }

  const protocol = asRecord(artifact.protocol, "protocol");
  if (protocol.requestContract !== "row-only" || protocol.hasColumnSelector !== false) {
    fail("protocol must record the actual row-only DataSourceRequest contract");
  }
  const actualRequestKeys = protocol.actualRequestKeys;
  if (!Array.isArray(actualRequestKeys)) fail("protocol.actualRequestKeys missing");
  if (
    actualRequestKeys.length !== EXPECTED_REQUEST_KEYS.length ||
    EXPECTED_REQUEST_KEYS.some((key, index) => actualRequestKeys[index] !== key)
  ) {
    fail(`protocol request keys must be ${EXPECTED_REQUEST_KEYS.join(",")}`);
  }
  if (!Array.isArray(protocol.requests) || protocol.requests.length === 0) {
    fail("protocol requests missing");
  }
  for (const [index, candidate] of protocol.requests.entries()) {
    const request = asRecord(candidate, `protocol.requests[${index}]`);
    const start = nonNegativeInteger(request.start, `protocol.requests[${index}].start`);
    const end = nonNegativeInteger(request.end, `protocol.requests[${index}].end`);
    if (end <= start) fail(`protocol.requests[${index}] has an empty row interval`);
    exactNumber(request.requestedRows, end - start, `protocol.requests[${index}].requestedRows`);
    if (request.selectedColumns !== null)
      fail(`protocol.requests[${index}] fabricated a column selector`);
    exactNumber(
      request.fullWidthAddressableColumns,
      BILLION_CELL_COLUMNS,
      `protocol.requests[${index}].fullWidthAddressableColumns`,
    );
    exactNumber(
      request.fullWidthAddressableCells,
      (end - start) * BILLION_CELL_COLUMNS,
      `protocol.requests[${index}].fullWidthAddressableCells`,
    );
  }
  const visibleRequest = asRecord(protocol.visibleRequest, "protocol.visibleRequest");
  exactNumber(visibleRequest.start, 0, "protocol.visibleRequest.start");
  exactNumber(visibleRequest.end, VISIBLE_TILE_ROWS, "protocol.visibleRequest.end");
  const visibleCells = VISIBLE_TILE_ROWS * VISIBLE_TILE_COLUMNS;
  const fullWidthAddressableCells = VISIBLE_TILE_ROWS * BILLION_CELL_COLUMNS;
  const amplification = fullWidthAddressableCells / visibleCells;
  exactNumber(protocol.visibleCells, visibleCells, "protocol.visibleCells");
  exactNumber(
    protocol.fullWidthAddressableCells,
    fullWidthAddressableCells,
    "protocol.fullWidthAddressableCells",
  );
  exactNumber(
    protocol.fullWidthAddressableCellsPerVisibleCell,
    amplification,
    "protocol.fullWidthAddressableCellsPerVisibleCell",
  );
  exactNumber(
    protocol.amplificationLimit,
    HORIZONTAL_TILE_AMPLIFICATION_LIMIT,
    "protocol.amplificationLimit",
  );
  if (protocol.boundedHorizontalTileExpressible !== false) {
    fail("row-only request amplification cannot claim a bounded horizontal tile");
  }
  exactNumber(protocol.returnedRows, 0, "protocol.returnedRows");
  exactNumber(protocol.returnedCellKeys, 0, "protocol.returnedCellKeys");
  const residencyProbe = asRecord(
    protocol.controllerResidencyProbe,
    "protocol.controllerResidencyProbe",
  );
  exactNumber(residencyProbe.startColumn, 0, "protocol.controllerResidencyProbe.startColumn");
  exactNumber(
    residencyProbe.endColumn,
    BILLION_CELL_COLUMNS - 1,
    "protocol.controllerResidencyProbe.endColumn",
  );

  const visibleCrossings = asRecord(visible.crossings, "visible-tile.crossings");
  exactNumber(
    visibleCrossings.datasourceRequests,
    protocol.requests.length,
    "visible-tile datasource request crossings",
  );

  if (artifact.status !== "blocked") fail("row-only amplification must fail closed as blocked");
  const gate = asRecord(artifact.gate, "gate");
  if (gate.status !== "blocked" || gate.blockedBeforePageAllocation !== true) {
    fail("gate must block before page allocation");
  }
  const blocker = asRecord(gate.blocker, "gate.blocker");
  if (
    blocker.scenario !== "visible-tile" ||
    blocker.code !== "row-only-horizontal-amplification" ||
    blocker.metric !== "fullWidthAddressableCellsPerVisibleCell" ||
    blocker.reason !== STOP_REASON
  ) {
    fail("gate blocker does not identify the row-only amplification STOP");
  }
  exactNumber(blocker.actual, amplification, "gate.blocker.actual");
  exactNumber(blocker.limit, HORIZONTAL_TILE_AMPLIFICATION_LIMIT, "gate.blocker.limit");
  exactNumber(blocker.visibleCells, visibleCells, "gate.blocker.visibleCells");
  exactNumber(
    blocker.fullWidthAddressableCells,
    fullWidthAddressableCells,
    "gate.blocker.fullWidthAddressableCells",
  );
}

if (import.meta.main) {
  const artifact = await runBillionCellBenchmark();
  const output = new URL("../results/billion-cell-results.json", import.meta.url);
  await Bun.write(output, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(artifact)}\n`);
  process.stderr.write(
    `billion-cell gate ${artifact.status}: ${artifact.gate.blocker?.actual}× full-width addressable amplification; wrote ${output.pathname}\n`,
  );
}
