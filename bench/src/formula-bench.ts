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
import { protocolCaptureMeta } from "./protocol-meta.js";
import { forceGc, mib, ms, now, type Stat, summarize } from "./stats.js";

const WASM_PATH = new URL("../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url);
export const FORMULA_SIZES = [1_000, 10_000, 100_000] as const;
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

export interface FormulaBenchmarkResult extends GateIdentity {
  meta: {
    bun: string;
    platform: string;
    arch: string;
    commit: string;
    dirty: boolean;
    timestamp: string;
  };
  workloads: FormulaWorkloadResult[];
  memory: FormulaMemoryResult[];
  gates: { passed: true; tolerance: string };
}

export function formulaWorkloadKey(workload: Pick<FormulaWorkloadResult, "id" | "size">): string {
  return `workload=${workload.id};size=${workload.size}`;
}

export function expectedFormulaWorkloadKeys(mode: BenchmarkMode): string[] {
  const smoke = mode === "smoke";
  const keys: string[] = [];
  for (const size of smoke ? [1_000] : FORMULA_SIZES) {
    keys.push(
      formulaWorkloadKey({ id: "independent-parse-load", size }),
      formulaWorkloadKey({ id: "independent-first-recompute", size }),
    );
  }
  for (const size of smoke ? [8, 32] : [8, 16, 32, 64]) {
    keys.push(formulaWorkloadKey({ id: "linear-chain", size }));
  }
  const large = smoke ? 1_000 : 100_000;
  keys.push(
    formulaWorkloadKey({ id: "wide-fan-out-edit", size: 1_000 }),
    ...(smoke ? [] : [formulaWorkloadKey({ id: "wide-fan-out-edit", size: large })]),
    formulaWorkloadKey({ id: "diamond-edit", size: 32 }),
    formulaWorkloadKey({ id: "shared-range-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "distinct-range-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "cross-sheet-range-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-0", size: 1_000 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-1", size: 1 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-1000", size: 1_000 }),
    formulaWorkloadKey({ id: "scalar-edit-affects-100000", size: large }),
    formulaWorkloadKey({ id: "topology-remove-add", size: smoke ? 1_000 : 10_000 }),
    formulaWorkloadKey({ id: "cycles", size: 1_000 }),
    formulaWorkloadKey({ id: "removed-sheet-ref", size: 1_000 }),
    formulaWorkloadKey({ id: "error-propagation", size: 1_000 }),
    formulaWorkloadKey({ id: "criteria-range-edit", size: smoke ? 10_000 : 100_000 }),
    formulaWorkloadKey({ id: "lookup-range-edit", size: smoke ? 10_000 : 100_000 }),
    formulaWorkloadKey({ id: "spill-filter-resize", size: smoke ? 10_000 : 100_000 }),
  );
  return keys;
}

export function expectedFormulaMemoryKeys(mode: BenchmarkMode): string[] {
  const sizes = mode === "smoke" ? [1_000] : FORMULA_SIZES;
  return sizes.map((formulas) => `memory=formulas=${formulas}`);
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

function criteriaRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const threshold = Math.floor(count / 2);
  store.setFormula(sheet, 0, 2, `=SUMIF(A1:A${count},">=${threshold}",B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () =>
      assert(numberAt(store, sheet, 0, 2) === count - threshold + 1, `criteria range ${count}`),
    dispose: () => store.free(),
  };
}

function lookupRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => row * 2),
    0,
  );
  store.setNumber(sheet, 0, 2, 0, 0);
  store.setFormula(sheet, 0, 3, `=XLOOKUP(C1,A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => assert(numberAt(store, sheet, 0, 3) === (count - 1) * 2, `lookup range ${count}`),
    dispose: () => store.free(),
  };
}
function spillFilterResizeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setBool(sheet, row, 1, row + 1 < count, 0);
  }
  store.setFormula(sheet, 0, 2, `=FILTER(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    run: () => {
      store.setBool(sheet, count - 1, 1, true, 0);
      store.recompute(sheet);
    },
    check: () => {
      assert(numberAt(store, sheet, count - 1, 2) === count - 1, `spill resize ${count}`);
      assert(store.spillAnchorRow(sheet, count - 1, 2) === 0, `spill owner ${count}`);
    },
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
    ...(smoke
      ? []
      : [collectFixture("wide-fan-out-edit", large, () => fanOutEditFixture(large), samples)]),
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
    collectFixture(
      "criteria-range-edit",
      smoke ? 10_000 : 100_000,
      () => criteriaRangeFixture(smoke ? 10_000 : 100_000),
      samples,
    ),
    collectFixture(
      "lookup-range-edit",
      smoke ? 10_000 : 100_000,
      () => lookupRangeFixture(smoke ? 10_000 : 100_000),
      samples,
    ),
    collectFixture(
      "spill-filter-resize",
      smoke ? 10_000 : 100_000,
      () => spillFilterResizeFixture(smoke ? 10_000 : 100_000),
      samples,
    ),
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

export function validateFormulaBenchmark(
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): void {
  assertGateIdentity("formula", expectedMode, result);
  for (const field of ["bun", "platform", "arch"] as const) {
    if (typeof result.meta[field] !== "string" || result.meta[field].length === 0) {
      throw new Error(`formula metadata.${field} must be a non-empty string`);
    }
  }
  if (
    typeof result.meta.timestamp !== "string" ||
    !Number.isFinite(Date.parse(result.meta.timestamp))
  ) {
    throw new Error("formula metadata.timestamp must be an ISO timestamp");
  }
  for (const workload of result.workloads) {
    if (
      typeof workload.id !== "string" ||
      workload.id.length === 0 ||
      !Number.isInteger(workload.size) ||
      workload.size <= 0
    ) {
      throw new Error("formula workload contains a malformed identity");
    }
  }
  for (const memory of result.memory) {
    if (!Number.isInteger(memory.formulas) || memory.formulas <= 0) {
      throw new Error("formula memory contains a malformed identity");
    }
  }
  if (
    result.gates?.passed !== true ||
    typeof result.gates.tolerance !== "string" ||
    result.gates.tolerance.length === 0
  ) {
    throw new Error("formula result does not contain a successful gate record");
  }
  validateExactMatrix(
    "formula workload",
    expectedFormulaWorkloadKeys(expectedMode),
    result.workloads.map(formulaWorkloadKey),
  );
  validateExactMatrix(
    "formula memory",
    expectedFormulaMemoryKeys(expectedMode),
    result.memory.map((memory) => `memory=formulas=${memory.formulas}`),
  );

  for (const workload of result.workloads) {
    const key = formulaWorkloadKey(workload);
    validateRawStat(workload.samplesMs, workload.stat, key);
    if (workload.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }
  for (const memory of result.memory) {
    const key = `memory=formulas=${memory.formulas}`;
    assertFiniteNonNegative(memory.wasmDeltaBytes, `${key}.wasmDeltaBytes`);
    if (memory.wasmDeltaBytes >= 512 * 1024 * 1024) {
      throw new Error(`${key} exceeded the 512 MiB absolute safety ceiling`);
    }
  }

  if (expectedMode === "full") {
    for (const id of [
      "independent-parse-load",
      "independent-first-recompute",
      "criteria-range-edit",
      "lookup-range-edit",
    ]) {
      const key = formulaWorkloadKey({ id, size: 100_000 });
      const workload = result.workloads.find((candidate) => formulaWorkloadKey(candidate) === key)!;
      if (workload.stat.p95 >= 5_000) {
        throw new Error(`${key} exceeded the 5 second 100K safety ceiling`);
      }
    }
    const memory100k = result.memory.find((memory) => memory.formulas === 100_000)!;
    if (memory100k.wasmDeltaBytes >= 256 * 1024 * 1024) {
      throw new Error("memory=formulas=100000 exceeded the 256 MiB safety ceiling");
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
    "Gates use broad absolute ceilings (100K parse/recompute/criteria/lookup <5 s; 100K formula memory <256 MiB). Tiny timer-floor workloads are recorded but not ratio-gated.",
    "",
  );
  return lines.join("\n");
}

async function runBenchmark(smoke: boolean): Promise<void> {
  initSync({ module: readFileSync(WASM_PATH) });
  const workloads = runWorkloads(smoke);
  const memory = smoke ? [probeMemory(1_000)] : FORMULA_SIZES.map(probeMemory);
  const mode: BenchmarkMode = smoke ? "smoke" : "full";
  const result: FormulaBenchmarkResult = {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.formula[mode],
    meta: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      ...protocolCaptureMeta(),
    },
    workloads,
    memory,
    gates: {
      passed: true,
      tolerance:
        "exact declared matrix; finite raw samples; broad 30s/512MiB ceilings; full 100K parse/load, recompute, criteria, and lookup p95 <5s and formula WASM delta <256MiB",
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
