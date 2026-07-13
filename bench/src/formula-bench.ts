import { readFileSync } from "node:fs";
import { CellStore, initSync } from "@sheetwrite/wasm";
import {
  diamondFormulas,
  distinctRangeFormulas,
  type FormulaCell,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "./formula-dataset.js";
import { forceGc, mib, ms, now, type Stat, summarize } from "./stats.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
const FORMULA_SIZES = [1_000, 10_000, 100_000] as const;
const DEFAULT_SAMPLES = 5;

export interface FormulaWorkloadResult {
  id: string;
  size: number;
  samplesMs: number[];
  stat: Stat;
}

export interface FormulaMemoryResult {
  formulas: number;
  wasmDeltaBytes: number;
}

export interface FormulaBenchmarkResult {
  meta: {
    bun: string;
    platform: string;
    arch: string;
    timestamp: string;
  };
  workloads: FormulaWorkloadResult[];
  memory: FormulaMemoryResult[];
  gates: { passed: true; tolerance: string };
}

interface TimedFixture {
  run(): void;
  check(): void;
  dispose(): void;
}

type FixtureFactory = () => TimedFixture;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`formula benchmark correctness failure: ${message}`);
}

function setFormulas(store: CellStore, sheet: number, formulas: readonly FormulaCell[]): void {
  for (const formula of formulas) {
    store.setFormula(sheet, formula.row, formula.col, formula.src, 0);
  }
}

function numberAt(store: CellStore, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const value = cell.num;
  cell.free();
  return value;
}

function textAt(store: CellStore, sheet: number, row: number, col: number): string | undefined {
  const cell = store.getCell(sheet, row, col);
  const value = cell.string;
  cell.free();
  return value;
}

function numericColumn(count: number, value: (row: number) => number): Float64Array {
  return Float64Array.from({ length: count }, (_, row) => value(row));
}

function collectFixture(
  id: string,
  size: number,
  factory: FixtureFactory,
  samples = DEFAULT_SAMPLES,
): FormulaWorkloadResult {
  // One full untimed iteration warms parser/evaluator code paths and validates
  // the fixture before any timing is accepted.
  const warm = factory();
  warm.run();
  warm.check();
  warm.dispose();

  const raw = new Array<number>(samples);
  for (let index = 0; index < samples; index++) {
    const fixture = factory();
    forceGc();
    const started = now();
    fixture.run();
    raw[index] = now() - started;
    fixture.check();
    fixture.dispose();
  }
  return { id, size, samplesMs: raw, stat: summarize(raw) };
}

function independentLoadFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  const formulas = independentFormulas(count);
  return {
    run: () => setFormulas(store, sheet, formulas),
    check: () => {
      store.recompute(sheet);
      assert(numberAt(store, sheet, count - 1, 1) === count, `independent load ${count}`);
    },
    dispose: () => store.free(),
  };
}

function independentRecomputeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  return {
    run: () => store.recompute(sheet),
    check: () =>
      assert(numberAt(store, sheet, count - 1, 1) === count, `independent recompute ${count}`),
    dispose: () => store.free(),
  };
}

function chainFixture(depth: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, depth);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, linearChain(depth));
  return {
    run: () => store.recompute(sheet),
    check: () => assert(numberAt(store, sheet, depth - 1, 0) === depth, `chain ${depth}`),
    dispose: () => store.free(),
  };
}

function fanOutEditFixture(count: number, unrelated = false): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, Math.max(1, count));
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, fanOutFormulas(count));
  store.recompute(sheet);
  return {
    run: () => {
      store.setNumber(sheet, 0, unrelated ? 2 : 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => {
      if (count === 0) return;
      const expected = unrelated ? count + 1 : count + 10;
      assert(numberAt(store, sheet, count - 1, 1) === expected, `fan-out ${count}`);
    },
    dispose: () => store.free(),
  };
}

function diamondFixture(levels: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, levels);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, diamondFormulas(levels));
  store.recompute(sheet);
  return {
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => {
      let expected = 2;
      for (let level = 0; level < levels; level++) expected = expected + 1 + (expected + 2);
      assert(numberAt(store, sheet, levels - 1, 3) === expected, `diamond ${levels}`);
    },
    dispose: () => store.free(),
  };
}

function sharedRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, Math.max(count, 100));
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  setFormulas(store, sheet, sharedRangeFormulas(count));
  store.recompute(sheet);
  return {
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => assert(numberAt(store, sheet, count - 1, 1) === 101, "shared ranges"),
    dispose: () => store.free(),
  };
}

function distinctRangeFixture(count: number): TimedFixture {
  const rows = count * 10;
  const store = new CellStore();
  const sheet = store.addSheet(2, rows);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(rows, () => 1),
    0,
  );
  setFormulas(store, sheet, distinctRangeFormulas(count));
  store.recompute(sheet);
  return {
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => {
      assert(numberAt(store, sheet, 0, 1) === 11, "first distinct range");
      assert(numberAt(store, sheet, count - 1, 1) === 10, "last distinct range");
    },
    dispose: () => store.free(),
  };
}

function crossSheetFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 100);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setColumnNumbers(
    source,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(summary, row, 0, `=SUM(Source!A1:A100)+${row}`, 0);
  }
  store.recompute(summary);
  return {
    run: () => {
      store.setNumber(source, 0, 0, 2, 0);
      store.recompute(source);
    },
    check: () =>
      assert(numberAt(store, summary, count - 1, 0) === count + 100, "cross-sheet range"),
    dispose: () => store.free(),
  };
}

function topologyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  store.recompute(sheet);
  return {
    run: () => {
      for (let row = 0; row < count; row += 2) store.clearCell(sheet, row, 1, 0);
      store.recompute(sheet);
      for (let row = 0; row < count; row += 2) {
        store.setFormula(sheet, row, 1, `=A${row + 1}+2`, 0);
      }
      store.recompute(sheet);
    },
    check: () => {
      assert(numberAt(store, sheet, 0, 1) === 2, "topology added formula");
      assert(numberAt(store, sheet, count - 1, 1) === count, "topology retained formula");
    },
    dispose: () => store.free(),
  };
}

function cycleFixture(pairs: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, pairs);
  for (let row = 0; row < pairs; row++) {
    store.setFormula(sheet, row, 0, `=B${row + 1}`, 0);
    store.setFormula(sheet, row, 1, `=A${row + 1}`, 0);
  }
  return {
    run: () => store.recompute(sheet),
    check: () => assert(textAt(store, sheet, pairs - 1, 1) === "#CYCLE!", "cycle sentinel"),
    dispose: () => store.free(),
  };
}

function refRemovalFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 1);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setNumber(source, 0, 0, 1, 0);
  for (let row = 0; row < count; row++) store.setFormula(summary, row, 0, "=Source!A1", 0);
  store.recompute(summary);
  return {
    run: () => {
      store.removeSheet(source);
    },
    check: () => assert(textAt(store, summary, count - 1, 0) === "#REF!", "removed sheet"),
    dispose: () => store.free(),
  };
}

function errorPropagationFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setFormula(sheet, 0, 0, "=1/0", 0);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
  return {
    run: () => store.recompute(sheet),
    check: () => assert(textAt(store, sheet, count - 1, 1) === "#DIV/0!", "error propagation"),
    dispose: () => store.free(),
  };
}

function runWorkloads(smoke: boolean): FormulaWorkloadResult[] {
  const results: FormulaWorkloadResult[] = [];
  const sizes = smoke ? ([1_000] as const) : FORMULA_SIZES;
  const samples = smoke ? 2 : DEFAULT_SAMPLES;
  for (const size of sizes) {
    results.push(
      collectFixture("independent-parse-load", size, () => independentLoadFixture(size), samples),
      collectFixture(
        "independent-first-recompute",
        size,
        () => independentRecomputeFixture(size),
        samples,
      ),
    );
  }
  for (const depth of smoke ? [8, 32] : [8, 16, 32, 64]) {
    results.push(collectFixture("linear-chain", depth, () => chainFixture(depth), samples));
  }
  const large = smoke ? 1_000 : 100_000;
  results.push(
    collectFixture("wide-fan-out-edit", 1_000, () => fanOutEditFixture(1_000), samples),
    collectFixture("wide-fan-out-edit", large, () => fanOutEditFixture(large), samples),
    collectFixture("diamond-edit", 32, () => diamondFixture(32), samples),
    collectFixture("shared-range-edit", 1_000, () => sharedRangeFixture(1_000), samples),
    collectFixture("distinct-range-edit", 1_000, () => distinctRangeFixture(1_000), samples),
    collectFixture("cross-sheet-range-edit", 1_000, () => crossSheetFixture(1_000), samples),
    collectFixture("scalar-edit-affects-0", 1_000, () => fanOutEditFixture(1_000, true), samples),
    collectFixture("scalar-edit-affects-1", 1, () => fanOutEditFixture(1), samples),
    collectFixture("scalar-edit-affects-1000", 1_000, () => fanOutEditFixture(1_000), samples),
    collectFixture("scalar-edit-affects-100000", large, () => fanOutEditFixture(large), samples),
    collectFixture(
      "topology-remove-add",
      smoke ? 1_000 : 10_000,
      () => topologyFixture(smoke ? 1_000 : 10_000),
      samples,
    ),
    collectFixture("cycles", 1_000, () => cycleFixture(1_000), samples),
    collectFixture("removed-sheet-ref", 1_000, () => refRemovalFixture(1_000), samples),
    collectFixture("error-propagation", 1_000, () => errorPropagationFixture(1_000), samples),
  );
  return results;
}

function probeMemory(formulas: number): FormulaMemoryResult {
  const process = Bun.spawnSync(["bun", "run", import.meta.path, "--memory", String(formulas)], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "inherit",
  });
  if (process.exitCode !== 0) throw new Error(`formula memory probe exited ${process.exitCode}`);
  const line = process.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((candidate) => candidate.startsWith("{"))
    .at(-1);
  if (!line) throw new Error("formula memory probe returned no JSON");
  const value: unknown = JSON.parse(line);
  if (
    !value ||
    typeof value !== "object" ||
    !("formulas" in value) ||
    value.formulas !== formulas ||
    !("wasmDeltaBytes" in value) ||
    typeof value.wasmDeltaBytes !== "number"
  ) {
    throw new Error("invalid formula memory probe result");
  }
  return { formulas, wasmDeltaBytes: value.wasmDeltaBytes };
}

function runMemoryMode(formulas: number): FormulaMemoryResult {
  const wasm = initSync({ module: readFileSync(WASM_PATH) });
  forceGc();
  const before = wasm.memory.buffer.byteLength;
  const store = new CellStore();
  const sheet = store.addSheet(2, formulas);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(formulas, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(formulas));
  store.recompute(sheet);
  assert(numberAt(store, sheet, formulas - 1, 1) === formulas, "memory fixture");
  forceGc();
  return { formulas, wasmDeltaBytes: wasm.memory.buffer.byteLength - before };
}

export function validateFormulaBenchmark(result: FormulaBenchmarkResult): void {
  assert(result.workloads.length > 0, "no workloads");
  for (const workload of result.workloads) {
    assert(workload.samplesMs.length === workload.stat.iters, `${workload.id} sample count`);
    assert(
      workload.samplesMs.every((sample) => Number.isFinite(sample) && sample >= 0),
      `${workload.id} invalid timing`,
    );
  }
  const load100k = result.workloads.find(
    (workload) => workload.id === "independent-parse-load" && workload.size === 100_000,
  );
  const recompute100k = result.workloads.find(
    (workload) => workload.id === "independent-first-recompute" && workload.size === 100_000,
  );
  if (load100k) assert(load100k.stat.p95 < 5_000, "100K parse/load exceeded 5 seconds");
  if (recompute100k) assert(recompute100k.stat.p95 < 5_000, "100K recompute exceeded 5 seconds");
  for (const memory of result.memory) {
    assert(memory.wasmDeltaBytes >= 0, "negative memory delta");
    if (memory.formulas === 100_000) {
      assert(memory.wasmDeltaBytes < 256 * 1024 * 1024, "100K formulas exceeded 256 MiB");
    }
  }
}

function markdown(result: FormulaBenchmarkResult): string {
  const lines = [
    "# Formula engine benchmark",
    "",
    `Bun ${result.meta.bun} · ${result.meta.platform}/${result.meta.arch} · median (p95) ms · raw samples in JSON.`,
    "",
    "| workload | size | median (p95) ms | samples |",
    "|---|---:|---:|---:|",
  ];
  for (const workload of result.workloads) {
    lines.push(
      `| ${workload.id} | ${workload.size.toLocaleString("en-US")} | ${ms(workload.stat.median)} (${ms(workload.stat.p95)}) | ${workload.samplesMs.length} |`,
    );
  }
  lines.push("", "## Isolated formula memory", "", "| formulas | WASM delta |", "|---:|---:|");
  for (const memory of result.memory) {
    lines.push(`| ${memory.formulas.toLocaleString("en-US")} | ${mib(memory.wasmDeltaBytes)} |`);
  }
  lines.push(
    "",
    "Gates use broad absolute ceilings (100K parse/recompute <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.",
    "",
  );
  return lines.join("\n");
}

async function runBenchmark(smoke: boolean): Promise<void> {
  initSync({ module: readFileSync(WASM_PATH) });
  const workloads = runWorkloads(smoke);
  const memory = smoke ? [probeMemory(1_000)] : FORMULA_SIZES.map(probeMemory);
  const result: FormulaBenchmarkResult = {
    meta: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      timestamp: new Date().toISOString(),
    },
    workloads,
    memory,
    gates: {
      passed: true,
      tolerance:
        "100K parse/load and recompute p95 <5s; 100K formula WASM delta <256MiB; no timer-floor ratios",
    },
  };
  validateFormulaBenchmark(result);
  if (!smoke) {
    await Bun.write(
      new URL("../results/formula-results.json", import.meta.url),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    await Bun.write(
      new URL("../results/formula-results.md", import.meta.url),
      `${markdown(result)}\n`,
    );
  }
  console.log(markdown(result));
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  const memoryIndex = process.argv.indexOf("--memory");
  if (memoryIndex >= 0) {
    const formulas = Number(process.argv[memoryIndex + 1]);
    assert(Number.isInteger(formulas) && formulas > 0, "invalid memory formula count");
    console.log(JSON.stringify(runMemoryMode(formulas)));
  } else {
    await runBenchmark(process.argv.includes("--smoke"));
  }
}
