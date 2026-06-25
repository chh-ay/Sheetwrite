/**
 * Headless data-layer benchmark: Sheetwrite vs Handsontable.
 *
 * Measures the cost of pure data operations — load, windowed read, edit, sort,
 * filter, aggregate — with robust statistics (median + p95 over warmed-up,
 * repeated iterations) and a memory profile sampled in isolated subprocesses.
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
import { initSync } from "@sheetwrite/wasm";
import Handsontable from "handsontable";
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
import { forceGc, type MeasureOptions, measure, mib, ms, type Stat, summarize } from "./stats.js";

// ── Configuration ────────────────────────────────────────────────────────────

/** Sheetwrite is measured across the full range; its store scales to 1M. */
const SHEETWRITE_ROWS = [1_000, 10_000, 100_000, 500_000, 1_000_000] as const;
/** Handsontable headless ceiling — larger sizes render every row (infeasible). */
const HANDSONTABLE_ROWS = [1_000, 10_000] as const;
/** Sizes where both engines run headlessly → the apples-to-apples head-to-head. */
const HEAD_TO_HEAD_ROWS = [1_000, 10_000] as const;

const SHEET = "bench";
const ALL_COLS: readonly number[] = [0, 1, 2, 3, 4];
const WINDOW_ROWS = 50;
const EDIT_COUNT = 1_000;
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);

const WORKLOADS = ["ingest", "windowRead", "edit", "sort", "filter", "aggregate"] as const;
type Workload = (typeof WORKLOADS)[number];
type EngineId = "sheetwrite" | "handsontable";

const WORKLOAD_LABELS: Record<Workload, string> = {
  ingest: "Ingest N rows",
  windowRead: "Read 50×5 window",
  edit: "1000 single-cell edits",
  sort: "Sort by amount (numeric)",
  filter: `Filter city contains "${FILTER_NEEDLE}"`,
  aggregate: "Sum amount (aggregate)",
};

/** Per-workload iteration plan; expensive ops/sizes sample fewer times. */
function plan(workload: Workload, rows: number): { warmup: number; iters: number } {
  switch (workload) {
    case "ingest":
      if (rows >= 1_000_000) return { warmup: 1, iters: 3 };
      if (rows >= 500_000) return { warmup: 1, iters: 3 };
      if (rows >= 100_000) return { warmup: 1, iters: 5 };
      return { warmup: 1, iters: 7 };
    case "windowRead":
      return { warmup: 50, iters: 300 };
    case "edit":
      return { warmup: 1, iters: rows >= 500_000 ? 3 : 5 };
    case "sort":
    case "filter":
      if (rows >= 500_000) return { warmup: 1, iters: 5 };
      if (rows >= 100_000) return { warmup: 1, iters: 6 };
      return { warmup: 2, iters: 7 };
    case "aggregate":
      return { warmup: 20, iters: 200 };
  }
}

// ── Result types ─────────────────────────────────────────────────────────────

/** Memory attributable to holding N rows in one engine, sampled in isolation. */
interface MemoryProfile {
  /** process.memoryUsage().heapUsed delta around a single ingest (bytes). */
  readonly heapDeltaBytes: number;
  /** WASM linear-memory delta (bytes); null for engines without WASM. */
  readonly wasmDeltaBytes: number | null;
}

/** All measured workloads for one engine at one row count. */
interface EngineResult {
  readonly rows: number;
  readonly stats: Record<Workload, Stat>;
  readonly notes: Partial<Record<Workload, string>>;
  readonly memory: MemoryProfile;
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

function benchSheetwrite(
  ds: ColumnarDataset,
  columnar: SheetwriteColumnar,
): Omit<EngineResult, "memory"> {
  const rows = ds.rowCount;
  const stats = {} as Record<Workload, Stat>;

  // (a) ingest — a fresh store per timed iteration loads all columns into WASM.
  let storeSink: SheetwriteStore | undefined;
  stats.ingest = measure(
    () => {
      storeSink = new SheetwriteStore(makeWorkbook(rows), columnar);
    },
    plan("ingest", rows),
  );
  void storeSink;

  // One persistent store backs the remaining read/mutate workloads.
  const store = new SheetwriteStore(makeWorkbook(rows), columnar);

  // (b) windowRead — rotate the start offset by a coprime stride to defeat any
  // per-window caching and sweep the whole sheet.
  const maxStart = Math.max(0, rows - WINDOW_ROWS);
  let off = 0;
  stats.windowRead = measure(
    () => {
      const start = off;
      off = off + 977 > maxStart ? 0 : off + 977;
      store.getVisibleWindow(SHEET, { start, end: start + WINDOW_ROWS }, ALL_COLS);
    },
    plan("windowRead", rows),
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

  // (f) aggregate — WASM column sum.
  let aggSink = 0;
  stats.aggregate = measure(
    () => {
      aggSink = store.aggregate(SHEET, AGG_COL, "sum");
    },
    plan("aggregate", rows),
  );
  void aggSink;

  return { rows, stats, notes: {} };
}

// ── Handsontable harness ─────────────────────────────────────────────────────

/** Equivalent Handsontable config: same columns, virtualization on, plugins enabled. */
function hotOptions(data: unknown[][]): Handsontable.GridSettings {
  return {
    data: data as Handsontable.CellValue[][],
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
  const stats = {} as Record<Workload, Stat>;
  const notes: Partial<Record<Workload, string>> = {};
  const host = container();

  const guard = (workload: Workload, run: () => Stat): Stat => {
    try {
      return run();
    } catch (err) {
      notes[workload] = `headless limitation: ${(err as Error).message}`;
      return summarize([]);
    }
  };

  // (a) ingest — a fresh instance per timed iteration; construction builds the
  // data map + index and renders the viewport (all rows, headless). Destroyed
  // in the untimed teardown.
  stats.ingest = guard("ingest", () => {
    let hot: Handsontable | undefined;
    const stat = measure(
      () => {
        hot = new Handsontable(host, hotOptions(toAoA(ds)));
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
  const hot = new Handsontable(host, hotOptions(toAoA(ds)));

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
  return { rows, stats, notes };
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
  const hot = new Handsontable(host, hotOptions(data));
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
  if (!last) return { heapDeltaBytes: Number.NaN, wasmDeltaBytes: null };
  const parsed: unknown = JSON.parse(last);
  if (
    parsed &&
    typeof parsed === "object" &&
    "heapDeltaBytes" in parsed &&
    typeof parsed.heapDeltaBytes === "number"
  ) {
    const wasm =
      "wasmDeltaBytes" in parsed && typeof parsed.wasmDeltaBytes === "number"
        ? parsed.wasmDeltaBytes
        : null;
    return { heapDeltaBytes: parsed.heapDeltaBytes, wasmDeltaBytes: wasm };
  }
  return { heapDeltaBytes: Number.NaN, wasmDeltaBytes: null };
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

async function runFullBench(): Promise<void> {
  await initSheetwrite(readFileSync(WASM_PATH));

  const sw = new Map<number, EngineResult>();
  const hot = new Map<number, EngineResult>();

  for (const rows of SHEETWRITE_ROWS) {
    process.stderr.write(`\n▶ Sheetwrite ${N(rows)} rows …\n`);
    const ds = makeColumnar(rows);
    const timed = benchSheetwrite(ds, toSheetwriteColumnar(ds));
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

  // ── Markdown report to stdout (paste-ready for the README) ──
  const out: string[] = [];
  out.push("## Headless data-layer results");
  out.push("");
  out.push(
    `Bun ${Bun.version} · ${process.platform}/${process.arch} · seeded dataset (id/date/customer/city/amount) · ` +
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
    const r = hot.get(rows);
    if (!r) continue;
    for (const workload of WORKLOADS) {
      const note = r.notes[workload];
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

  const report = out.join("\n");
  console.log(report);

  const json = JSON.stringify(
    {
      meta: {
        bun: Bun.version,
        platform: process.platform,
        arch: process.arch,
        sheetwriteRows: SHEETWRITE_ROWS,
        handsontableRows: HANDSONTABLE_ROWS,
      },
      sheetwrite: Object.fromEntries(sw),
      handsontable: Object.fromEntries(hot),
    },
    null,
    2,
  );
  await Bun.write(new URL("../results/data-results.json", import.meta.url).pathname, json);
  await Bun.write(new URL("../results/data-results.md", import.meta.url).pathname, `${report}\n`);
  process.stderr.write("\n✔ wrote results/data-results.json and results/data-results.md\n");
}

// ── Entry ────────────────────────────────────────────────────────────────────

if (process.argv.includes("--mem")) {
  await runMemMode();
} else {
  await runFullBench();
}
