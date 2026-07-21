import "./dom-setup.js";
import { readFileSync } from "node:fs";
import {
  createGrid,
  createRuntimeResourceSnapshot,
  diffRuntimeResourcePhases,
  emptyStoreMemoryStats,
  IncompleteDataError,
  initSheetwrite,
  type Grid,
  type RowData,
  RUNTIME_RESOURCE_SCHEMA_VERSION,
  type RuntimeMemoryObservation,
  type RuntimeResourceOperation,
  type RuntimeResourcePhase,
  type RuntimeResourceSnapshot,
  type TransientResourcePeak,
  SheetwriteStore,
  toCsv,
  type Workbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { COLUMNS, type ColumnarDataset, makeColumnar, toSheetwriteColumnar } from "./dataset.js";
import type { BenchmarkMode } from "./gate-protocol.js";
import {
  RESOURCE_BENCHMARK_SCHEMA_VERSION,
  RESOURCE_FULL_SCENARIOS,
  RESOURCE_SMOKE_SCENARIOS,
  type ResourceBenchmarkArtifact,
  type ResourceScenarioId,
  type ResourceScenarioResult,
  validateResourceBenchmark,
} from "./resource-protocol.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const PAGED_ROWS = 1_000_000;
const CHUNK_ROWS = 4_096;
const CACHE_BYTES = 8 * 1024 * 1024;
const DIRTY_LIMIT = 1_000_000;

interface ResourceGrid extends Grid {
  getAutoFitResourceStats(): {
    readonly windowRequests: number;
  };
}

function workbook(rowCount: number, columnCount = COLUMNS.length): Workbook {
  return {
    activeSheet: "resource",
    sheets: [
      {
        id: "resource",
        name: "Resource benchmark",
        rowCount,
        columns: Array.from({ length: columnCount }, (_, col) => {
          const source = COLUMNS[col];
          return source
            ? { ...source }
            : { key: `c${col}`, header: `C${col}`, width: 100, type: "number" as const };
        }),
      },
    ],
  };
}

function numericRows(start: number, count: number, columns = COLUMNS.length): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row: RowData = {};
    for (let col = 0; col < columns; col++)
      row[COLUMNS[col]?.key ?? `c${col}`] = start + offset + col;
    return row;
  });
}

function runtimeMemory(): RuntimeMemoryObservation {
  const memory = process.memoryUsage();
  return {
    usedJSHeapSize: memory.heapUsed,
    arrayBufferBytes: memory.arrayBuffers,
    externalBytes: memory.external,
    browserBackingStoreBytes: null,
  };
}

function storeSnapshot(
  store: SheetwriteStore,
  operation: RuntimeResourceOperation,
  phase: RuntimeResourcePhase,
): RuntimeResourceSnapshot {
  return store.getRuntimeResourceSnapshot(operation, phase, runtimeMemory());
}

function gridSnapshot(
  grid: Grid,
  operation: RuntimeResourceOperation,
  phase: RuntimeResourcePhase,
): RuntimeResourceSnapshot {
  return grid.getRuntimeResourceSnapshot(operation, phase, runtimeMemory());
}

function emptySnapshot(
  operation: RuntimeResourceOperation,
  phase: RuntimeResourcePhase,
): RuntimeResourceSnapshot {
  return createRuntimeResourceSnapshot({
    operation,
    phase,
    wasm: emptyStoreMemoryStats(null),
    runtime: runtimeMemory(),
  });
}

function result(
  id: ResourceScenarioId,
  operation: RuntimeResourceOperation,
  started: number,
  phases: Readonly<Partial<Record<RuntimeResourcePhase, RuntimeResourceSnapshot>>>,
  sentinel: string,
  transientPeaks: readonly TransientResourcePeak[] = [],
): ResourceScenarioResult {
  const before = phases.before;
  const peak = phases.peak;
  const settled = phases.settled;
  if (!before || !peak || !settled) throw new Error(`${id} omitted a required phase`);
  return {
    id,
    operation,
    durationMs: performance.now() - started,
    phases,
    deltas: [diffRuntimeResourcePhases(before, peak), diffRuntimeResourcePhases(peak, settled)],
    transientPeaks,
    sentinel,
  };
}

function denseIngest(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "ingest" as const;
  const rows = mode === "smoke" ? 10_000 : 1_000_000;
  Bun.gc(true);
  const before = emptySnapshot(operation, "before");
  const started = performance.now();
  let input: ColumnarDataset | undefined = makeColumnar(rows);
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(input));
  const peak = storeSnapshot(store, operation, "peak");
  const sentinel = String(store.getCell({ sheet: "resource", row: rows - 1, col: 0 }).resolved);
  input = undefined;
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const measured = result("dense-ingest", operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function pagedStartup(): ResourceScenarioResult {
  const operation = "startup" as const;
  Bun.gc(true);
  const before = emptySnapshot(operation, "before");
  const started = performance.now();
  const store = new SheetwriteStore(workbook(PAGED_ROWS), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
    dirtyCellLimit: DIRTY_LIMIT,
  });
  const peak = storeSnapshot(store, operation, "peak");
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const measured = result(
    "paged-startup",
    operation,
    started,
    { before, peak, settled },
    `${store.getWorkbook().sheets[0]!.rowCount}:rows`,
  );
  store.dispose();
  return measured;
}

function pagedLoad(id: "first-page" | "deep-jump"): ResourceScenarioResult {
  const operation = id === "first-page" ? ("ingest" as const) : ("scroll" as const);
  const store = new SheetwriteStore(workbook(PAGED_ROWS), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
    dirtyCellLimit: DIRTY_LIMIT,
  });
  if (id === "deep-jump") store.loadRows("resource", 0, numericRows(0, 120));
  Bun.gc(true);
  const before = storeSnapshot(store, operation, "before");
  const started = performance.now();
  const start = id === "first-page" ? 0 : 742_000;
  store.withResourceOperation(operation, () =>
    store.loadRows("resource", start, numericRows(start, 120)),
  );
  const peak = storeSnapshot(store, operation, "peak");
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const sentinel = String(store.getCell({ sheet: "resource", row: start, col: 0 }).resolved);
  const measured = result(id, operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function dirtyEditClear(): ResourceScenarioResult {
  const operation = "dirty-clear" as const;
  const store = new SheetwriteStore(workbook(PAGED_ROWS), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
    dirtyCellLimit: DIRTY_LIMIT,
  });
  const patches = Array.from({ length: 100 }, (_, index) => ({
    op: "set" as const,
    addr: { sheet: "resource", row: index * 9_973, col: index % COLUMNS.length },
    value: { kind: "literal" as const, value: index % 2 === 0 ? index : `dirty-${index}` },
  }));
  Bun.gc(true);
  const before = storeSnapshot(store, operation, "before");
  const started = performance.now();
  const outcome = store.withResourceOperation(operation, () => store.applyTransaction({ patches }));
  if (outcome.status !== "applied") throw new Error(`dirty transaction ${outcome.status}`);
  const peak = storeSnapshot(store, operation, "peak");
  store.withResourceOperation(operation, () => store.acknowledgeOperations(patches));
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const sentinel = `${peak.wasm.owners.find((owner) => owner.owner === "wasm.paged.dirty-overlay")?.entries ?? 0}:dirty-entries`;
  const measured = result(
    "dirty-edit-clear",
    operation,
    started,
    { before, peak, settled },
    sentinel,
  );
  store.dispose();
  return measured;
}

function formulaRecompute(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "formula-recompute" as const;
  const rows = mode === "smoke" ? 500 : 100_000;
  const store = new SheetwriteStore(workbook(rows, 2));
  const patches = [
    ...Array.from({ length: rows }, (_, row) => ({
      op: "set" as const,
      addr: { sheet: "resource", row, col: 0 },
      value: { kind: "literal" as const, value: rows - row },
    })),
    {
      op: "set" as const,
      addr: { sheet: "resource", row: 0, col: 1 },
      value: { kind: "formula" as const, src: `=SORT(A1:A${rows})` },
    },
  ];
  Bun.gc(true);
  store.resetFormulaMatrixResourcePeak();
  const before = storeSnapshot(store, operation, "before");
  const started = performance.now();
  const outcome = store.withResourceOperation(operation, () => store.applyTransaction({ patches }));
  if (outcome.status !== "applied") throw new Error(`formula transaction ${outcome.status}`);
  const matrixPeak = store.getFormulaMatrixResourcePeak();
  const peak = storeSnapshot(store, operation, "peak");
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const sentinel = String(store.getCell({ sheet: "resource", row: 0, col: 1 }).resolved);
  const measured = result(
    "formula-recompute",
    operation,
    started,
    { before, peak, settled },
    sentinel,
    [matrixPeak],
  );
  store.dispose();
  return measured;
}

function exactAutoFit(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "auto-fit" as const;
  const rows = mode === "smoke" ? 10_000 : 100_000;
  let input: ColumnarDataset | undefined = makeColumnar(rows);
  const grid = createGrid(document.createElement("div"), {
    workbook: workbook(rows),
    data: toSheetwriteColumnar(input),
    config: { toolbar: false, tabs: false },
  }) as ResourceGrid;
  input = undefined;
  Bun.gc(true);
  const before = gridSnapshot(grid, operation, "before");
  const started = performance.now();
  grid.autoFitColumns([0]);
  const peak = gridSnapshot(grid, operation, "peak");
  Bun.gc(true);
  const settled = gridSnapshot(grid, operation, "settled");
  const sentinel = `${grid.getAutoFitResourceStats().windowRequests}:windows`;
  const measured = result(
    "exact-auto-fit",
    operation,
    started,
    { before, peak, settled },
    sentinel,
  );
  grid.destroy();
  return measured;
}

function exportScenario(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "export" as const;
  const rows = mode === "smoke" ? 1_000 : 100_000;
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  Bun.gc(true);
  const before = storeSnapshot(store, operation, "before");
  const started = performance.now();
  let exported: string | undefined = store.withResourceOperation(operation, () =>
    toCsv(store.getWorkbook().sheets[0]!, store),
  );
  const peak = storeSnapshot(store, operation, "peak");
  const sentinel = `${exported.length}:csv-bytes`;
  exported = undefined;
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const measured = result("export", operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function snapshotScenario(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "snapshot" as const;
  const rows = mode === "smoke" ? 1_000 : 100_000;
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  Bun.gc(true);
  const before = storeSnapshot(store, operation, "before");
  const started = performance.now();
  let snapshot: WorkbookSnapshot | undefined = store.withResourceOperation(operation, () =>
    store.exportSnapshot(),
  );
  const peak = storeSnapshot(store, operation, "peak");
  const sentinel = `${snapshot.sheets[0]!.columns.length}:columns`;
  snapshot = undefined;
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const measured = result("snapshot", operation, started, { before, peak, settled }, sentinel);
  store.dispose();
  return measured;
}

function sortFilterRefusal(): ResourceScenarioResult {
  const operation = "scroll" as const;
  const grid = createGrid(document.createElement("div"), {
    workbook: workbook(PAGED_ROWS),
    datasourceStorage: {
      mode: "paged",
      chunkRows: CHUNK_ROWS,
      cacheBytes: CACHE_BYTES,
      dirtyCellLimit: DIRTY_LIMIT,
    },
    config: { toolbar: false, tabs: false },
  });
  Bun.gc(true);
  const before = gridSnapshot(grid, operation, "before");
  const started = performance.now();
  let refusal = "";
  try {
    grid.setSort([{ col: 0, ascending: true }]);
  } catch (error) {
    if (!(error instanceof IncompleteDataError)) throw error;
    refusal = error.name;
  }
  if (!refusal) {
    try {
      grid.setColumnFilter(0, { kind: "contains", text: "blocked" });
    } catch (error) {
      if (!(error instanceof IncompleteDataError)) throw error;
      refusal = error.name;
    }
  }
  if (!refusal) throw new Error("incomplete sort/filter did not fail closed");
  const peak = gridSnapshot(grid, operation, "peak");
  Bun.gc(true);
  const settled = gridSnapshot(grid, operation, "settled");
  const measured = result(
    "sort-filter-refusal",
    operation,
    started,
    { before, peak, settled },
    refusal,
  );
  grid.destroy();
  return measured;
}

function teardown(mode: BenchmarkMode): ResourceScenarioResult {
  const operation = "teardown" as const;
  const rows = mode === "smoke" ? 10_000 : 100_000;
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  Bun.gc(true);
  const before = storeSnapshot(store, operation, "before");
  const peak = storeSnapshot(store, operation, "peak");
  const started = performance.now();
  store.dispose();
  Bun.gc(true);
  const settled = storeSnapshot(store, operation, "settled");
  const afterDestroy = storeSnapshot(store, operation, "after-destroy");
  return result(
    "teardown",
    operation,
    started,
    { before, peak, settled, "after-destroy": afterDestroy },
    `${settled.totals.logicalLiveBytes}:live-bytes`,
  );
}

async function runScenario(
  id: ResourceScenarioId,
  mode: BenchmarkMode,
): Promise<ResourceScenarioResult> {
  const bytes = readFileSync(WASM_PATH);
  await initSheetwrite(bytes);
  const restoreCanvas = installCanvasTestStubs();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callback(performance.now());
    return 0;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  try {
    switch (id) {
      case "dense-ingest":
        return denseIngest(mode);
      case "paged-startup":
        return pagedStartup();
      case "first-page":
      case "deep-jump":
        return pagedLoad(id);
      case "dirty-edit-clear":
        return dirtyEditClear();
      case "formula-recompute":
        return formulaRecompute(mode);
      case "exact-auto-fit":
        return exactAutoFit(mode);
      case "export":
        return exportScenario(mode);
      case "snapshot":
        return snapshotScenario(mode);
      case "sort-filter-refusal":
        return sortFilterRefusal();
      case "teardown":
        return teardown(mode);
    }
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    restoreCanvas();
  }
}

function parseScenario(stdout: string, id: ResourceScenarioId): ResourceScenarioResult {
  const line = stdout
    .trim()
    .split("\n")
    .filter((candidate) => candidate.startsWith("{"))
    .at(-1);
  if (!line) throw new Error(`${id} emitted no resource result`);
  const parsed = JSON.parse(line) as ResourceScenarioResult;
  if (parsed.id !== id) throw new Error(`${id} emitted ${parsed.id}`);
  return parsed;
}

function isolatedScenario(id: ResourceScenarioId, mode: BenchmarkMode): ResourceScenarioResult {
  const child = Bun.spawnSync(["bun", "run", import.meta.path, "--scenario", id, "--mode", mode], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) throw new Error(`${id} exited ${child.exitCode}`);
  return parseScenario(child.stdout.toString(), id);
}

function currentCommit(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error("could not resolve resource benchmark commit");
  return result.stdout.toString().trim();
}

async function runArtifact(mode: BenchmarkMode): Promise<void> {
  const ids = mode === "full" ? RESOURCE_FULL_SCENARIOS : RESOURCE_SMOKE_SCENARIOS;
  const scenarios = ids.map((id) => isolatedScenario(id, mode));
  const artifact: ResourceBenchmarkArtifact = {
    schemaVersion: RESOURCE_BENCHMARK_SCHEMA_VERSION,
    resourceSchemaVersion: RUNTIME_RESOURCE_SCHEMA_VERSION,
    mode,
    provenance: {
      commit: currentCommit(),
      runtime: `Bun ${Bun.version} ${process.platform}/${process.arch}`,
      forcedGcCheckpoints: ["before", "settled", "after-destroy"],
    },
    scenarios,
    optimizations: [],
  };
  validateResourceBenchmark(artifact, mode);
  if (mode === "full") {
    await Bun.write(
      new URL("../results/resource-results.json", import.meta.url),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(artifact));
}

if (import.meta.main) {
  const scenarioIndex = process.argv.indexOf("--scenario");
  const modeIndex = process.argv.indexOf("--mode");
  const mode: BenchmarkMode =
    (modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined) === "full" ? "full" : "smoke";
  const id = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : undefined;
  if (id && RESOURCE_FULL_SCENARIOS.includes(id as ResourceScenarioId)) {
    console.log(JSON.stringify(await runScenario(id as ResourceScenarioId, mode)));
  } else {
    await runArtifact(process.argv.includes("--smoke") ? "smoke" : "full");
  }
}
