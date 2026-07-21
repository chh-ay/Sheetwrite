import { readFileSync } from "node:fs";
import {
  initSheetwrite,
  type DocumentOp,
  type RowData,
  SheetwriteStore,
  type Workbook,
} from "@sheetwrite/core";
import { initSync } from "@sheetwrite/wasm";
import {
  assertFiniteNonNegative,
  assertGateIdentity,
  type BenchmarkMode,
  type GateIdentity,
  MATRIX_IDS,
  PERFORMANCE_GATE_PROTOCOL_VERSION,
  validateExactMatrix,
  validateRawStat,
} from "./gate-protocol.js";
import { type Stat, summarize } from "./stats.js";

export const PAGED_FULL_ROWS = 1_000_000;
export const PAGED_SMOKE_ROWS = 10_000;
const COLUMNS = 5;
const FULL_RUNS = 12;
const SMOKE_RUNS = 2;
const PAGE_ROWS = 120;
const CHUNK_ROWS = 4096;
const CACHE_BYTES = 32 * 1024 * 1024;
function chunkBytes(chunkRows: number): number {
  return (
    chunkRows * (1 + Float64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT) +
    Math.ceil(chunkRows / 64) * BigUint64Array.BYTES_PER_ELEMENT
  );
}
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const WIDE_PAGE_COLUMNS = 256;
const CACHE_CHURN_CHUNK_ROWS = 4;
const CACHE_CHURN_PAGES = 2048;
const CACHE_CHURN_RETAINED_CHUNKS = 512;
const CACHE_CHURN_CHUNK_BYTES = chunkBytes(CACHE_CHURN_CHUNK_ROWS);
const CACHE_CHURN_BUDGET_BYTES = CACHE_CHURN_RETAINED_CHUNKS * CACHE_CHURN_CHUNK_BYTES;
const DIRTY_100_BASELINE_BYTES = 5_427_200;
const DIRTY_COUNTS = [100, 10_000] as const;
export const PAGED_SCENARIOS = [
  "empty",
  "padding",
  "viewport",
  "scroll-1",
  "scroll-10",
  "scroll-100",
  "dirty-100",
  "dirty-10000",
] as const;
export const PAGED_SMOKE_SCENARIOS = ["empty", "viewport", "dirty-100"] as const;
export const PAGED_WORKLOADS = [
  "startup",
  "first-page",
  "distant-page",
  "wide-page",
  "cache-churn",
] as const;
export type PagedScenario = (typeof PAGED_SCENARIOS)[number];
export type PagedWorkload = (typeof PAGED_WORKLOADS)[number];

export interface ProbeResult {
  readonly scenario: PagedScenario;
  readonly wasmDeltaBytes: number;
  readonly chunks: number;
  readonly loadedCells: number;
  readonly dirtyCells: number;
  readonly allocatedBytes: number;
  readonly dirtyAllocatedBytes: number;
  readonly retainedBytes: number;
  readonly fullyLoaded: boolean;
}

function dirtyCount(scenario: PagedScenario): number | undefined {
  if (!scenario.startsWith("dirty-")) return undefined;
  const count = Number(scenario.slice("dirty-".length));
  return DIRTY_COUNTS.includes(count as (typeof DIRTY_COUNTS)[number]) ? count : undefined;
}

export interface PagedTimingResult {
  readonly samplesMs: readonly number[];
  readonly stat: Stat;
}

export interface PagedBenchmarkResult extends GateIdentity {
  readonly rows: number;
  readonly columns: number;
  readonly runs: number;
  readonly pageRows: number;
  readonly cacheBudgetBytes: number;
  readonly chunkRows: number;
  readonly denseLogicalBytes: number;
  readonly widePageColumns: number;
  readonly cacheChurnPages: number;
  readonly cacheChurnBudgetBytes: number;
  readonly cacheChurnRetainedChunks: number;
  readonly timings: Readonly<Record<PagedWorkload, PagedTimingResult>>;
  readonly peakAllocatedBytes: number;
  readonly peakChunks: number;
  readonly probes: readonly ProbeResult[];
}

export function pagedMatrixKey(
  rows: number,
  kind: "workload" | "probe",
  id: PagedWorkload | PagedScenario,
): string {
  return `rows=${rows};${kind}=${id}`;
}

export function expectedPagedMatrixKeys(mode: BenchmarkMode): string[] {
  const rows = mode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const scenarios = mode === "smoke" ? PAGED_SMOKE_SCENARIOS : PAGED_SCENARIOS;
  return [
    ...PAGED_WORKLOADS.map((workload) => pagedMatrixKey(rows, "workload", workload)),
    ...scenarios.map((scenario) => pagedMatrixKey(rows, "probe", scenario)),
  ];
}

export function validatePagedBenchmark(
  result: PagedBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): void {
  assertGateIdentity("paged", expectedMode, result);
  const expectedRows = expectedMode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const expectedRuns = expectedMode === "smoke" ? SMOKE_RUNS : FULL_RUNS;
  if (
    result.rows !== expectedRows ||
    result.columns !== COLUMNS ||
    result.runs !== expectedRuns ||
    result.pageRows !== PAGE_ROWS ||
    result.cacheBudgetBytes !== CACHE_BYTES ||
    result.chunkRows !== CHUNK_ROWS ||
    result.denseLogicalBytes !== expectedRows * COLUMNS * (1 + 8 + 4) ||
    result.widePageColumns !== WIDE_PAGE_COLUMNS ||
    result.cacheChurnPages !== CACHE_CHURN_PAGES ||
    result.cacheChurnBudgetBytes !== CACHE_CHURN_BUDGET_BYTES ||
    result.cacheChurnRetainedChunks !== CACHE_CHURN_RETAINED_CHUNKS
  ) {
    throw new Error(`paged ${expectedMode} configuration does not match its declared protocol`);
  }

  const observed = [
    ...Object.keys(result.timings).map((workload) =>
      pagedMatrixKey(result.rows, "workload", workload as PagedWorkload),
    ),
    ...result.probes.map((probe) => pagedMatrixKey(result.rows, "probe", probe.scenario)),
  ];
  validateExactMatrix("paged", expectedPagedMatrixKeys(expectedMode), observed);

  for (const workload of PAGED_WORKLOADS) {
    const key = pagedMatrixKey(result.rows, "workload", workload);
    const timing = result.timings[workload];
    validateRawStat(timing.samplesMs, timing.stat, key);
    if (timing.samplesMs.length !== expectedRuns) {
      throw new Error(`${key} must contain ${expectedRuns} raw samples`);
    }
    if (timing.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }

  assertFiniteNonNegative(result.peakAllocatedBytes, "paged.peakAllocatedBytes");
  assertFiniteNonNegative(result.peakChunks, "paged.peakChunks");
  if (
    !Number.isInteger(result.peakAllocatedBytes) ||
    !Number.isInteger(result.peakChunks) ||
    result.peakAllocatedBytes > result.cacheBudgetBytes
  ) {
    throw new Error("paged peak resource counters violate the declared cache budget");
  }
  if (result.peakAllocatedBytes !== result.peakChunks * chunkBytes(result.chunkRows)) {
    throw new Error("paged peak allocation does not match its retained chunk count");
  }
  const logicalCells = result.rows * result.columns;
  for (const probe of result.probes) {
    const key = pagedMatrixKey(result.rows, "probe", probe.scenario);
    for (const field of [
      "wasmDeltaBytes",
      "chunks",
      "loadedCells",
      "dirtyCells",
      "allocatedBytes",
      "dirtyAllocatedBytes",
      "retainedBytes",
    ] as const) {
      assertFiniteNonNegative(probe[field], `${key}.${field}`);
    }
    if (
      !Number.isInteger(probe.wasmDeltaBytes) ||
      !Number.isInteger(probe.chunks) ||
      !Number.isInteger(probe.loadedCells) ||
      !Number.isInteger(probe.dirtyCells) ||
      !Number.isInteger(probe.allocatedBytes) ||
      !Number.isInteger(probe.dirtyAllocatedBytes) ||
      !Number.isInteger(probe.retainedBytes)
    ) {
      throw new Error(`${key} resource counters must be integers`);
    }
    if (
      probe.loadedCells > logicalCells ||
      probe.dirtyCells > probe.loadedCells ||
      probe.allocatedBytes > result.cacheBudgetBytes
    ) {
      throw new Error(`${key} resource counters violate the declared logical/cache bounds`);
    }
    if (probe.retainedBytes !== probe.allocatedBytes + probe.dirtyAllocatedBytes) {
      throw new Error(`${key}.retainedBytes does not match clean plus dirty allocation`);
    }
    if (probe.allocatedBytes !== probe.chunks * chunkBytes(result.chunkRows)) {
      throw new Error(`${key}.allocatedBytes does not match its retained chunk count`);
    }
    if (probe.wasmDeltaBytes >= 1024 * 1024 * 1024) {
      throw new Error(`${key} exceeded the 1 GiB WASM safety ceiling`);
    }
    if (
      (probe.scenario === "empty" || probe.scenario === "padding") &&
      (probe.loadedCells !== 0 || probe.dirtyCells !== 0)
    ) {
      throw new Error(`${key} violated the empty-store allocation invariant`);
    }
    if (probe.scenario === "viewport" && probe.loadedCells !== 30 * COLUMNS) {
      throw new Error(`${key} did not load exactly the declared viewport`);
    }
    if (
      probe.scenario === "scroll-1" &&
      probe.loadedCells !== Math.floor(result.rows * 0.01) * COLUMNS
    ) {
      throw new Error(`${key} did not load exactly the declared one-percent traversal`);
    }
    if (
      probe.scenario === "scroll-10" &&
      probe.loadedCells !== Math.floor(result.rows * 0.1) * COLUMNS
    ) {
      throw new Error(`${key} did not load exactly the declared ten-percent traversal`);
    }
    if (probe.scenario === "scroll-100") {
      const totalChunks = Math.ceil(result.rows / result.chunkRows) * COLUMNS;
      const retainedChunks = Math.min(
        totalChunks,
        Math.floor(CACHE_BYTES / chunkBytes(result.chunkRows)),
      );
      const finalChunkRows = result.rows % result.chunkRows;
      const retainedPartialChunks = finalChunkRows === 0 ? 0 : Math.min(COLUMNS, retainedChunks);
      const expectedLoadedCells =
        retainedChunks * result.chunkRows -
        retainedPartialChunks * (result.chunkRows - finalChunkRows);
      if (probe.chunks !== retainedChunks || probe.loadedCells !== expectedLoadedCells) {
        throw new Error(`${key} does not match the cache-bounded full traversal`);
      }
    }
    const expectedDirty = dirtyCount(probe.scenario);
    if (expectedDirty !== undefined && probe.dirtyCells !== expectedDirty) {
      throw new Error(`${key} did not preserve exactly ${expectedDirty} dirty cells`);
    }
    if (probe.fullyLoaded !== (probe.loadedCells === logicalCells)) {
      throw new Error(`${key}.fullyLoaded does not match the retained cell evidence`);
    }
  }

  const dirty100 = result.probes.find((probe) => probe.scenario === "dirty-100");
  if (
    dirty100 &&
    (dirty100.allocatedBytes !== 0 ||
      dirty100.dirtyAllocatedBytes === 0 ||
      dirty100.retainedBytes > 1024 * 1024 ||
      dirty100.retainedBytes > DIRTY_100_BASELINE_BYTES * 0.2)
  ) {
    throw new Error("paged dirty-100 did not meet the sparse-overlay 1 MiB / 80% reduction gate");
  }
  const dirty10000 = result.probes.find((probe) => probe.scenario === "dirty-10000");
  if (dirty100 && dirty10000) {
    const smallBytesPerCell = dirty100.dirtyAllocatedBytes / 100;
    const largeBytesPerCell = dirty10000.dirtyAllocatedBytes / 10_000;
    if (
      dirty10000.allocatedBytes !== 0 ||
      largeBytesPerCell < smallBytesPerCell * 0.5 ||
      largeBytesPerCell > smallBytesPerCell * 1.5
    ) {
      throw new Error("paged dirty-10000 did not retain near-linear dirty bytes per cell");
    }
  }
}

function workbook(rowCount: number, columnCount = COLUMNS): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: `${rowCount.toLocaleString("en-US")} rows`,
        rowCount,
        columns: Array.from({ length: columnCount }, (_, col) => ({
          key: `c${col}`,
          header: `Column ${col + 1}`,
          width: 120,
          type: "number",
        })),
      },
    ],
  };
}

function rows(start: number, count = PAGE_ROWS): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row = start + offset;
    return { c0: row, c1: row + 1, c2: row + 2, c3: row + 3, c4: row + 4 };
  });
}

function wideRows(start: number, count: number): RowData[] {
  return Array.from({ length: count }, (_, offset) => {
    const row: RowData = {};
    for (let col = 0; col < WIDE_PAGE_COLUMNS; col++) row[`c${col}`] = start + offset + col;
    return row;
  });
}

function loadFraction(
  store: SheetwriteStore,
  fraction: number,
  rowCount: number,
  chunkRows: number,
): void {
  const limit = Math.floor(rowCount * fraction);
  for (let start = 0; start < limit; start += chunkRows) {
    store.loadRows("s1", start, rows(start, Math.min(chunkRows, limit - start)));
  }
}

function isScenario(value: string | undefined): value is PagedScenario {
  return PAGED_SCENARIOS.some((scenario) => scenario === value);
}

function dirtyPatches(count: number, rowCount: number): DocumentOp[] {
  return Array.from({ length: count }, (_, index): DocumentOp => {
    const addr = {
      sheet: "s1",
      row: Math.floor((index * rowCount) / count),
      col: index % COLUMNS,
    };
    const style =
      index % 3 === 0
        ? { bold: true }
        : index % 3 === 1
          ? { italic: true, color: "#2457c5" }
          : { underline: true, backgroundColor: "#edf2ff" };
    switch (index % 5) {
      case 0:
        return { op: "set", addr, value: { kind: "literal", value: index }, style };
      case 1:
        return { op: "set", addr, value: { kind: "literal", value: `dirty-${index}` }, style };
      case 2:
        return { op: "set", addr, value: { kind: "formula", src: `=${index}+1` }, style };
      case 3:
        return {
          op: "set",
          addr,
          value: { kind: "ref", target: { sheet: "s1", row: 0, col: 0 } },
          style,
        };
      default:
        return {
          op: "set",
          addr,
          value: { kind: "literal", value: index % 2 === 0 },
          style,
        };
    }
  });
}

function verifyDirtySemantics(
  store: SheetwriteStore,
  rowCount: number,
  patches: readonly DocumentOp[],
): void {
  const stringPatch = patches[1];
  const formulaPatch = patches[2];
  const refPatch = patches[3];
  if (
    stringPatch?.op !== "set" ||
    formulaPatch?.op !== "set" ||
    refPatch?.op !== "set" ||
    store.getCell(stringPatch.addr).resolved !== "dirty-1" ||
    store.getFormula(formulaPatch.addr) !== "=2+1" ||
    store.getCell(formulaPatch.addr).resolved !== 3 ||
    store.getRefTarget(refPatch.addr)?.row !== 0 ||
    store.getCell(stringPatch.addr).style.italic !== true
  ) {
    throw new Error("dirty rich-cell read/formula/ref/style semantics changed");
  }

  store.loadRows("s1", stringPatch.addr.row, [
    { c0: -1, c1: "server-overwrite", c2: -1, c3: -1, c4: -1 },
  ]);
  if (
    store.getCell(stringPatch.addr).resolved !== "dirty-1" ||
    store.getCellLoadState(stringPatch.addr) !== "local-edit"
  ) {
    throw new Error("dirty local value lost a hydration collision");
  }

  const revisionAddr = { sheet: "s1", row: rowCount - 1, col: COLUMNS - 1 };
  const first: DocumentOp = {
    op: "set",
    addr: revisionAddr,
    value: { kind: "literal", value: "revision-one" },
  };
  const second: DocumentOp = {
    op: "set",
    addr: revisionAddr,
    value: { kind: "literal", value: "revision-two" },
  };
  store.applyTransaction({ patches: [first] });
  store.applyTransaction({ patches: [second] });
  store.acknowledgeOperations([first]);
  if (
    store.getCell(revisionAddr).resolved !== "revision-two" ||
    store.getCellLoadState(revisionAddr) !== "local-edit"
  ) {
    throw new Error("stale acknowledgement cleaned a newer dirty revision");
  }
  store.acknowledgeOperations([second]);
  if (store.getCellLoadState(revisionAddr) === "local-edit") {
    throw new Error("matching acknowledgement did not clean its dirty revision");
  }

  const historyRange = {
    sheet: "s1",
    start: { row: revisionAddr.row, col: revisionAddr.col },
    end: { row: revisionAddr.row, col: revisionAddr.col },
  };
  const history = store.captureRangeHistory(historyRange);
  if (!history) throw new Error("dirty undo snapshot was not captured");
  store.applyTransaction({
    patches: [
      {
        op: "set",
        addr: revisionAddr,
        value: { kind: "literal", value: "after-history" },
      },
    ],
  });
  store.applyTransaction({ patches: [history.toDocumentOp(historyRange)] });
  history.dispose();
  if (store.getCell(revisionAddr).resolved !== "revision-two") {
    throw new Error("dirty undo snapshot did not restore its rich cell");
  }

  const persisted = new SheetwriteStore(workbook(2), undefined, {
    storage: "paged",
    chunkRows: 4,
    cacheBytes: CACHE_BYTES,
  });
  persisted.loadRows("s1", 0, rows(0, 2));
  persisted.applyTransaction({
    patches: patches.slice(0, 4).map((patch, index) =>
      patch.op === "set"
        ? {
            ...patch,
            addr: { ...patch.addr, row: 0, col: index },
            ...(patch.value.kind === "ref"
              ? { value: { ...patch.value, target: { sheet: "s1", row: 1, col: 0 } } }
              : {}),
          }
        : patch,
    ),
  });
  const snapshot = persisted.exportSnapshot();
  const restored = SheetwriteStore.fromSnapshot(snapshot, {
    storage: "paged",
    chunkRows: 4,
    cacheBytes: CACHE_BYTES,
  });
  if (
    restored.getCell({ sheet: "s1", row: 0, col: 1 }).resolved !== "dirty-1" ||
    restored.getFormula({ sheet: "s1", row: 0, col: 2 }) !== "=2+1" ||
    restored.getRefTarget({ sheet: "s1", row: 0, col: 3 })?.row !== 1
  ) {
    throw new Error("dirty values/formulas/refs did not survive snapshot persistence");
  }
  restored.dispose();
  persisted.dispose();
}

async function runProbe(
  scenario: PagedScenario,
  rowCount: number,
  chunkRows: number,
  admissionOnly: boolean,
): Promise<ProbeResult> {
  const bytes = readFileSync(WASM_PATH);
  await initSheetwrite(bytes);
  const wasm = initSync({ module: bytes });
  Bun.gc(true);
  const wasmBefore = wasm.memory.buffer.byteLength;
  const store = new SheetwriteStore(workbook(rowCount), undefined, {
    storage: "paged",
    chunkRows,
    cacheBytes: CACHE_BYTES,
  });
  let patches: DocumentOp[] = [];

  if (scenario === "viewport") {
    store.loadRows("s1", 0, rows(0, 30));
  } else if (scenario === "scroll-1") {
    loadFraction(store, 0.01, rowCount, chunkRows);
  } else if (scenario === "scroll-10") {
    loadFraction(store, 0.1, rowCount, chunkRows);
  } else if (scenario === "scroll-100") {
    loadFraction(store, 1, rowCount, chunkRows);
  } else {
    const count = dirtyCount(scenario);
    if (count !== undefined) {
      patches = dirtyPatches(count, rowCount);
      const outcome = store.applyTransaction({ patches });
      if (outcome.status !== "applied") {
        throw new Error(`${scenario} dirty transaction was ${outcome.status}`);
      }
    }
  }

  Bun.gc(true);
  const stats = store.getPagedStats("s1");
  const dirtyAllocatedBytes =
    "dirtyAllocatedBytes" in stats && typeof stats.dirtyAllocatedBytes === "number"
      ? stats.dirtyAllocatedBytes
      : 0;
  const result = {
    scenario,
    wasmDeltaBytes: wasm.memory.buffer.byteLength - wasmBefore,
    ...stats,
    dirtyAllocatedBytes,
    retainedBytes: stats.allocatedBytes + dirtyAllocatedBytes,
  };
  if (store.getWorkbook().sheets.length !== 1) {
    throw new Error("benchmark store was optimized away");
  }
  if (!admissionOnly && patches.length > 0) verifyDirtySemantics(store, rowCount, patches);
  store.dispose();
  return result;
}

function parseProbe(stdout: string, scenario: PagedScenario): ProbeResult {
  const line = stdout
    .trim()
    .split("\n")
    .filter((candidate) => candidate.trim().startsWith("{"))
    .at(-1);
  if (!line) throw new Error(`missing ${scenario} probe output`);
  const value: unknown = JSON.parse(line);
  if (
    !value ||
    typeof value !== "object" ||
    !("scenario" in value) ||
    value.scenario !== scenario ||
    !("wasmDeltaBytes" in value) ||
    typeof value.wasmDeltaBytes !== "number" ||
    !("chunks" in value) ||
    typeof value.chunks !== "number" ||
    !("loadedCells" in value) ||
    typeof value.loadedCells !== "number" ||
    !("dirtyCells" in value) ||
    typeof value.dirtyCells !== "number" ||
    !("allocatedBytes" in value) ||
    typeof value.allocatedBytes !== "number" ||
    !("dirtyAllocatedBytes" in value) ||
    typeof value.dirtyAllocatedBytes !== "number" ||
    !("retainedBytes" in value) ||
    typeof value.retainedBytes !== "number" ||
    !("fullyLoaded" in value) ||
    typeof value.fullyLoaded !== "boolean"
  ) {
    throw new Error(`invalid ${scenario} probe output`);
  }
  return {
    scenario,
    wasmDeltaBytes: value.wasmDeltaBytes,
    chunks: value.chunks,
    loadedCells: value.loadedCells,
    dirtyCells: value.dirtyCells,
    allocatedBytes: value.allocatedBytes,
    dirtyAllocatedBytes: value.dirtyAllocatedBytes,
    retainedBytes: value.retainedBytes,
    fullyLoaded: value.fullyLoaded,
  };
}

function isolatedProbe(
  scenario: PagedScenario,
  rowCount: number,
  chunkRows: number,
  admissionOnly: boolean,
): ProbeResult {
  const process = Bun.spawnSync(
    [
      "bun",
      "run",
      import.meta.path,
      "--probe",
      scenario,
      "--rows",
      String(rowCount),
      "--chunk-rows",
      String(chunkRows),
      ...(admissionOnly ? ["--admission"] : []),
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  if (process.exitCode !== 0) throw new Error(`${scenario} probe exited ${process.exitCode}`);
  return parseProbe(process.stdout.toString(), scenario);
}

async function runBenchmark(
  mode: BenchmarkMode,
  chunkRows: number,
  prototype: boolean,
): Promise<void> {
  await initSheetwrite();
  const rowCount = mode === "smoke" ? PAGED_SMOKE_ROWS : PAGED_FULL_ROWS;
  const runs = mode === "smoke" ? SMOKE_RUNS : FULL_RUNS;
  const scenarios = mode === "smoke" ? PAGED_SMOKE_SCENARIOS : PAGED_SCENARIOS;
  const startup: number[] = [];
  const firstPage: number[] = [];
  const distantPage: number[] = [];
  const widePage: readonly RowData[] = wideRows(0, PAGE_ROWS);
  const churnPages: ReadonlyArray<readonly RowData[]> = Array.from(
    { length: CACHE_CHURN_PAGES },
    (_, page) => rows(page * CACHE_CHURN_CHUNK_ROWS, CACHE_CHURN_CHUNK_ROWS),
  );
  const widePageMs: number[] = [];
  const cacheChurnMs: number[] = [];
  let cacheChurnRetainedChunks = 0;
  let peakAllocatedBytes = 0;
  let peakChunks = 0;
  for (let run = 0; run < runs; run++) {
    let started = performance.now();
    const store = new SheetwriteStore(workbook(rowCount), undefined, {
      storage: "paged",
      chunkRows,
      cacheBytes: CACHE_BYTES,
    });
    startup.push(performance.now() - started);

    started = performance.now();
    store.loadRows("s1", 0, rows(0));
    firstPage.push(performance.now() - started);

    const distantStart = Math.floor(rowCount / 2);
    started = performance.now();
    store.loadRows("s1", distantStart, rows(distantStart));
    distantPage.push(performance.now() - started);

    const stats = store.getPagedStats("s1");
    peakAllocatedBytes = Math.max(peakAllocatedBytes, stats.allocatedBytes);
    peakChunks = Math.max(peakChunks, stats.chunks);
    store.dispose();

    const wideStore = new SheetwriteStore(workbook(rowCount, WIDE_PAGE_COLUMNS), undefined, {
      storage: "paged",
      chunkRows,
      cacheBytes: CACHE_BYTES,
    });
    started = performance.now();
    wideStore.loadRows("s1", 0, widePage);
    widePageMs.push(performance.now() - started);
    wideStore.dispose();

    const churnStore = new SheetwriteStore(workbook(rowCount), undefined, {
      storage: "paged",
      chunkRows: CACHE_CHURN_CHUNK_ROWS,
      cacheBytes: CACHE_CHURN_BUDGET_BYTES,
    });
    started = performance.now();
    for (let page = 0; page < churnPages.length; page++) {
      churnStore.loadRows("s1", page * CACHE_CHURN_CHUNK_ROWS, churnPages[page]!);
    }
    cacheChurnMs.push(performance.now() - started);
    cacheChurnRetainedChunks = Math.max(
      cacheChurnRetainedChunks,
      churnStore.getPagedStats("s1").chunks,
    );
    churnStore.dispose();
  }

  const probes = scenarios.map((scenario) =>
    isolatedProbe(scenario, rowCount, chunkRows, prototype),
  );
  const result: PagedBenchmarkResult = {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.paged[mode],
    rows: rowCount,
    columns: COLUMNS,
    runs,
    pageRows: PAGE_ROWS,
    cacheBudgetBytes: CACHE_BYTES,
    chunkRows,
    denseLogicalBytes: rowCount * COLUMNS * (1 + 8 + 4),
    widePageColumns: WIDE_PAGE_COLUMNS,
    cacheChurnPages: CACHE_CHURN_PAGES,
    cacheChurnBudgetBytes: CACHE_CHURN_BUDGET_BYTES,
    cacheChurnRetainedChunks,
    timings: {
      startup: { samplesMs: startup, stat: summarize(startup) },
      "first-page": { samplesMs: firstPage, stat: summarize(firstPage) },
      "distant-page": { samplesMs: distantPage, stat: summarize(distantPage) },
      "wide-page": { samplesMs: widePageMs, stat: summarize(widePageMs) },
      "cache-churn": { samplesMs: cacheChurnMs, stat: summarize(cacheChurnMs) },
    },
    peakAllocatedBytes,
    peakChunks,
    probes,
  };
  if (!prototype) validatePagedBenchmark(result, mode);

  console.log("| workload | median ms | p95 ms |");
  console.log("|---|---:|---:|");
  for (const [name, timing] of [
    [`${rowCount.toLocaleString("en-US")}-row paged startup`, result.timings.startup],
    ["first 120-row page", result.timings["first-page"]],
    ["distant 120-row page", result.timings["distant-page"]],
    [`wide ${WIDE_PAGE_COLUMNS}-column page`, result.timings["wide-page"]],
    [`${CACHE_CHURN_PAGES}-page cache churn`, result.timings["cache-churn"]],
  ] as const) {
    console.log(`| ${name} | ${timing.stat.median.toFixed(3)} | ${timing.stat.p95.toFixed(3)} |`);
  }
  console.log(
    "\n| isolated scenario | WASM delta MiB | clean MiB | dirty MiB | total MiB | chunks | loaded | dirty |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const probe of probes) {
    console.log(
      `| ${probe.scenario} | ${(probe.wasmDeltaBytes / 1024 / 1024).toFixed(2)} | ${(probe.allocatedBytes / 1024 / 1024).toFixed(2)} | ${(probe.dirtyAllocatedBytes / 1024 / 1024).toFixed(2)} | ${(probe.retainedBytes / 1024 / 1024).toFixed(2)} | ${probe.chunks} | ${probe.loadedCells} | ${probe.dirtyCells} |`,
    );
  }
  if (mode === "full" && !prototype) {
    await Bun.write(
      new URL("../results/paged-results.json", import.meta.url),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  const probeIndex = process.argv.indexOf("--probe");
  const rowsIndex = process.argv.indexOf("--rows");
  const chunkRowsIndex = process.argv.indexOf("--chunk-rows");
  const scenario = probeIndex >= 0 ? process.argv[probeIndex + 1] : undefined;
  const rowCount = rowsIndex >= 0 ? Number(process.argv[rowsIndex + 1]) : Number.NaN;
  const chunkRows = chunkRowsIndex >= 0 ? Number(process.argv[chunkRowsIndex + 1]) : CHUNK_ROWS;
  if (!Number.isInteger(chunkRows) || chunkRows <= 0) {
    throw new Error("paged benchmark requires positive integer --chunk-rows");
  }
  if (isScenario(scenario)) {
    if (!Number.isInteger(rowCount) || rowCount <= 0) {
      throw new Error("paged probe requires a positive integer --rows value");
    }
    console.log(
      JSON.stringify(
        await runProbe(scenario, rowCount, chunkRows, process.argv.includes("--admission")),
      ),
    );
  } else {
    await runBenchmark(
      process.argv.includes("--smoke") ? "smoke" : "full",
      chunkRows,
      process.argv.includes("--prototype"),
    );
  }
}
