import { readFileSync } from "node:fs";
import type { RowData, Workbook } from "@sheetwrite/core";
import { initSheetwrite, SheetwriteStore } from "@sheetwrite/core";
import { initSync } from "@sheetwrite/wasm";

const ROWS = 1_000_000;
const COLUMNS = 5;
const RUNS = 12;
const PAGE_ROWS = 120;
const CHUNK_ROWS = 4096;
const CACHE_BYTES = 32 * 1024 * 1024;
const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const SCENARIOS = [
  "empty",
  "padding",
  "viewport",
  "scroll-1",
  "scroll-10",
  "scroll-100",
  "dirty",
] as const;
type Scenario = (typeof SCENARIOS)[number];

interface ProbeResult {
  scenario: Scenario;
  wasmDeltaBytes: number;
  chunks: number;
  loadedCells: number;
  dirtyCells: number;
  allocatedBytes: number;
  fullyLoaded: boolean;
}

function workbook(): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Million rows",
        rowCount: ROWS,
        columns: Array.from({ length: COLUMNS }, (_, col) => ({
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

function percentile(samples: readonly number[], fraction: number): number {
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0;
}

function summarize(samples: readonly number[]) {
  return {
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
  };
}

function loadFraction(store: SheetwriteStore, fraction: number): void {
  const limit = Math.floor(ROWS * fraction);
  for (let start = 0; start < limit; start += CHUNK_ROWS) {
    store.loadRows("s1", start, rows(start, Math.min(CHUNK_ROWS, limit - start)));
  }
}

function isScenario(value: string | undefined): value is Scenario {
  return SCENARIOS.some((scenario) => scenario === value);
}

async function runProbe(scenario: Scenario): Promise<ProbeResult> {
  const bytes = readFileSync(WASM_PATH);
  await initSheetwrite(bytes);
  const wasm = initSync({ module: bytes });
  Bun.gc(true);
  const wasmBefore = wasm.memory.buffer.byteLength;
  const store = new SheetwriteStore(workbook(), undefined, {
    storage: "paged",
    chunkRows: CHUNK_ROWS,
    cacheBytes: CACHE_BYTES,
  });

  if (scenario === "viewport") {
    store.loadRows("s1", 0, rows(0, 30));
  } else if (scenario === "scroll-1") {
    loadFraction(store, 0.01);
  } else if (scenario === "scroll-10") {
    loadFraction(store, 0.1);
  } else if (scenario === "scroll-100") {
    loadFraction(store, 1);
  } else if (scenario === "dirty") {
    for (let index = 0; index < 100; index++) {
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: index * 8191, col: index % COLUMNS },
            value: { kind: "literal", value: index },
          },
        ],
      });
    }
  }
  // `padding` intentionally performs no store mutation: the extra 15 columns
  // are renderer/index metadata and therefore have the same cell allocation as
  // `empty`. Unit/browser tests exercise their selection and materialization.

  Bun.gc(true);
  const stats = store.getPagedStats("s1");
  const result = {
    scenario,
    wasmDeltaBytes: wasm.memory.buffer.byteLength - wasmBefore,
    ...stats,
  };
  // Keep the store live through both measurements.
  if (store.getWorkbook().sheets.length !== 1)
    throw new Error("benchmark store was optimized away");
  return result;
}

function parseProbe(stdout: string, scenario: Scenario): ProbeResult {
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
    fullyLoaded: value.fullyLoaded,
  };
}

function isolatedProbe(scenario: Scenario): ProbeResult {
  const process = Bun.spawnSync(["bun", "run", import.meta.path, "--probe", scenario], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "inherit",
  });
  if (process.exitCode !== 0) throw new Error(`${scenario} probe exited ${process.exitCode}`);
  return parseProbe(process.stdout.toString(), scenario);
}

async function runBenchmark(): Promise<void> {
  await initSheetwrite();
  const startup: number[] = [];
  const firstPage: number[] = [];
  const distantPage: number[] = [];
  let peakAllocatedBytes = 0;
  let peakChunks = 0;
  for (let run = 0; run < RUNS; run++) {
    let started = performance.now();
    const store = new SheetwriteStore(workbook(), undefined, {
      storage: "paged",
      chunkRows: CHUNK_ROWS,
      cacheBytes: CACHE_BYTES,
    });
    startup.push(performance.now() - started);

    started = performance.now();
    store.loadRows("s1", 0, rows(0));
    firstPage.push(performance.now() - started);

    started = performance.now();
    store.loadRows("s1", 500_000, rows(500_000));
    distantPage.push(performance.now() - started);

    const stats = store.getPagedStats("s1");
    peakAllocatedBytes = Math.max(peakAllocatedBytes, stats.allocatedBytes);
    peakChunks = Math.max(peakChunks, stats.chunks);
    store.dispose();
  }

  const probes = SCENARIOS.map(isolatedProbe);
  const result = {
    rows: ROWS,
    columns: COLUMNS,
    runs: RUNS,
    pageRows: PAGE_ROWS,
    cacheBudgetBytes: CACHE_BYTES,
    denseLogicalBytes: ROWS * COLUMNS * (1 + 8 + 4),
    startup: summarize(startup),
    firstPage: summarize(firstPage),
    distantPage: summarize(distantPage),
    peakAllocatedBytes,
    peakChunks,
    probes,
  };

  console.log("| workload | median ms | p95 ms |");
  console.log("|---|---:|---:|");
  for (const [name, summary] of [
    ["1M-row paged startup", result.startup],
    ["first 120-row page", result.firstPage],
    ["distant 120-row page", result.distantPage],
  ] as const) {
    console.log(`| ${name} | ${summary.medianMs.toFixed(3)} | ${summary.p95Ms.toFixed(3)} |`);
  }
  console.log(
    "\n| isolated scenario | WASM delta MiB | chunk bytes MiB | chunks | loaded | dirty |",
  );
  console.log("|---|---:|---:|---:|---:|---:|");
  for (const probe of probes) {
    console.log(
      `| ${probe.scenario} | ${(probe.wasmDeltaBytes / 1024 / 1024).toFixed(2)} | ${(probe.allocatedBytes / 1024 / 1024).toFixed(2)} | ${probe.chunks} | ${probe.loadedCells} | ${probe.dirtyCells} |`,
    );
  }
  await Bun.write(
    new URL("../results/paged-results.json", import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  const probeIndex = process.argv.indexOf("--probe");
  const scenario = probeIndex >= 0 ? process.argv[probeIndex + 1] : undefined;
  if (isScenario(scenario)) {
    console.log(JSON.stringify(await runProbe(scenario)));
  } else {
    await runBenchmark();
  }
}
