import "./dom-setup.js";
import { readFileSync } from "node:fs";
import {
  createGrid,
  type DataSourcePage,
  type DataSourceRequest,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type Range,
  SheetwriteStore,
  type Workbook,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { initSync } from "@sheetwrite/wasm";
import { COLUMNS, makeColumnar, toSheetwriteColumnar } from "./dataset.js";
import {
  type BenchmarkMode,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
} from "./gate-protocol.js";
import {
  type RangeGateArtifact,
  type RangeStructuralResult,
  validateRangeArtifact,
} from "./range-gate.js";
import { summarize } from "./stats.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const SHEET = "range-bench";
const mode: BenchmarkMode = process.argv.includes("--smoke") ? "smoke" : "full";
const ROW_COUNTS = mode === "smoke" ? [10_000] : [10_000, 100_000, 1_000_000];

interface StoreAllocationStats {
  readonly documentOperations: number;
  readonly jsPatchObjects: number;
  readonly ffiCalls: number;
  readonly maxTransferredArrayLength: number;
  readonly distinctStyleIds: number;
  readonly historySnapshots: number;
  readonly historySnapshotBytes: number;
  readonly historyMaterializations: number;
  readonly historyDisposals: number;
  readonly styleDictionaryEntries: number;
}

interface StructuralObservation {
  readonly store?: StoreAllocationStats;
  readonly retainedRevisionPointsBefore?: number;
  readonly retainedRevisionRectanglesBefore?: number;
  readonly retainedRevisionPointsAfter?: number;
  readonly retainedRevisionRectanglesAfter?: number;
  readonly maxVisibleWindowCells?: number;
  readonly autoFitChunkCellLimit?: number;
  readonly visibleWindowRequests?: number;
  readonly scheduledChunks?: number;
  readonly historyBytes?: number;
  readonly ffiCalls?: number;
  readonly maxTransferredArrayLength?: number;
  readonly documentOperationCount?: number;
  readonly jsPatchObjectCount?: number;
}

type InstrumentedGrid = Grid & {
  getMutationRevisionStats(): {
    points: number;
    rectangles: number;
    retainedRequests: number;
    retainedRevisions: number;
  };
  getAutoFitResourceStats(): {
    chunkCellLimit: number;
    windowRequests: number;
    maxWindowCells: number;
    scheduledChunks: number;
    completedJobs: number;
    cancelledJobs: number;
    committedPatches: number;
  };
  resetAutoFitResourceStats(): void;
};

function workbook(rowCount: number): Workbook {
  return {
    activeSheet: SHEET,
    sheets: [
      {
        id: SHEET,
        name: "Range Bench",
        rowCount,
        columns: COLUMNS.map((column) => ({ ...column })),
      },
    ],
  };
}

async function profile(
  rows: number,
  workload: RangeStructuralResult["workload"],
  addressedCells: number,
  wasmMemory: WebAssembly.Memory,
  operation: () => StructuralObservation | Promise<StructuralObservation>,
): Promise<RangeStructuralResult> {
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  const wasmBefore = wasmMemory.buffer.byteLength;
  const start = performance.now();
  const observation = await operation();
  const timingSamplesMs = [performance.now() - start];
  Bun.gc(true);
  const store = observation.store;
  return {
    rows,
    workload,
    addressedCells,
    timingSamplesMs,
    timing: summarize(timingSamplesMs),
    heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - heapBefore),
    wasmDeltaBytes: Math.max(0, wasmMemory.buffer.byteLength - wasmBefore),
    documentOperationCount: observation.documentOperationCount ?? store?.documentOperations ?? 0,
    jsPatchObjectCount: observation.jsPatchObjectCount ?? store?.jsPatchObjects ?? 0,
    ffiCalls: observation.ffiCalls ?? store?.ffiCalls ?? 0,
    maxTransferredArrayLength:
      observation.maxTransferredArrayLength ?? store?.maxTransferredArrayLength ?? 0,
    retainedRevisionPointsBefore: observation.retainedRevisionPointsBefore ?? 0,
    retainedRevisionRectanglesBefore: observation.retainedRevisionRectanglesBefore ?? 0,
    retainedRevisionPointsAfter: observation.retainedRevisionPointsAfter ?? 0,
    retainedRevisionRectanglesAfter: observation.retainedRevisionRectanglesAfter ?? 0,
    maxVisibleWindowCells: observation.maxVisibleWindowCells ?? 0,
    autoFitChunkCellLimit: observation.autoFitChunkCellLimit ?? 0,
    visibleWindowRequests: observation.visibleWindowRequests ?? 0,
    scheduledChunks: observation.scheduledChunks ?? 0,
    historyBytes: observation.historyBytes ?? 0,
  };
}

async function storeWorkloads(
  rows: number,
  wasmMemory: WebAssembly.Memory,
): Promise<RangeStructuralResult[]> {
  const store = new SheetwriteStore(workbook(rows), toSheetwriteColumnar(makeColumnar(rows)));
  const results: RangeStructuralResult[] = [];
  const wholeColumn: Range = {
    sheet: SHEET,
    start: { row: 0, col: 0 },
    end: { row: rows - 1, col: 0 },
  };
  store.applyTransaction({
    patches: [
      {
        op: "setRangeStyle",
        range: { ...wholeColumn, end: { row: Math.floor(rows / 2) - 1, col: 0 } },
        style: { italic: true },
      },
    ],
  });
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "style merge and clear", rows, wasmMemory, () => {
      store.applyTransaction({
        patches: [{ op: "setRangeStyle", range: wholeColumn, style: { bold: true } }],
      });
      store.applyTransaction({
        patches: [{ op: "setRangeStyle", range: wholeColumn, style: null }],
      });
      return { store: store.getRangeMutationAllocationStats() };
    }),
  );

  const clearSnapshot = store.captureRangeHistory(wholeColumn);
  if (!clearSnapshot) throw new Error("range benchmark could not capture clear history");
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "range clear", rows, wasmMemory, () => {
      store.applyTransaction({
        patches: [{ op: "clearRange", range: wholeColumn, contents: true, style: false }],
      });
      return {
        store: store.getRangeMutationAllocationStats(),
        historyBytes: clearSnapshot.byteLength,
      };
    }),
  );
  clearSnapshot.dispose();

  const sparse: DocumentOp = {
    op: "setRange",
    range: {
      sheet: SHEET,
      start: { row: 0, col: 0 },
      end: { row: rows - 1, col: COLUMNS.length - 1 },
    },
    cells: [
      { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
      {
        rowOffset: Math.floor(rows / 2),
        colOffset: 2,
        value: { kind: "literal", value: "middle" },
      },
      {
        rowOffset: rows - 1,
        colOffset: COLUMNS.length - 1,
        value: { kind: "literal", value: "last" },
      },
    ],
  };
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "sparse setRange", sparse.cells.length, wasmMemory, () => {
      store.applyTransaction({ patches: [sparse] });
      return { store: store.getRangeMutationAllocationStats() };
    }),
  );

  const denseCells = Math.min(rows, 100_000);
  const dense: DocumentOp = {
    op: "setBlock",
    range: {
      sheet: SHEET,
      start: { row: 0, col: 1 },
      end: { row: denseCells - 1, col: 1 },
    },
    block: {
      rowCount: denseCells,
      colCount: 1,
      values: Array.from({ length: denseCells }, (_, index) => index + 0.5),
    },
  };
  store.resetRangeMutationAllocationStats();
  results.push(
    await profile(rows, "dense setBlock", denseCells, wasmMemory, () => {
      store.applyTransaction({ patches: [dense] });
      return { store: store.getRangeMutationAllocationStats() };
    }),
  );
  store.dispose();
  return results;
}

async function datasourceRevisionWorkload(
  rows: number,
  wasmMemory: WebAssembly.Memory,
): Promise<RangeStructuralResult> {
  return profile(rows, "datasource revision retention", rows, wasmMemory, async () => {
    const pending = Promise.withResolvers<DataSourcePage>();
    let request: DataSourceRequest | undefined;
    const grid = createGrid(document.createElement("div"), {
      workbook: workbook(rows),
      datasource: {
        getRows: (nextRequest) => {
          request = nextRequest;
          return pending.promise;
        },
      },
    }) as InstrumentedGrid;
    if (!request) throw new Error("range benchmark datasource request was not issued");
    const store = grid.store as SheetwriteStore;
    const denseCells = Math.min(rows, 1_000);
    const operations: DocumentOp[] = [
      {
        op: "setRange",
        range: {
          sheet: SHEET,
          start: { row: 0, col: 0 },
          end: { row: rows - 1, col: COLUMNS.length - 1 },
        },
        cells: [
          { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "first" } },
          {
            rowOffset: rows - 1,
            colOffset: COLUMNS.length - 1,
            value: { kind: "literal", value: "last" },
          },
        ],
      },
      {
        op: "setBlock",
        range: {
          sheet: SHEET,
          start: { row: 0, col: 1 },
          end: { row: denseCells - 1, col: 1 },
        },
        block: {
          rowCount: denseCells,
          colCount: 1,
          values: new Array(denseCells).fill(1),
        },
      },
      {
        op: "clearRange",
        range: {
          sheet: SHEET,
          start: { row: 0, col: COLUMNS.length - 1 },
          end: { row: rows - 1, col: COLUMNS.length - 1 },
        },
        contents: true,
        style: false,
      },
    ];
    store.resetRangeMutationAllocationStats();
    store.applyTransaction({ patches: operations });
    const before = grid.getMutationRevisionStats();
    const storeStats = store.getRangeMutationAllocationStats();
    pending.resolve({ start: request.start, rows: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const after = grid.getMutationRevisionStats();
    grid.destroy();
    return {
      store: storeStats,
      retainedRevisionPointsBefore: before.points,
      retainedRevisionRectanglesBefore: before.rectangles,
      retainedRevisionPointsAfter: after.points,
      retainedRevisionRectanglesAfter: after.rectangles,
    };
  });
}

async function autoFitWorkload(
  rows: number,
  wasmMemory: WebAssembly.Memory,
): Promise<RangeStructuralResult> {
  const targetColumns = rows === 10_000 ? [0, 1] : [0];
  return profile(rows, "large exact auto-fit", rows * targetColumns.length, wasmMemory, () => {
    const grid = createGrid(document.createElement("div"), {
      workbook: workbook(rows),
      data: toSheetwriteColumnar(makeColumnar(rows)),
    }) as InstrumentedGrid;
    const store = grid.store as SheetwriteStore;
    store.resetRangeMutationAllocationStats();
    grid.resetAutoFitResourceStats();
    grid.autoFitColumns(targetColumns);
    const autoFit = grid.getAutoFitResourceStats();
    const storeStats = store.getRangeMutationAllocationStats();
    if (autoFit.completedJobs !== 1 || autoFit.cancelledJobs !== 0) {
      throw new Error("range benchmark auto-fit did not complete exactly once");
    }
    grid.destroy();
    return {
      store: storeStats,
      ffiCalls: storeStats.ffiCalls + autoFit.windowRequests,
      maxTransferredArrayLength: Math.max(
        storeStats.maxTransferredArrayLength,
        autoFit.maxWindowCells,
      ),
      maxVisibleWindowCells: autoFit.maxWindowCells,
      autoFitChunkCellLimit: autoFit.chunkCellLimit,
      visibleWindowRequests: autoFit.windowRequests,
      scheduledChunks: autoFit.scheduledChunks,
    };
  });
}

const bytes = readFileSync(WASM_PATH);
await initSheetwrite(bytes);
const wasm = initSync({ module: bytes });
const restoreCanvas = installCanvasTestStubs();
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  callback(performance.now());
  return 0;
}) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

const results: RangeStructuralResult[] = [];
try {
  for (const rows of ROW_COUNTS) {
    results.push(...(await storeWorkloads(rows, wasm.memory)));
    results.push(await datasourceRevisionWorkload(rows, wasm.memory));
    results.push(await autoFitWorkload(rows, wasm.memory));
  }
} finally {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  restoreCanvas();
}

const artifact: RangeGateArtifact = {
  protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
  mode,
  matrixId: MATRIX_IDS.range[mode],
  results,
};
validateRangeArtifact(artifact, mode);

console.log(
  "| rows | workload | median ms | JS heap Δ | WASM Δ | doc ops | JS patches | FFI | max transfer | revision p/r before→after | max window | chunks |",
);
console.log("|---:|:--|---:|---:|---:|---:|---:|---:|---:|:--|---:|---:|");
for (const result of results) {
  console.log(
    `| ${result.rows.toLocaleString()} | ${result.workload} | ${result.timing.median.toFixed(2)} | ${result.heapDeltaBytes} | ${result.wasmDeltaBytes} | ${result.documentOperationCount} | ${result.jsPatchObjectCount} | ${result.ffiCalls} | ${result.maxTransferredArrayLength} | ${result.retainedRevisionPointsBefore}/${result.retainedRevisionRectanglesBefore}→${result.retainedRevisionPointsAfter}/${result.retainedRevisionRectanglesAfter} | ${result.maxVisibleWindowCells} | ${result.scheduledChunks} |`,
  );
}
console.log(JSON.stringify(artifact));
