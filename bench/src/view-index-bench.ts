import { fullGC, heapStats } from "bun:jsc";
import { fileURLToPath } from "node:url";
import { StoreViewState } from "../../packages/core/src/store/view-state.js";
import type { RecomputingCellStore } from "../../packages/core/src/store/wasm-contract.js";
import type { Workbook } from "../../packages/core/src/types.js";
import { forceGc, now, summarize } from "./stats.js";

const ROWS = 1_000_000;
const ABSENT_ROW = 314_159;
const LOOKUP_BATCHES = 128;
const LOOKUPS_PER_BATCH = 4_096;
const REPEATS = 5;

type Engine = "map" | "packed";

interface RetainedMemory {
  readonly jscCellBytes: number;
  readonly jscExtraBytes: number;
  readonly jscTotalBytes: number;
  readonly processExternalBytes: number;
}

interface IndexMetrics {
  readonly coldBuildMs: number;
  readonly retained: RetainedMemory;
  readonly lookupMedianNs: number;
  readonly lookupP95Ns: number;
  readonly absentResult: number | null;
  readonly rebuildMs: number;
  readonly actualBackingBytes: number | null;
}

interface MemorySnapshot {
  readonly jscHeapSize: number;
  readonly jscExtraMemory: number;
  readonly processExternal: number;
}

function memorySnapshot(): MemorySnapshot {
  const jsc = heapStats();
  return {
    jscHeapSize: jsc.heapSize,
    jscExtraMemory: jsc.extraMemorySize,
    processExternal: process.memoryUsage().external,
  };
}

function retainedMemory(after: MemorySnapshot, before: MemorySnapshot): RetainedMemory {
  const jscTotalBytes = after.jscHeapSize - before.jscHeapSize;
  const jscExtraBytes = after.jscExtraMemory - before.jscExtraMemory;
  return {
    jscCellBytes: jscTotalBytes - jscExtraBytes,
    jscExtraBytes,
    jscTotalBytes,
    processExternalBytes: after.processExternal - before.processExternal,
  };
}

function collectGarbage(): void {
  forceGc();
  fullGC();
  forceGc();
}

function makeOrder(offset: number): Uint32Array {
  const order = new Uint32Array(ROWS - 1);
  let at = 0;
  for (let i = 0; i < ROWS; i++) {
    const row = (i + offset) % ROWS;
    if (row !== ABSENT_ROW) order[at++] = row;
  }
  return order;
}

function lookupSamples(lookup: (row: number) => number | null): {
  readonly medianNs: number;
  readonly p95Ns: number;
} {
  const rows = new Uint32Array(LOOKUPS_PER_BATCH);
  let state = 0x72_1f_5e_ed;
  for (let i = 0; i < rows.length; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    rows[i] = state % ROWS;
  }

  let checksum = 0;
  const samples = new Array<number>(LOOKUP_BATCHES);
  for (let batch = 0; batch < LOOKUP_BATCHES; batch++) {
    const started = now();
    for (let i = 0; i < rows.length; i++) checksum ^= lookup(rows[i]!) ?? 0xffff_ffff;
    samples[batch] = (now() - started) / rows.length;
  }
  if (checksum === 0x1_0000_0000) throw new Error("unreachable lookup checksum");

  const stats = summarize(samples);
  return { medianNs: stats.median * 1e6, p95Ns: stats.p95 * 1e6 };
}

class MapBaseline {
  private readonly orderBySheet = new Map<string, Uint32Array>();
  private readonly rowIndexBySheet = new Map<string, Map<number, number>>();

  setOrder(order: Uint32Array): void {
    this.orderBySheet.set("bench", order);
    this.rowIndexBySheet.delete("bench");
  }

  viewRowOf(sheet: string, dataRow: number): number | null {
    const order = this.orderBySheet.get(sheet);
    if (!order) return null;
    let index = this.rowIndexBySheet.get(sheet);
    if (!index) {
      index = new Map();
      for (let viewRow = 0; viewRow < order.length; viewRow++) {
        index.set(order[viewRow]!, viewRow);
      }
      this.rowIndexBySheet.set(sheet, index);
    }
    return index.get(dataRow) ?? null;
  }

  dispose(): void {
    this.orderBySheet.clear();
    this.rowIndexBySheet.clear();
  }
}

function productionView(
  rowCount: number,
  initialOrder: Uint32Array,
): {
  readonly view: StoreViewState;
  setOrder(order: Uint32Array): void;
} {
  let activeOrder = initialOrder;
  const wasm = {
    sortRowsMulti: () => activeOrder,
  } as unknown as RecomputingCellStore;
  const workbook: Workbook = {
    activeSheet: "bench",
    sheets: [
      {
        id: "bench",
        name: "Benchmark",
        rowCount,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        sortKeys: [{ col: 0, ascending: true }],
      },
    ],
  };
  const view = new StoreViewState(wasm, workbook, new Map([["bench", 0]]));
  view.metadataChanged("bench");
  return {
    view,
    setOrder(order) {
      activeOrder = order;
      view.metadataChanged("bench");
    },
  };
}

function runWorker(engine: Engine): IndexMetrics {
  const order = makeOrder(0);
  const rebuiltOrder = makeOrder(271_828);
  const map = engine === "map" ? new MapBaseline() : null;
  const packed = engine === "packed" ? productionView(ROWS, order) : null;
  map?.setOrder(order);

  collectGarbage();
  const before = memorySnapshot();
  const started = now();
  const first = map
    ? map.viewRowOf("bench", order[0]!)
    : packed!.view.viewRowOf("bench", order[0]!);
  if (first !== 0) throw new Error(`${engine} cold inverse build failed`);
  const coldBuildMs = now() - started;
  collectGarbage();
  const retained = retainedMemory(memorySnapshot(), before);
  const lookup = lookupSamples((row) =>
    map ? map.viewRowOf("bench", row) : packed!.view.viewRowOf("bench", row),
  );
  const absentResult = map
    ? map.viewRowOf("bench", ABSENT_ROW)
    : packed!.view.viewRowOf("bench", ABSENT_ROW);
  const actualBackingBytes = packed?.view.inverseIndexByteLength("bench") ?? null;

  map?.setOrder(rebuiltOrder);
  packed?.setOrder(rebuiltOrder);
  const rebuildStarted = now();
  const rebuilt = map
    ? map.viewRowOf("bench", rebuiltOrder[0]!)
    : packed!.view.viewRowOf("bench", rebuiltOrder[0]!);
  if (rebuilt !== 0) throw new Error(`${engine} inverse rebuild was stale`);
  const rebuildMs = now() - rebuildStarted;
  map?.dispose();
  packed?.view.dispose();

  return {
    coldBuildMs,
    retained,
    lookupMedianNs: lookup.medianNs,
    lookupP95Ns: lookup.p95Ns,
    absentResult,
    rebuildMs,
    actualBackingBytes,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function aggregate(samples: readonly IndexMetrics[]): IndexMetrics {
  return {
    coldBuildMs: median(samples.map((sample) => sample.coldBuildMs)),
    retained: {
      jscCellBytes: median(samples.map((sample) => sample.retained.jscCellBytes)),
      jscExtraBytes: median(samples.map((sample) => sample.retained.jscExtraBytes)),
      jscTotalBytes: median(samples.map((sample) => sample.retained.jscTotalBytes)),
      processExternalBytes: median(samples.map((sample) => sample.retained.processExternalBytes)),
    },
    lookupMedianNs: median(samples.map((sample) => sample.lookupMedianNs)),
    lookupP95Ns: median(samples.map((sample) => sample.lookupP95Ns)),
    absentResult: samples.every((sample) => sample.absentResult === null) ? null : -1,
    rebuildMs: median(samples.map((sample) => sample.rebuildMs)),
    actualBackingBytes: samples[0]!.actualBackingBytes,
  };
}

function spawnWorker(engine: Engine): IndexMetrics {
  const child = Bun.spawnSync({
    cmd: [process.execPath, fileURLToPath(import.meta.url), "--worker", engine],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) {
    throw new Error(
      `${engine} benchmark worker failed: ${child.stderr.toString() || child.stdout.toString()}`,
    );
  }
  return JSON.parse(child.stdout.toString()) as IndexMetrics;
}

function resourceScenarios(): {
  readonly denseBytes: number;
  readonly sparse: {
    readonly survivors: number;
    readonly backingBytes: number;
    readonly coldBuildMs: number;
    readonly lookupMedianNs: number;
    readonly lookupP95Ns: number;
  };
  readonly empty: {
    readonly survivors: 0;
    readonly backingBytes: number;
    readonly coldBuildMs: number;
  };
  readonly aggregate: {
    readonly sheets: number;
    readonly emptySheets: number;
    readonly sparseSheets: number;
    readonly logicalRows: number;
    readonly survivors: number;
    readonly backingBytes: number;
    readonly coldBuildMs: number;
  };
} {
  const sparseOrder = Uint32Array.from([ROWS - 1, 7, 12_345, 500_000]);
  const sparse = productionView(ROWS, sparseOrder);
  const sparseStarted = now();
  if (sparse.view.viewRowOf("bench", ROWS - 1) !== 0) throw new Error("sparse build failed");
  const sparseBuildMs = now() - sparseStarted;
  const sparseLookup = lookupSamples((row) => sparse.view.viewRowOf("bench", row));
  const sparseBytes = sparse.view.inverseIndexByteLength("bench");
  sparse.view.dispose();

  const empty = productionView(ROWS, new Uint32Array(0));
  const emptyStarted = now();
  if (empty.view.viewRowOf("bench", 0) !== null) throw new Error("empty build failed");
  const emptyBuildMs = now() - emptyStarted;
  const emptyBytes = empty.view.inverseIndexByteLength("bench");
  empty.view.dispose();

  const sheets = Array.from({ length: 256 }, (_, handle) => ({
    id: `s${handle}`,
    name: `Sheet ${handle}`,
    rowCount: ROWS,
    columns: [{ key: "value", header: "Value", width: 100, type: "number" as const }],
    sortKeys: [{ col: 0, ascending: true }],
  }));
  const workbook: Workbook = { activeSheet: "s0", sheets };
  const orders = sheets.map((_, handle) => (handle % 2 === 0 ? new Uint32Array(0) : sparseOrder));
  const handles = new Map(sheets.map((sheet, handle) => [sheet.id, handle]));
  const wasm = {
    sortRowsMulti: (handle: number) => orders[handle]!,
  } as unknown as RecomputingCellStore;
  const aggregateView = new StoreViewState(wasm, workbook, handles);
  const aggregateStarted = now();
  for (let handle = 0; handle < sheets.length; handle++) {
    const sheet = sheets[handle]!;
    aggregateView.metadataChanged(sheet.id);
    aggregateView.viewRowOf(sheet.id, ROWS - 1);
  }
  const aggregateBuildMs = now() - aggregateStarted;
  const aggregateBytes = sheets.reduce(
    (bytes, sheet) => bytes + aggregateView.inverseIndexByteLength(sheet.id),
    0,
  );
  aggregateView.dispose();

  return {
    denseBytes: ROWS * Uint32Array.BYTES_PER_ELEMENT,
    sparse: {
      survivors: sparseOrder.length,
      backingBytes: sparseBytes,
      coldBuildMs: sparseBuildMs,
      lookupMedianNs: sparseLookup.medianNs,
      lookupP95Ns: sparseLookup.p95Ns,
    },
    empty: { survivors: 0, backingBytes: emptyBytes, coldBuildMs: emptyBuildMs },
    aggregate: {
      sheets: sheets.length,
      emptySheets: 128,
      sparseSheets: 128,
      logicalRows: sheets.length * ROWS,
      survivors: 128 * sparseOrder.length,
      backingBytes: aggregateBytes,
      coldBuildMs: aggregateBuildMs,
    },
  };
}

function main(): void {
  const runs: Record<Engine, IndexMetrics[]> = { map: [], packed: [] };
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const order: readonly Engine[] = repeat % 2 === 0 ? ["map", "packed"] : ["packed", "map"];
    for (const engine of order) runs[engine].push(spawnWorker(engine));
  }

  const baseline = aggregate(runs.map);
  const packed = aggregate(runs.packed);
  const resources = resourceScenarios();
  const heapReduction = 1 - packed.retained.jscTotalBytes / baseline.retained.jscTotalBytes;
  const lookupP95Regression = packed.lookupP95Ns / baseline.lookupP95Ns - 1;
  const gates = {
    absentFilteredRow: baseline.absentResult === null && packed.absentResult === null,
    actualDenseStorage:
      packed.actualBackingBytes === resources.denseBytes && resources.denseBytes <= ROWS * 4,
    sparseStorage:
      resources.sparse.backingBytes > 0 && resources.sparse.backingBytes < resources.denseBytes,
    emptyStorage: resources.empty.backingBytes === 0,
    aggregateStorage: resources.aggregate.backingBytes === 128 * resources.sparse.backingBytes,
    heapReduction:
      baseline.retained.jscTotalBytes > 0 &&
      packed.retained.jscTotalBytes >= 0 &&
      heapReduction >= 0.5,
    lookupP95: lookupP95Regression <= 0.1,
    coldBuild: packed.coldBuildMs <= baseline.coldBuildMs,
  };

  console.log(
    JSON.stringify(
      {
        rows: ROWS,
        lookupsPerRun: LOOKUP_BATCHES * LOOKUPS_PER_BATCH,
        repeats: REPEATS,
        attribution:
          "Each engine run uses a fresh Bun process. JSC total is decomposed as cell bytes plus typed-array/external extra bytes; gates compare the raw repeated-run median totals without clamping.",
        baseline,
        packed,
        resources,
        heapReduction,
        lookupP95Regression,
        gates,
        runs,
      },
      null,
      2,
    ),
  );

  if (Object.values(gates).some((passed) => !passed)) process.exitCode = 1;
}

const workerEngine = process.argv[2] === "--worker" ? process.argv[3] : undefined;
if (workerEngine === "map" || workerEngine === "packed") {
  console.log(JSON.stringify(runWorker(workerEngine)));
} else {
  main();
}
