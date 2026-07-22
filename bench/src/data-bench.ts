/**
 * Headless data-layer benchmark: Sheetwrite vs Handsontable.
 *
 * Measures the cost of pure data operations — load, windowed read, edit, sort,
 * filter, aggregate — with median, interpolated p95, and spread over warmed-up,
 * repeated iterations, plus a memory profile sampled in isolated subprocesses.
 * The dataset is seeded and deterministic (see ./dataset.ts), so every workload
 * runs over byte-identical content on both engines and the numbers reproduce.
 *
 * ── Size matrix ──────────────────────────────────────────────────────────────
 * Sheetwrite is exercised at 1k / 10k / 100k / 500k / 1M rows — its WASM
 * columnar store scales to 1M effortlessly. Handsontable is a DOM grid with no
 * headless layout engine: under happy-dom it cannot virtualize and renders
 * EVERY row (a single 100k construct measured ~26 s, rendering ~131k <tr>s), so
 * it is exercised headlessly only at 1k / 10k — the sizes where it completes in
 * reasonable time. The at-scale (100k–1M) apples-to-apples comparison lives in
 * the browser render benchmark, where Handsontable virtualizes against real
 * layout. The 1k/10k rows are the headless head-to-head; 100k–1M show
 * Sheetwrite's data-engine scaling.
 *
 * ── Honest asymmetries (reported, never hidden) ─────────────────────────────
 *   • Sheetwrite keeps cell data in WASM linear memory (a Rust columnar store);
 *     headless it does no painting.
 *   • Handsontable keeps data in JS arrays coupled to a DOM view. Its edit loop
 *     is wrapped in suspendRender/resumeRender to isolate the data path, and it
 *     has no native column aggregate, so the sum is computed in plain JS over
 *     its source array (the idiomatic approach). Both facts are noted in-table.
 *
 * Memory is sampled in isolated subprocesses (`--mem <engine> <rows>`): the JS
 * heap delta around a single ingest for both engines, plus — for Sheetwrite —
 * the WASM linear-memory delta, since its data lives off the JS heap entirely.
 */

// Side-effecting DOM bootstrap MUST be first so Handsontable boots headlessly.
import "./dom-setup.js";

import { readFileSync } from "node:fs";
import type { Column, Workbook } from "@sheetwrite/core";
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import { CellStore, initSync } from "@sheetwrite/wasm";
import type { CellValue, GridSettings, HotInstance } from "handsontable";
import {
  AGG_COL,
  COL,
  COLUMNS,
  type ColumnarDataset,
  FILTER_COL,
  FILTER_NEEDLE,
  makeColumnar,
  type SheetwriteColumnar,
  SORT_COL,
  toAoA,
  toSheetwriteColumnar,
} from "./dataset.js";
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
import { createHandsontable } from "./handsontable-runtime.js";
import { protocolCaptureMeta } from "./protocol-meta.js";
import { collect, forceGc, type MeasureOptions, mib, ms, type Stat, summarize } from "./stats.js";

// ── Configuration ────────────────────────────────────────────────────────────

/** Sheetwrite is measured across the full range; its store scales to 1M. */
export const SHEETWRITE_ROWS = [1_000, 10_000, 100_000, 500_000, 1_000_000] as const;
/** Handsontable headless ceiling — larger sizes render every row (infeasible). */
export const HANDSONTABLE_ROWS = [1_000, 10_000] as const;
/** Sizes where both engines run headlessly → the apples-to-apples head-to-head. */
const HEAD_TO_HEAD_ROWS = [1_000, 10_000] as const;

const SHEET = "bench";
const ALL_COLS: readonly number[] = [0, 1, 2, 3, 4];
const WINDOW_ROWS = 50;
const EDIT_COUNT = 1_000;
const WINDOW_READ_BATCH = 32;
const SMALL_AGGREGATE_BATCH = 128;
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);

export const WORKLOADS = [
  "ingest",
  "windowRead",
  "edit",
  "sort",
  "filter",
  "multiFilter",
  "distinctLow",
  "distinctHigh",
  "aggregate",
] as const;
export type Workload = (typeof WORKLOADS)[number];
export type EngineId = "sheetwrite" | "handsontable";

const WORKLOAD_LABELS: Record<Workload, string> = {
  ingest: "Ingest N rows",
  windowRead: "Read 50×5 window",
  edit: "1000 single-cell edits",
  sort: "Sort by amount (numeric)",
  filter: `Filter city contains "${FILTER_NEEDLE}"`,
  aggregate: "Sum amount (aggregate)",
  multiFilter: "Compose city and customer contains filters",
  distinctLow: "Distinct low-cardinality city values",
  distinctHigh: "Distinct high-cardinality customer values",
};

/** Per-workload iteration plan; expensive at-scale ops sample fewer times. */
type IterationPlan = Pick<MeasureOptions, "warmup" | "iters" | "gcBetween">;

function plan(workload: Workload, rows: number): IterationPlan {
  const atScale = rows >= 500_000;
  switch (workload) {
    case "ingest":
      return atScale ? { warmup: 1, iters: 3, gcBetween: true } : { warmup: 1, iters: 7 };
    case "windowRead":
      return { warmup: 50, iters: 300 };
    case "edit":
      return atScale ? { warmup: 1, iters: 5, gcBetween: true } : { warmup: 1, iters: 15 };
    case "sort":
    case "filter":
    case "multiFilter":
    case "distinctLow":
    case "distinctHigh":
      return atScale
        ? { warmup: 1, iters: 5, gcBetween: true }
        : { warmup: rows >= 100_000 ? 1 : 2, iters: 15 };
    case "aggregate":
      return { warmup: 20, iters: 200 };
  }
}
export interface DataStat extends Stat {
  readonly samples: readonly number[];
}

function measure(fn: () => void, opts: MeasureOptions): DataStat {
  const samples = collect(fn, opts);
  return { ...summarize(samples), samples };
}

function perOperation(stat: DataStat, batch: number): DataStat {
  return {
    median: stat.median / batch,
    p95: stat.p95 / batch,
    mean: stat.mean / batch,
    stddev: stat.stddev / batch,
    min: stat.min / batch,
    max: stat.max / batch,
    iters: stat.iters,
    samples: stat.samples.map((sample) => sample / batch),
  };
}

function measureBatched(fn: () => void, opts: MeasureOptions, batch: number): DataStat {
  return perOperation(
    measure(() => {
      for (let i = 0; i < batch; i++) fn();
    }, opts),
    batch,
  );
}

// ── Result types ─────────────────────────────────────────────────────────────

/** Memory attributable to holding N rows in one engine, sampled in isolation. */
export interface MemoryProfile {
  /** process.memoryUsage().heapUsed delta around a single ingest (bytes). */
  readonly heapDeltaBytes: number;
  /** WASM linear-memory delta (bytes); null for engines without WASM. */
  readonly wasmDeltaBytes: number | null;
}

export interface QueryResourceMetrics {
  readonly composedFilterMatches: number;
  readonly containsCacheConstructions: number;
  readonly lowDistinctCount: number;
  readonly highDistinctCount: number;
  readonly ownedDistinctStrings: number;
}

/** Timed workloads for one engine at one row count. */
export interface TimedEngineResult {
  readonly rows: number;
  readonly stats: Record<Workload, DataStat>;
  readonly notes: Partial<Record<Workload, string>>;
  readonly queryResources: QueryResourceMetrics | null;
}

/** All measured workloads for one engine at one row count. */
export interface EngineResult extends TimedEngineResult {
  readonly memory: MemoryProfile;
}

export interface DataBenchmarkResult extends GateIdentity {
  readonly meta: {
    readonly bun: string;
    readonly platform: string;
    readonly arch: string;
    readonly commit: string;
    readonly dirty: boolean;
    readonly timestamp: string;
    readonly sheetwriteRows: readonly number[];
    readonly handsontableRows: readonly number[];
  };
  readonly sheetwrite: Readonly<Record<string, EngineResult>>;
  readonly handsontable: Readonly<Record<string, EngineResult>>;
}

export function dataMatrixKey(engine: EngineId, rows: number, metric: Workload | "memory"): string {
  return `engine=${engine};rows=${rows};metric=${metric}`;
}

export function expectedDataMatrixKeys(mode: BenchmarkMode): string[] {
  const keys: string[] = [];
  const engines: readonly [EngineId, readonly number[]][] =
    mode === "smoke"
      ? [["sheetwrite", [1_000]]]
      : [
          ["sheetwrite", SHEETWRITE_ROWS],
          ["handsontable", HANDSONTABLE_ROWS],
        ];
  for (const [engine, rowsList] of engines) {
    for (const rows of rowsList) {
      for (const workload of WORKLOADS) keys.push(dataMatrixKey(engine, rows, workload));
      keys.push(dataMatrixKey(engine, rows, "memory"));
    }
  }
  return keys;
}

export function validateDataBenchmark(
  result: DataBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): void {
  assertGateIdentity("data", expectedMode, result);
  for (const field of ["bun", "platform", "arch"] as const) {
    if (typeof result.meta[field] !== "string" || result.meta[field].length === 0) {
      throw new Error(`data metadata.${field} must be a non-empty string`);
    }
  }
  const expectedSheetwriteRows = expectedMode === "smoke" ? [1_000] : [...SHEETWRITE_ROWS];
  const expectedHandsontableRows = expectedMode === "smoke" ? [] : [...HANDSONTABLE_ROWS];
  if (
    JSON.stringify(result.meta.sheetwriteRows) !== JSON.stringify(expectedSheetwriteRows) ||
    JSON.stringify(result.meta.handsontableRows) !== JSON.stringify(expectedHandsontableRows)
  ) {
    throw new Error(`data ${expectedMode} metadata does not match its declared row matrices`);
  }

  const resultFamilies = [
    ["sheetwrite", result.sheetwrite],
    ["handsontable", result.handsontable],
  ] as const;
  const observedKeys: string[] = [];
  for (const [engine, records] of resultFamilies) {
    for (const [rowsText, row] of Object.entries(records)) {
      const rows = Number(rowsText);
      if (!Number.isInteger(rows) || rows <= 0 || row.rows !== rows) {
        throw new Error(`data ${engine} row identity is malformed: ${rowsText}`);
      }
      for (const workload of Object.keys(row.stats)) {
        observedKeys.push(dataMatrixKey(engine, rows, workload as Workload));
      }
      if (row.memory !== undefined) observedKeys.push(dataMatrixKey(engine, rows, "memory"));
    }
  }
  validateExactMatrix("data", expectedDataMatrixKeys(expectedMode), observedKeys);

  for (const [engine, records] of resultFamilies) {
    for (const [rowsText, row] of Object.entries(records)) {
      const rows = Number(rowsText);
      for (const workload of WORKLOADS) {
        const key = dataMatrixKey(engine, rows, workload);
        const stat = row.stats[workload];
        if (!Array.isArray(stat.samples)) throw new Error(`${key}.samples are missing`);
        validateRawStat(stat.samples, stat, key);
        if (stat.p95 >= 30_000) {
          throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
        }
      }
      if (engine === "sheetwrite") {
        const resources = row.queryResources;
        if (!resources) throw new Error(`${engine} ${rows} query resources are missing`);
        for (const [name, value] of Object.entries(resources)) {
          assertFiniteNonNegative(value, `${engine} ${rows} queryResources.${name}`);
          if (!Number.isInteger(value)) {
            throw new Error(`${engine} ${rows} queryResources.${name} must be an integer`);
          }
        }
        if (
          resources.composedFilterMatches <= 0 ||
          resources.composedFilterMatches > rows ||
          resources.containsCacheConstructions !== 2 ||
          resources.lowDistinctCount !== 7 ||
          resources.highDistinctCount !== rows ||
          resources.ownedDistinctStrings !==
            resources.lowDistinctCount + resources.highDistinctCount
        ) {
          throw new Error(`${engine} ${rows} query resource counters violate structural bounds`);
        }
      } else if (row.queryResources !== null) {
        throw new Error(`${engine} ${rows} queryResources must be null`);
      }
      const memoryKey = dataMatrixKey(engine, rows, "memory");
      assertFiniteNonNegative(row.memory.heapDeltaBytes, `${memoryKey}.heapDeltaBytes`);
      if (row.memory.heapDeltaBytes >= 2 * 1024 * 1024 * 1024) {
        throw new Error(`${memoryKey} exceeded the 2 GiB heap safety ceiling`);
      }
      if (engine === "sheetwrite") {
        if (row.memory.wasmDeltaBytes === null) {
          throw new Error(`${memoryKey}.wasmDeltaBytes is missing`);
        }
        assertFiniteNonNegative(row.memory.wasmDeltaBytes, `${memoryKey}.wasmDeltaBytes`);
        if (row.memory.wasmDeltaBytes >= 1024 * 1024 * 1024) {
          throw new Error(`${memoryKey} exceeded the 1 GiB WASM safety ceiling`);
        }
      } else if (row.memory.wasmDeltaBytes !== null) {
        throw new Error(`${memoryKey}.wasmDeltaBytes must be null for handsontable`);
      }
    }
  }
}

// ── Sheetwrite harness ───────────────────────────────────────────────────────

function makeWorkbook(rowCount: number): Workbook {
  const columns: Column[] = COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.width,
    type: c.type,
  }));
  return { activeSheet: SHEET, sheets: [{ id: SHEET, name: "Bench", rowCount, columns }] };
}

function probeQueryResources(ds: ColumnarDataset): QueryResourceMetrics {
  const store = new CellStore();
  try {
    const sheet = store.addSheet(2, ds.rowCount);
    for (const [col, values] of [ds.city, ds.customer].entries()) {
      store.setColumnStringsPacked(
        sheet,
        col,
        0,
        values.join(""),
        Uint32Array.from(values, (value) => value.length),
        0,
      );
    }
    store.resetQueryResourceStats();
    const matched = store.filterRowsMulti(
      sheet,
      Uint32Array.of(0, 1),
      Uint8Array.of(1, 1),
      Uint8Array.of(0, 0),
      new Float64Array(2),
      new Uint32Array(2),
      Uint32Array.of(1, 1),
      new Float64Array(),
      ["o", "Customer"],
    );
    const low = store.distinctValues(sheet, 0, 0);
    const high = store.distinctValues(sheet, 1, 0);
    const lowDistinctCount = low.takeKinds().length;
    const highDistinctCount = high.takeKinds().length;
    low.free();
    high.free();
    const stats = store.queryResourceStats();
    return {
      composedFilterMatches: matched.length,
      containsCacheConstructions: stats[0] ?? 0,
      lowDistinctCount,
      highDistinctCount,
      ownedDistinctStrings: stats[1] ?? 0,
    };
  } finally {
    store.free();
  }
}

function benchSheetwrite(ds: ColumnarDataset, columnar: SheetwriteColumnar): TimedEngineResult {
  const rows = ds.rowCount;
  const stats = {} as Record<Workload, DataStat>;

  // (a) ingest — a fresh store per timed iteration loads all columns into WASM.
  let storeSink: SheetwriteStore | undefined;
  stats.ingest = measure(
    () => {
      storeSink = new SheetwriteStore(makeWorkbook(rows), columnar);
    },
    {
      ...plan("ingest", rows),
      before: () => {
        // Free the previous iteration's store: WASM linear memory is released
        // deterministically instead of accumulating across iterations/rounds.
        storeSink?.dispose();
        storeSink = undefined;
      },
    },
  );
  storeSink?.dispose();
  storeSink = undefined;

  // One persistent store backs the remaining read/mutate workloads.
  const store = new SheetwriteStore(makeWorkbook(rows), columnar);

  // (b) windowRead — rotate the start offset by a coprime stride to defeat any
  // per-window caching and sweep the whole sheet.
  const maxStart = Math.max(0, rows - WINDOW_ROWS);
  let off = 0;
  stats.windowRead = measureBatched(
    () => {
      const start = off;
      off = off + 977 > maxStart ? 0 : off + 977;
      store.getVisibleWindow(SHEET, { start, end: start + WINDOW_ROWS }, ALL_COLS);
    },
    plan("windowRead", rows),
    WINDOW_READ_BATCH,
  );

  // (c) edit — 1000 single-cell transactions; each recomputes the sheet, the
  // real per-commit cost of an interactive edit.
  stats.edit = measure(
    () => {
      for (let k = 0; k < EDIT_COUNT; k++) {
        const row = (k * 1009) % rows;
        store.applyTransaction({
          patches: [
            {
              op: "set",
              addr: { sheet: SHEET, row, col: COL.amount },
              value: { kind: "literal", value: (k % 9000) + 0.5 },
            },
          ],
        });
      }
    },
    plan("edit", rows),
  );

  // (d) sort / (e) filter — WASM ops returning a view order; reset between runs.
  const reset: Pick<MeasureOptions, "after"> = { after: () => store.clearView(SHEET) };
  stats.sort = measure(() => store.sortBy(SHEET, SORT_COL, true), {
    ...plan("sort", rows),
    ...reset,
  });
  stats.filter = measure(() => store.filterBy(SHEET, FILTER_COL, FILTER_NEEDLE), {
    ...plan("filter", rows),
    ...reset,
  });

  store.setColumnFilter(SHEET, COL.city, { kind: "contains", text: "o" });
  stats.multiFilter = measure(
    () => store.setColumnFilter(SHEET, COL.customer, { kind: "contains", text: "Customer" }),
    {
      ...plan("multiFilter", rows),
      after: () => store.setColumnFilter(SHEET, COL.customer, null),
    },
  );
  store.clearView(SHEET);

  let distinctSink = 0;
  stats.distinctLow = measure(
    () => {
      distinctSink = store.distinctValues(SHEET, COL.city, 0).length;
    },
    plan("distinctLow", rows),
  );
  stats.distinctHigh = measure(
    () => {
      distinctSink = store.distinctValues(SHEET, COL.customer, 0).length;
    },
    plan("distinctHigh", rows),
  );

  const queryResources = probeQueryResources(ds);
  store.clearView(SHEET);
  void distinctSink;
  // (f) aggregate — WASM column sum.
  let aggSink = 0;
  stats.aggregate = measureBatched(
    () => {
      aggSink = store.aggregate(SHEET, AGG_COL, "sum");
    },
    plan("aggregate", rows),
    rows <= 10_000 ? SMALL_AGGREGATE_BATCH : 1,
  );
  void aggSink;

  store.dispose();
  return { rows, stats, notes: {}, queryResources };
}
function warmSheetwriteDataPath(): void {
  const rows = 10_000;
  const ds = makeColumnar(rows);
  const columnar = toSheetwriteColumnar(ds);

  // Warm constructor/load and JS↔WASM call paths before recording sub-ms medians.
  for (let i = 0; i < 3; i++) {
    new SheetwriteStore(makeWorkbook(rows), columnar).dispose();
  }

  const store = new SheetwriteStore(makeWorkbook(rows), columnar);
  for (let i = 0; i < 100; i++) {
    const start = (i * 97) % (rows - WINDOW_ROWS);
    store.getVisibleWindow(SHEET, { start, end: start + WINDOW_ROWS }, ALL_COLS);
  }

  for (let k = 0; k < EDIT_COUNT; k++) {
    const row = (k * 1009) % rows;
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: SHEET, row, col: COL.amount },
          value: { kind: "literal", value: (k % 9000) + 0.5 },
        },
      ],
    });
  }

  store.sortBy(SHEET, SORT_COL, true);
  store.clearView(SHEET);
  const smallRows = 1_000;
  const smallDs = makeColumnar(smallRows);
  const smallStore = new SheetwriteStore(makeWorkbook(smallRows), toSheetwriteColumnar(smallDs));
  smallStore.sortBy(SHEET, SORT_COL, true);
  smallStore.dispose();

  store.filterBy(SHEET, FILTER_COL, FILTER_NEEDLE);
  store.clearView(SHEET);
  store.aggregate(SHEET, AGG_COL, "sum");
  store.dispose();
}

// ── Handsontable harness ─────────────────────────────────────────────────────

/** Equivalent Handsontable config: same columns, virtualization on, plugins enabled. */
function hotOptions(data: CellValue[][]): GridSettings {
  return {
    data,
    columns: COLUMNS.map((c, i) => ({ data: i, type: c.type === "number" ? "numeric" : "text" })),
    colHeaders: COLUMNS.map((c) => c.header),
    rowHeaders: true,
    columnSorting: true,
    filters: true,
    width: 900,
    height: 480,
    renderAllRows: false,
    autoColumnSize: false,
    autoRowSize: false,
    licenseKey: "non-commercial-and-evaluation",
  };
}

let hotContainer: HTMLElement | undefined;
function container(): HTMLElement {
  if (!hotContainer) {
    hotContainer = document.createElement("div");
    hotContainer.style.width = "900px";
    hotContainer.style.height = "480px";
    document.body.appendChild(hotContainer);
  }
  return hotContainer;
}

function benchHandsontable(ds: ColumnarDataset): Omit<EngineResult, "memory"> {
  const rows = ds.rowCount;
  const stats = {} as Record<Workload, DataStat>;
  const notes: Partial<Record<Workload, string>> = {};
  const host = container();

  const guard = (workload: Workload, run: () => DataStat): DataStat => {
    try {
      return run();
    } catch (err) {
      notes[workload] = `headless limitation: ${(err as Error).message}`;
      return { ...summarize([]), samples: [] };
    }
  };

  // (a) ingest — a fresh instance per timed iteration; construction builds the
  // data map + index and renders the viewport (all rows, headless). Destroyed
  // in the untimed teardown.
  stats.ingest = guard("ingest", () => {
    let hot: HotInstance | undefined;
    const stat = measure(
      () => {
        hot = createHandsontable(host, hotOptions(toAoA(ds)));
      },
      {
        ...plan("ingest", rows),
        before: () => {
          hot?.destroy();
          hot = undefined;
        },
      },
    );
    hot?.destroy();
    return stat;
  });

  // Persistent instance for the remaining workloads.
  const hot = createHandsontable(host, hotOptions(toAoA(ds)));

  // (b) windowRead — read the same 50×5 range via getData at rotating offsets.
  const maxStart = Math.max(0, rows - WINDOW_ROWS);
  let off = 0;
  stats.windowRead = guard("windowRead", () =>
    measure(
      () => {
        const start = off;
        off = off + 977 > maxStart ? 0 : off + 977;
        hot.getData(start, 0, start + WINDOW_ROWS - 1, 4);
      },
      plan("windowRead", rows),
    ),
  );

  // (c) edit — 1000 single-cell edits. suspendRender/resumeRender brackets the
  // loop so the data path is measured rather than 1000 intermediate repaints
  // (Handsontable couples data + view).
  notes.edit = "edits wrapped in suspendRender/resumeRender to isolate the data path";
  stats.edit = guard("edit", () =>
    measure(
      () => {
        hot.suspendRender();
        for (let k = 0; k < EDIT_COUNT; k++) {
          const row = (k * 1009) % rows;
          hot.setDataAtCell(row, COL.amount, (k % 9000) + 0.5);
        }
        hot.resumeRender();
      },
      plan("edit", rows),
    ),
  );

  // (d) sort via the columnSorting plugin; clear between runs.
  const sorting = hot.getPlugin("columnSorting");
  stats.sort = guard("sort", () =>
    measure(() => sorting.sort({ column: SORT_COL, sortOrder: "asc" }), {
      ...plan("sort", rows),
      after: () => sorting.clearSort(),
    }),
  );

  // (e) filter via the filters plugin; clear between runs.
  const filters = hot.getPlugin("filters");
  stats.filter = guard("filter", () =>
    measure(
      () => {
        filters.clearConditions();
        filters.addCondition(FILTER_COL, "contains", [FILTER_NEEDLE]);
        filters.filter();
      },
      {
        ...plan("filter", rows),
        after: () => {
          filters.clearConditions();
          filters.filter();
        },
      },
    ),
  );

  stats.multiFilter = guard("multiFilter", () =>
    measure(
      () => {
        filters.clearConditions();
        filters.addCondition(COL.city, "contains", ["o"]);
        filters.addCondition(COL.customer, "contains", ["Customer"]);
        filters.filter();
      },
      {
        ...plan("multiFilter", rows),
        after: () => {
          filters.clearConditions();
          filters.filter();
        },
      },
    ),
  );
  let distinctSink = 0;
  stats.distinctLow = guard("distinctLow", () =>
    measure(
      () => {
        distinctSink = new Set(hot.getSourceDataAtCol(COL.city)).size;
      },
      plan("distinctLow", rows),
    ),
  );
  stats.distinctHigh = guard("distinctHigh", () =>
    measure(
      () => {
        distinctSink = new Set(hot.getSourceDataAtCol(COL.customer)).size;
      },
      plan("distinctHigh", rows),
    ),
  );
  void distinctSink;

  // (f) aggregate — no native column aggregate; sum the source column in JS.
  notes.aggregate = "no native aggregate API — summed in plain JS over getSourceDataAtCol";
  let aggSink = 0;
  stats.aggregate = guard("aggregate", () =>
    measure(
      () => {
        const col = hot.getSourceDataAtCol(AGG_COL);
        let sum = 0;
        for (let i = 0; i < col.length; i++) sum += Number(col[i]);
        aggSink = sum;
      },
      plan("aggregate", rows),
    ),
  );
  void aggSink;

  hot.destroy();
  return { rows, stats, notes, queryResources: null };
}

// ── Memory probes (isolated subprocess) ──────────────────────────────────────

const retain: unknown[] = [];

/**
 * Build a store in a sub-scope so the transient columnar input arrays (the JS
 * dataset, including ~N unique customer strings) become unreachable when this
 * returns — leaving only the store's retained JS state for the caller to weigh.
 * The store copies all cell data into WASM, so it does not retain the inputs.
 */
function buildSheetwriteStore(rows: number): SheetwriteStore {
  const columnar = toSheetwriteColumnar(makeColumnar(rows));
  return new SheetwriteStore(makeWorkbook(rows), columnar);
}

function probeSheetwriteMemory(rows: number): MemoryProfile {
  const wasmExports = initSync(readFileSync(WASM_PATH));
  forceGc();
  // Snapshot BEFORE building anything: the transient JS dataset is allocated
  // after this point and collected before the second snapshot, so the heap
  // delta reflects only what the store keeps on the JS heap (≈ 0 — data is WASM).
  const heap0 = process.memoryUsage().heapUsed;
  const wasm0 = wasmExports.memory.buffer.byteLength;
  const store = buildSheetwriteStore(rows);
  store.aggregate(SHEET, AGG_COL, "sum"); // touch so the load is not elided
  retain.push(store);
  forceGc();
  const heap1 = process.memoryUsage().heapUsed;
  const wasm1 = wasmExports.memory.buffer.byteLength;
  return { heapDeltaBytes: Math.max(0, heap1 - heap0), wasmDeltaBytes: wasm1 - wasm0 };
}

function probeHandsontableMemory(rows: number): MemoryProfile {
  const host = container();
  const data = toAoA(makeColumnar(rows));
  forceGc();
  const heap0 = process.memoryUsage().heapUsed;
  const hot = createHandsontable(host, hotOptions(data));
  hot.getData(0, 0, 0, 4); // touch
  retain.push(hot);
  forceGc();
  const heap1 = process.memoryUsage().heapUsed;
  return { heapDeltaBytes: heap1 - heap0, wasmDeltaBytes: null };
}

/** Spawn this file in `--mem` mode and parse the JSON memory profile it prints. */
function probeMemory(engine: EngineId, rows: number): MemoryProfile {
  const proc = Bun.spawnSync(["bun", "run", import.meta.path, "--mem", engine, String(rows)], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = proc.stdout.toString().trim();
  const last = text
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .at(-1);
  if (proc.exitCode !== 0) {
    throw new Error(`${engine} ${rows} memory probe exited ${proc.exitCode}`);
  }
  if (!last) throw new Error(`${engine} ${rows} memory probe returned no JSON`);
  const parsed: unknown = JSON.parse(last);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("heapDeltaBytes" in parsed && typeof parsed.heapDeltaBytes === "number") ||
    !(
      "wasmDeltaBytes" in parsed &&
      (typeof parsed.wasmDeltaBytes === "number" || parsed.wasmDeltaBytes === null)
    )
  ) {
    throw new Error(`${engine} ${rows} memory probe returned a malformed record`);
  }
  return {
    heapDeltaBytes: parsed.heapDeltaBytes,
    wasmDeltaBytes: parsed.wasmDeltaBytes,
  };
}

async function runMemMode(): Promise<void> {
  const engine = process.argv[3];
  const rows = Number(process.argv[4]);
  if (engine === "sheetwrite") {
    await initSheetwrite(readFileSync(WASM_PATH));
    console.log(JSON.stringify(probeSheetwriteMemory(rows)));
  } else {
    console.log(JSON.stringify(probeHandsontableMemory(rows)));
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────

const N = (n: number): string => n.toLocaleString("en-US");

function verdict(sw: Stat, hot: Stat): string {
  if (Number.isNaN(sw.median) || Number.isNaN(hot.median) || sw.median === 0) return "—";
  const ratio = hot.median / sw.median;
  return ratio >= 1 ? `**${ratio.toFixed(1)}× faster**` : `${(1 / ratio).toFixed(1)}× slower`;
}

function headToHeadTable(
  workload: Workload,
  sw: Map<number, EngineResult>,
  hot: Map<number, EngineResult>,
): string {
  const lines: string[] = [];
  lines.push(`#### ${WORKLOAD_LABELS[workload]}`);
  lines.push("");
  lines.push("| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |");
  lines.push("|---:|---:|---:|:--|");
  for (const rows of HEAD_TO_HEAD_ROWS) {
    const s = sw.get(rows)?.stats[workload];
    const h = hot.get(rows)?.stats[workload];
    if (!s || !h) continue;
    lines.push(
      `| ${N(rows)} | ${ms(s.median)} (${ms(s.p95)}) | ${ms(h.median)} (${ms(h.p95)}) | ${verdict(s, h)} |`,
    );
  }
  return lines.join("\n");
}

function scalingTable(sw: Map<number, EngineResult>): string {
  const lines: string[] = [];
  lines.push(`| rows | ${WORKLOADS.map((w) => WORKLOAD_LABELS[w]).join(" | ")} |`);
  lines.push(`|---:${"|---:".repeat(WORKLOADS.length)}|`);
  for (const rows of SHEETWRITE_ROWS) {
    const r = sw.get(rows);
    if (!r) continue;
    const cells = WORKLOADS.map((w) => `${ms(r.stats[w].median)} (${ms(r.stats[w].p95)})`);
    lines.push(`| ${N(rows)} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function memoryTable(sw: Map<number, EngineResult>): string {
  const lines: string[] = [];
  lines.push("| rows | Sheetwrite data (WASM columnar store) | bytes/row |");
  lines.push("|---:|---:|---:|");
  for (const rows of SHEETWRITE_ROWS) {
    const s = sw.get(rows);
    if (!s || s.memory.wasmDeltaBytes === null) continue;
    const perRow = (s.memory.wasmDeltaBytes / rows).toFixed(0);
    lines.push(`| ${N(rows)} | ${mib(s.memory.wasmDeltaBytes)} | ${perRow} B |`);
  }
  return lines.join("\n");
}
export function renderDataBenchmarkMarkdown(result: DataBenchmarkResult): string {
  validateDataBenchmark(result, "full");
  const sw = new Map(
    Object.entries(result.sheetwrite).map(([rows, value]) => [Number(rows), value] as const),
  );
  const hot = new Map(
    Object.entries(result.handsontable).map(([rows, value]) => [Number(rows), value] as const),
  );
  const out: string[] = [];
  out.push("## Headless data-layer results");
  out.push("");
  out.push(
    `Bun ${result.meta.bun} · ${result.meta.platform}/${result.meta.arch} · seeded dataset (id/date/customer/city/amount) · ` +
      `median (p95) over warmed-up iterations · lower is better.`,
  );
  out.push("");
  out.push("### Head-to-head (both engines, headless)");
  out.push("");
  out.push(
    "Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).",
  );
  out.push("");
  for (const workload of WORKLOADS) {
    out.push(headToHeadTable(workload, sw, hot));
    out.push("");
  }
  out.push("### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms");
  out.push("");
  out.push(
    "Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.",
  );
  out.push("");
  out.push(scalingTable(sw));
  out.push("");
  out.push("### Memory");
  out.push("");
  out.push(
    "Sheetwrite's exact data footprint — the WASM linear-memory growth for a single ingest, sampled in a clean isolated process. The whole columnar store (id/date/customer/city/amount) lives here; JS-side retained state is O(columns + unique styles + active view), never O(cells).",
  );
  out.push("");
  out.push(memoryTable(sw));
  out.push("");
  out.push("**Notes**");
  const noteSet = new Set<string>();
  for (const rows of HANDSONTABLE_ROWS) {
    const row = hot.get(rows);
    if (!row) continue;
    for (const workload of WORKLOADS) {
      const note = row.notes[workload];
      if (note && !noteSet.has(note)) {
        noteSet.add(note);
        out.push(`- Handsontable ${workload}: ${note}`);
      }
    }
  }
  out.push(
    "- Handsontable headless ceiling: a single 100k construct measured ~26 s (renders ~131k `<tr>`s); it cannot virtualize without browser layout, so 100k–1M are measured in the browser bench instead.",
  );
  out.push(
    "- Sheetwrite memory is the WASM `memory.buffer` byteLength delta (exact). bun's `process.heapUsed` conflates the WASM ArrayBuffer with the JS heap, so it is not used here.",
  );
  out.push(
    "- Handsontable's representative memory is captured in the browser render benchmark; its headless heap is dominated by the non-virtualized all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not comparable.",
  );
  return `${out.join("\n")}\n`;
}

export async function runSheetwriteDataBench(
  rowsList: readonly number[] = SHEETWRITE_ROWS,
): Promise<Map<number, TimedEngineResult>> {
  await initSheetwrite(readFileSync(WASM_PATH));
  warmSheetwriteDataPath();

  const results = new Map<number, TimedEngineResult>();
  for (const rows of rowsList) {
    process.stderr.write(`\n▶ Sheetwrite ${N(rows)} rows …\n`);
    const ds = makeColumnar(rows);
    results.set(rows, benchSheetwrite(ds, toSheetwriteColumnar(ds)));
  }
  return results;
}

function dataResult(
  mode: BenchmarkMode,
  sheetwrite: ReadonlyMap<number, EngineResult>,
  handsontable: ReadonlyMap<number, EngineResult>,
): DataBenchmarkResult {
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.data[mode],
    meta: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      ...protocolCaptureMeta(),
      sheetwriteRows: [...sheetwrite.keys()],
      handsontableRows: [...handsontable.keys()],
    },
    sheetwrite: Object.fromEntries(sheetwrite),
    handsontable: Object.fromEntries(handsontable),
  };
}

async function runSmokeBench(): Promise<void> {
  const timed = await runSheetwriteDataBench([1_000]);
  const sheetwrite = new Map<number, EngineResult>();
  const result = timed.get(1_000);
  if (!result) throw new Error("data smoke omitted the declared 1000-row result");
  sheetwrite.set(1_000, { ...result, memory: probeMemory("sheetwrite", 1_000) });
  const smoke = dataResult("smoke", sheetwrite, new Map());
  validateDataBenchmark(smoke, "smoke");
  console.log(JSON.stringify(smoke));
}

async function runFullBench(): Promise<void> {
  const timedSw = await runSheetwriteDataBench();

  const sw = new Map<number, EngineResult>();
  const hot = new Map<number, EngineResult>();

  for (const [rows, timed] of timedSw) {
    const memory = probeMemory("sheetwrite", rows);
    sw.set(rows, { ...timed, memory });
  }

  for (const rows of HANDSONTABLE_ROWS) {
    process.stderr.write(`\n▶ Handsontable ${N(rows)} rows …\n`);
    const ds = makeColumnar(rows);
    const timed = benchHandsontable(ds);
    const memory = probeMemory("handsontable", rows);
    hot.set(rows, { ...timed, memory });
  }

  const result = dataResult("full", sw, hot);
  validateDataBenchmark(result, "full");
  const report = renderDataBenchmarkMarkdown(result);
  console.log(report.trimEnd());
  await Bun.write(
    new URL("../results/data-results.json", import.meta.url).pathname,
    `${JSON.stringify(result, null, 2)}\n`,
  );
  await Bun.write(new URL("../results/data-results.md", import.meta.url).pathname, report);
  process.stderr.write("\n✔ wrote results/data-results.json and results/data-results.md\n");
}

// ── Entry ────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  if (process.argv.includes("--mem")) {
    await runMemMode();
  } else if (process.argv.includes("--smoke")) {
    await runSmokeBench();
  } else {
    await runFullBench();
  }
}
