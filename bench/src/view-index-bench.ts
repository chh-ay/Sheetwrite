import { fullGC, heapStats } from "bun:jsc";
import type { RecomputingCellStore } from "../../packages/core/src/store/wasm-contract.js";
import { StoreViewState } from "../../packages/core/src/store/view-state.js";
import type { Workbook } from "../../packages/core/src/types.js";
import { forceGc, now, summarize } from "./stats.js";

const ROWS = 1_000_000;
const ABSENT_ROW = 314_159;
const LOOKUP_BATCHES = 256;
const LOOKUPS_PER_BATCH = 4_096;

interface MemorySnapshot {
  readonly processHeapUsed: number;
  readonly jscHeapSize: number;
  readonly jscExtraMemory: number;
  readonly external: number;
  readonly arrayBuffers: number;
}

interface IndexMetrics {
  readonly coldBuildMs: number;
  readonly retained: MemorySnapshot;
  readonly lookupMedianNs: number;
  readonly lookupP95Ns: number;
  readonly absentResult: number | null;
  readonly rebuildMs: number;
}

function memorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  const jsc = heapStats();
  return {
    processHeapUsed: usage.heapUsed,
    jscHeapSize: jsc.heapSize,
    jscExtraMemory: jsc.extraMemorySize,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function memoryDelta(after: MemorySnapshot, before: MemorySnapshot): MemorySnapshot {
  return {
    processHeapUsed: after.processHeapUsed - before.processHeapUsed,
    jscHeapSize: after.jscHeapSize - before.jscHeapSize,
    jscExtraMemory: after.jscExtraMemory - before.jscExtraMemory,
    external: after.external - before.external,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
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
  private readonly orderBySheet = new Map<string, Uint32Array>([["bench", new Uint32Array(0)]]);
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

function runMapBaseline(order: Uint32Array, rebuiltOrder: Uint32Array): IndexMetrics {
  const view = new MapBaseline();
  view.setOrder(order);
  collectGarbage();
  const before = memorySnapshot();
  const started = now();
  if (view.viewRowOf("bench", order[0]!) !== 0) throw new Error("Map baseline build failed");
  const coldBuildMs = now() - started;
  collectGarbage();
  const retained = memoryDelta(memorySnapshot(), before);
  const lookup = lookupSamples((row) => view.viewRowOf("bench", row));
  const absentResult = view.viewRowOf("bench", ABSENT_ROW);

  view.setOrder(rebuiltOrder);
  const rebuildStarted = now();
  if (view.viewRowOf("bench", rebuiltOrder[0]!) !== 0) {
    throw new Error("Map baseline rebuild was stale");
  }
  const rebuildMs = now() - rebuildStarted;
  view.dispose();
  collectGarbage();

  return {
    coldBuildMs,
    retained,
    lookupMedianNs: lookup.medianNs,
    lookupP95Ns: lookup.p95Ns,
    absentResult,
    rebuildMs,
  };
}

function runStoreIndex(order: Uint32Array, rebuiltOrder: Uint32Array): IndexMetrics {
  let activeOrder = order;
  const wasm = {
    sortRowsMulti: () => activeOrder,
  } as unknown as RecomputingCellStore;
  const workbook: Workbook = {
    activeSheet: "bench",
    sheets: [
      {
        id: "bench",
        name: "Benchmark",
        rowCount: ROWS,
        columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        sortKeys: [{ col: 0, ascending: true }],
      },
    ],
  };
  const view = new StoreViewState(wasm, workbook, new Map([["bench", 0]]));
  view.metadataChanged("bench");

  collectGarbage();
  const before = memorySnapshot();
  const started = now();
  if (view.viewRowOf("bench", order[0]!) !== 0) throw new Error("cold inverse build failed");
  const coldBuildMs = now() - started;
  collectGarbage();
  const retained = memoryDelta(memorySnapshot(), before);
  const lookup = lookupSamples((row) => view.viewRowOf("bench", row));
  const absentResult = view.viewRowOf("bench", ABSENT_ROW);

  activeOrder = rebuiltOrder;
  view.metadataChanged("bench");
  const rebuildStarted = now();
  if (view.viewRowOf("bench", rebuiltOrder[0]!) !== 0) throw new Error("packed rebuild was stale");
  const rebuildMs = now() - rebuildStarted;
  view.dispose();
  collectGarbage();

  return {
    coldBuildMs,
    retained,
    lookupMedianNs: lookup.medianNs,
    lookupP95Ns: lookup.p95Ns,
    absentResult,
    rebuildMs,
  };
}

const order = makeOrder(0);
const rebuiltOrder = makeOrder(271_828);
const baseline = runMapBaseline(order, rebuiltOrder);
const packed = runStoreIndex(order, rebuiltOrder);
const packedBytes = ROWS * Uint32Array.BYTES_PER_ELEMENT;
const heapReduction = 1 - Math.max(0, packed.retained.jscHeapSize) / baseline.retained.jscHeapSize;
const lookupP95Regression = packed.lookupP95Ns / baseline.lookupP95Ns - 1;
const gates = {
  absentFilteredRow: baseline.absentResult === null && packed.absentResult === null,
  packedStorage: packedBytes <= ROWS * 4,
  heapReduction: baseline.retained.jscHeapSize > 0 && heapReduction >= 0.5,
  lookupP95: lookupP95Regression <= 0.1,
  coldBuild: packed.coldBuildMs <= baseline.coldBuildMs,
};

console.log(
  JSON.stringify(
    {
      rows: ROWS,
      lookups: LOOKUP_BATCHES * LOOKUPS_PER_BATCH,
      baseline,
      packed,
      packedBytes,
      heapReduction,
      lookupP95Regression,
      gates,
    },
    null,
    2,
  ),
);

if (Object.values(gates).some((passed) => !passed)) process.exitCode = 1;
