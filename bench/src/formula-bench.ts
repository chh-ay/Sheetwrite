import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { CellStore, initSync } from "@sheetwrite/wasm";
import {
  dependencyClosureFormulas,
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
const FORMULA_SOURCE_URLS = {
  "bench/package.json": new URL("../package.json", import.meta.url),
  "bench/src/formula-bench.ts": new URL("./formula-bench.ts", import.meta.url),
  "bench/src/formula-dataset.ts": new URL("./formula-dataset.ts", import.meta.url),
  "bench/src/gate-protocol.ts": new URL("./gate-protocol.ts", import.meta.url),
  "bench/src/protocol-meta.ts": new URL("./protocol-meta.ts", import.meta.url),
  "bench/src/stats.ts": new URL("./stats.ts", import.meta.url),
  "bun.lock": new URL("../../bun.lock", import.meta.url),
  "packages/wasm/pkg/sheetwrite_wasm.js": new URL(
    "../../packages/wasm/pkg/sheetwrite_wasm.js",
    import.meta.url,
  ),
  "packages/wasm/pkg/sheetwrite_wasm_bg.wasm": WASM_PATH,
} as const;

export const FORMULA_BENCHMARK_SCHEMA_VERSION = 2 as const;
export const FORMULA_SIZES = [1_000, 10_000, 100_000] as const;
export const FORMULA_SOURCE_FILES = Object.keys(FORMULA_SOURCE_URLS).sort();
export const FORMULA_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_SAMPLES = 5;
const SMOKE_SAMPLES = 2;
export const FORMULA_PROTOCOL = "formula-benchmark-v2";
const TIMING_REGRESSION_RATIO = 1.25;
const TIMING_REGRESSION_FLOOR_MS = 0.1;
const STORE_MEMORY_SCHEMA = 3;
export const SEQUENCE_BLOCKER =
  "FormulaArraysWT: SEQUENCE roots are not classified as dynamic arrays, so the anchor evaluates without spill installation";
export const PRELIMINARY_BLOCKER =
  "preliminary capture has no schema-v2 baseline with attributed per-workload allocation samples";
export const FORMULA_GATE_TOLERANCE =
  "exact matrix/output/provenance; raw summaries derived; timing median/p95 <= max(baseline*1.25, baseline+0.1ms); no attributed allocation or aggregate WASM regression";
export const TIMING_METHOD =
  "one complete untimed warmup fixture, then monotonic wall time for each fresh fixture after forced GC";
export const ALLOCATION_METHOD =
  "post-run store-owned allocated bytes plus evaluator peak transient matrix bytes and matrix allocation count for each timed fixture";
export const CORRECTNESS_METHOD =
  "every warmup and measured fixture is checked against the workload's exact expected output before its sample is accepted";

export type FormulaOutput = number | string;

export interface FormulaAllocationSample {
  retainedBytes: number;
  peakTransientBytes: number;
  transientAllocations: number;
}

export interface FormulaAllocationStat {
  retainedBytes: Stat;
  peakTransientBytes: Stat;
  transientAllocations: Stat;
}

export interface FormulaWorkloadResult {
  id: string;
  size: number;
  samplesMs: number[];
  stat: Stat;
  allocationSamples?: FormulaAllocationSample[];
  allocationStat?: FormulaAllocationStat;
  output?: FormulaOutput;
}

export interface FormulaBlockedWorkload {
  id: string;
  size: number;
  status: "blocked";
  owner: "FormulaArraysWT";
  reason: string;
}

export interface FormulaMemoryResult {
  formulas: number;
  wasmDeltaBytes: number;
}

export interface FormulaRunnerProvenance {
  command: string[];
  bun: string;
  node: string;
  platform: string;
  kernel: string;
  arch: string;
  cpu: string;
  concurrency: 1;
  gc: "Bun.gc(true) before every measured sample";
}

export interface FormulaSourceProvenance {
  protocol: typeof FORMULA_PROTOCOL;
  commit: string;
  files: Record<string, string>;
  digest: string;
}

export interface PassedRegressionGate {
  status: "passed";
  baselineCommit: string;
  baselineSourceDigest: string;
}

export interface BlockedRegressionGate {
  status: "blocked";
  blocker: string;
}

export interface FormulaBenchmarkResult extends GateIdentity {
  schemaVersion?: typeof FORMULA_BENCHMARK_SCHEMA_VERSION;
  meta: {
    bun: string;
    platform: string;
    arch: string;
    commit: string;
    dirty: boolean;
    timestamp: string;
  };
  runner?: FormulaRunnerProvenance;
  source?: FormulaSourceProvenance;
  methodology?: {
    warmupSamples: 1;
    measuredSamples: number;
    timing: string;
    allocation: string;
    correctness: string;
  };
  workloads: FormulaWorkloadResult[];
  blockedWorkloads?: FormulaBlockedWorkload[];
  memory: FormulaMemoryResult[];
  gates: {
    passed: boolean;
    tolerance: string;
    regression?: PassedRegressionGate | BlockedRegressionGate;
  };
}

export type CompleteFormulaWorkloadResult = Omit<
  FormulaWorkloadResult,
  "allocationSamples" | "allocationStat" | "output"
> & {
  allocationSamples: FormulaAllocationSample[];
  allocationStat: FormulaAllocationStat;
  output: FormulaOutput;
};

export type CompleteFormulaBenchmarkResult = Omit<
  FormulaBenchmarkResult,
  "schemaVersion" | "runner" | "source" | "methodology" | "workloads" | "blockedWorkloads" | "gates"
> & {
  schemaVersion: typeof FORMULA_BENCHMARK_SCHEMA_VERSION;
  runner: FormulaRunnerProvenance;
  source: FormulaSourceProvenance;
  methodology: NonNullable<FormulaBenchmarkResult["methodology"]>;
  workloads: CompleteFormulaWorkloadResult[];
  blockedWorkloads: FormulaBlockedWorkload[];
  gates: Omit<FormulaBenchmarkResult["gates"], "regression"> & {
    regression: PassedRegressionGate | BlockedRegressionGate;
  };
};

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
  const range = smoke ? 10_000 : 100_000;
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
    formulaWorkloadKey({ id: "criteria-range-edit", size: range }),
    formulaWorkloadKey({ id: "lookup-range-edit", size: range }),
    formulaWorkloadKey({ id: "spill-filter-resize", size: range }),
    formulaWorkloadKey({ id: "sumproduct-vector-edit", size: range }),
    formulaWorkloadKey({ id: "sumproduct-matrix-edit", size: range }),
    formulaWorkloadKey({ id: "criteria-multi-range-edit", size: range }),
    formulaWorkloadKey({ id: "unicode-text-date-edit", size: 1_000 }),
    formulaWorkloadKey({ id: "percentile-covariance", size: range }),
    formulaWorkloadKey({ id: "let-reuse-edit", size: range }),
    formulaWorkloadKey({ id: "iterative-finance", size: 1_000 }),
    formulaWorkloadKey({ id: "incremental-dependency-closure-edit", size: range }),
  );
  return keys;
}

export function expectedFormulaBlockedWorkloadKeys(): string[] {
  return [formulaWorkloadKey({ id: "spill-sequence-admission", size: 100_000 })];
}

export function expectedFormulaMemoryKeys(mode: BenchmarkMode): string[] {
  const sizes = mode === "smoke" ? [1_000] : FORMULA_SIZES;
  return sizes.map((formulas) => `memory=formulas=${formulas}`);
}

function diamondOutput(levels: number): number {
  let expected = 2;
  for (let level = 0; level < levels; level++) expected = expected + 1 + (expected + 2);
  return expected;
}

export function expectedFormulaOutput(id: string, size: number): FormulaOutput {
  switch (id) {
    case "independent-parse-load":
    case "independent-first-recompute":
    case "linear-chain":
      return size;
    case "wide-fan-out-edit":
    case "scalar-edit-affects-1":
    case "scalar-edit-affects-1000":
    case "scalar-edit-affects-100000":
      return size + 10;
    case "scalar-edit-affects-0":
      return size + 1;
    case "diamond-edit":
      return diamondOutput(size);
    case "shared-range-edit":
      return 101;
    case "distinct-range-edit":
      return "11:10";
    case "cross-sheet-range-edit":
      return size + 100;
    case "topology-remove-add":
      return `2:${size}`;
    case "cycles":
      return "#CYCLE!";
    case "removed-sheet-ref":
      return "#REF!";
    case "error-propagation":
      return "#DIV/0!";
    case "criteria-range-edit":
      return size - Math.floor(size / 2) + 1;
    case "lookup-range-edit":
      return (size - 1) * 2;
    case "spill-filter-resize":
      return `${size - 1}:0`;
    case "sumproduct-vector-edit":
      return size * 11 + 4;
    case "sumproduct-matrix-edit":
      return size * 2 + 4;
    case "criteria-multi-range-edit":
      return size * 0.75 - 1;
    case "unicode-text-date-edit":
      return 173_864;
    case "percentile-covariance":
      return (size * size - 1) / 6 + size * 0.9 + 0.1;
    case "let-reuse-edit":
      return 3 * (size + 1);
    case "iterative-finance":
      return 0.08663094803653158 + 0.08144165646436567;
    case "incremental-dependency-closure-edit":
      return `12:${size + 1}`;
    default:
      throw new Error(`formula benchmark has no expected output for workload=${id};size=${size}`);
  }
}

interface TimedFixture {
  store: CellStore;
  run(): void;
  check(): FormulaOutput;
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

function outputsEqual(actual: FormulaOutput, expected: FormulaOutput): boolean {
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === "string" || typeof expected === "string") return actual === expected;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) <= tolerance;
}

function assertExpectedOutput(id: string, size: number, actual: FormulaOutput): void {
  const expected = expectedFormulaOutput(id, size);
  assert(
    outputsEqual(actual, expected),
    `${formulaWorkloadKey({ id, size })} expected ${String(expected)}, observed ${String(actual)}`,
  );
}

function exactInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`);
  }
}

function allocationAt(store: CellStore): FormulaAllocationSample {
  const memory = Array.from(store.memoryStats());
  const ownerCount = memory[1];
  assert(
    memory[0] === STORE_MEMORY_SCHEMA &&
      Number.isInteger(ownerCount) &&
      ownerCount! > 0 &&
      memory.length === 5 + ownerCount! * 3,
    "store memory stats schema",
  );
  const retainedBytes = memory.at(-1)!;
  const transient = Array.from(store.formulaMatrixResourceStats());
  assert(transient.length === 3, "formula matrix resource stats schema");
  const sample = {
    retainedBytes,
    peakTransientBytes: transient[1]!,
    transientAllocations: transient[2]!,
  };
  exactInteger(sample.retainedBytes, "allocation.retainedBytes");
  exactInteger(sample.peakTransientBytes, "allocation.peakTransientBytes");
  exactInteger(sample.transientAllocations, "allocation.transientAllocations");
  return sample;
}

function summarizeAllocations(samples: readonly FormulaAllocationSample[]): FormulaAllocationStat {
  return {
    retainedBytes: summarize(samples.map((sample) => sample.retainedBytes)),
    peakTransientBytes: summarize(samples.map((sample) => sample.peakTransientBytes)),
    transientAllocations: summarize(samples.map((sample) => sample.transientAllocations)),
  };
}

function collectFixture(
  id: string,
  size: number,
  factory: FixtureFactory,
  samples = DEFAULT_SAMPLES,
): CompleteFormulaWorkloadResult {
  const expected = expectedFormulaOutput(id, size);
  const warm = factory();
  warm.store.resetFormulaMatrixResourceStats();
  warm.run();
  assertExpectedOutput(id, size, warm.check());
  allocationAt(warm.store);
  warm.dispose();

  const raw = new Array<number>(samples);
  const allocationSamples = new Array<FormulaAllocationSample>(samples);
  let output = expected;
  for (let index = 0; index < samples; index++) {
    const fixture = factory();
    forceGc();
    fixture.store.resetFormulaMatrixResourceStats();
    const started = now();
    fixture.run();
    raw[index] = now() - started;
    allocationSamples[index] = allocationAt(fixture.store);
    output = fixture.check();
    assertExpectedOutput(id, size, output);
    fixture.dispose();
  }
  return {
    id,
    size,
    samplesMs: raw,
    stat: summarize(raw),
    allocationSamples,
    allocationStat: summarizeAllocations(allocationSamples),
    output,
  };
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
    store,
    run: () => setFormulas(store, sheet, formulas),
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count - 1, 1);
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
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function chainFixture(depth: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, depth);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, linearChain(depth));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, depth - 1, 0),
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
    store,
    run: () => {
      store.setNumber(sheet, 0, unrelated ? 2 : 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
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
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, levels - 1, 3),
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
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
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
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
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
    store,
    run: () => {
      store.setNumber(source, 0, 0, 2, 0);
      store.recompute(source);
    },
    check: () => numberAt(store, summary, count - 1, 0),
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
    store,
    run: () => {
      for (let row = 0; row < count; row += 2) store.clearCell(sheet, row, 1, 0);
      store.recompute(sheet);
      for (let row = 0; row < count; row += 2) {
        store.setFormula(sheet, row, 1, `=A${row + 1}+2`, 0);
      }
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
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
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, pairs - 1, 1) ?? "",
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
    store,
    run: () => {
      store.removeSheet(source);
    },
    check: () => textAt(store, summary, count - 1, 0) ?? "",
    dispose: () => store.free(),
  };
}

function errorPropagationFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setFormula(sheet, 0, 0, "=1/0", 0);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, count - 1, 1) ?? "",
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
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
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
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
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
  for (let row = 0; row < count; row++) store.setBool(sheet, row, 1, row + 1 < count, 0);
  store.setFormula(sheet, 0, 2, `=FILTER(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setBool(sheet, count - 1, 1, true, 0);
      store.recompute(sheet);
    },
    check: () =>
      `${numberAt(store, sheet, count - 1, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
    dispose: () => store.free(),
  };
}

function sumProductVectorFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => (row % 10) + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, () => 2),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUMPRODUCT(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
  };
}

function sumProductMatrixFixture(elements: number): TimedFixture {
  const columns = 10;
  const rows = elements / columns;
  assert(Number.isInteger(rows), "SUMPRODUCT matrix shape");
  const store = new CellStore();
  const sheet = store.addSheet(columns * 2 + 1, rows);
  for (let col = 0; col < columns; col++) {
    store.setColumnNumbers(
      sheet,
      col,
      0,
      numericColumn(rows, () => 1),
      0,
    );
    store.setColumnNumbers(
      sheet,
      columns + col,
      0,
      numericColumn(rows, () => 2),
      0,
    );
  }
  store.setFormula(sheet, 0, columns * 2, `=SUMPRODUCT(A1:J${rows},K1:T${rows})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, columns * 2),
    dispose: () => store.free(),
  };
}

function criteriaMultiRangeFixture(count: number): TimedFixture {
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
    numericColumn(count, (row) => row % 2),
    0,
  );
  store.setColumnNumbers(
    sheet,
    2,
    0,
    numericColumn(count, () => 2),
    0,
  );
  const threshold = count / 2;
  store.setFormula(
    sheet,
    0,
    3,
    `=SUMIFS(C1:C${count},A1:A${count},">=${threshold}",B1:B${count},1)+COUNTIFS(A1:A${count},"<${threshold}",B1:B${count},0)`,
    0,
  );
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
  };
}

function unicodeTextDateFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=UNICODE(MID($A$1,5,1))+DATEVALUE(RIGHT($A$1,10))", 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setString(sheet, 0, 0, "naïv😀-2024-03-01", 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function percentileCovarianceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    numericColumn(count, (row) => 2 * (row + 1) + 3),
    0,
  );
  store.setFormula(
    sheet,
    0,
    2,
    `=PERCENTILE.INC(A1:A${count},0.9)+COVARIANCE.P(A1:A${count},B1:B${count})`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
  };
}

function letReuseFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, () => 1),
    0,
  );
  store.setFormula(sheet, 0, 1, `=LET(total,SUM(A1:A${count}),total+total+total)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
  };
}

function iterativeFinanceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  const cashflows = [-70_000, 12_000, 15_000, 18_000, 21_000, 26_000];
  for (const [row, value] of cashflows.entries()) store.setNumber(sheet, row, 0, value, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=IRR($A$1:$A$6)+RATE(10,-150,1000)", 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function incrementalDependencyClosureFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, dependencyClosureFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
  };
}

function runWorkloads(smoke: boolean): CompleteFormulaWorkloadResult[] {
  const results: CompleteFormulaWorkloadResult[] = [];
  const sizes = smoke ? ([1_000] as const) : FORMULA_SIZES;
  const samples = smoke ? SMOKE_SAMPLES : DEFAULT_SAMPLES;
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
  const range = smoke ? 10_000 : 100_000;
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
    collectFixture("criteria-range-edit", range, () => criteriaRangeFixture(range), samples),
    collectFixture("lookup-range-edit", range, () => lookupRangeFixture(range), samples),
    collectFixture("spill-filter-resize", range, () => spillFilterResizeFixture(range), samples),
    collectFixture("sumproduct-vector-edit", range, () => sumProductVectorFixture(range), samples),
    collectFixture("sumproduct-matrix-edit", range, () => sumProductMatrixFixture(range), samples),
    collectFixture(
      "criteria-multi-range-edit",
      range,
      () => criteriaMultiRangeFixture(range),
      samples,
    ),
    collectFixture("unicode-text-date-edit", 1_000, () => unicodeTextDateFixture(1_000), samples),
    collectFixture(
      "percentile-covariance",
      range,
      () => percentileCovarianceFixture(range),
      samples,
    ),
    collectFixture("let-reuse-edit", range, () => letReuseFixture(range), samples),
    collectFixture("iterative-finance", 1_000, () => iterativeFinanceFixture(1_000), samples),
    collectFixture(
      "incremental-dependency-closure-edit",
      range,
      () => incrementalDependencyClosureFixture(range),
      samples,
    ),
  );
  return results;
}

function blockedWorkloads(): FormulaBlockedWorkload[] {
  return [
    {
      id: "spill-sequence-admission",
      size: 100_000,
      status: "blocked",
      owner: "FormulaArraysWT",
      reason: SEQUENCE_BLOCKER,
    },
  ];
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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function formulaSourceDigest(
  commit: string,
  files: Readonly<Record<string, string>>,
): string {
  return sha256(JSON.stringify({ protocol: FORMULA_PROTOCOL, commit, files }));
}

function currentFormulaSourceProvenance(commit: string): FormulaSourceProvenance {
  const files: Record<string, string> = {};
  for (const path of FORMULA_SOURCE_FILES) {
    files[path] = sha256(
      readFileSync(FORMULA_SOURCE_URLS[path as keyof typeof FORMULA_SOURCE_URLS]),
    );
  }
  return {
    protocol: FORMULA_PROTOCOL,
    commit,
    files,
    digest: formulaSourceDigest(commit, files),
  };
}

function runnerCommand(mode: BenchmarkMode, preliminary: boolean): string[] {
  return [
    "bun",
    "run",
    "src/formula-bench.ts",
    ...(mode === "smoke" ? ["--smoke"] : []),
    ...(preliminary ? ["--preliminary"] : []),
  ];
}

function currentRunnerProvenance(
  mode: BenchmarkMode,
  preliminary: boolean,
): FormulaRunnerProvenance {
  return {
    command: runnerCommand(mode, preliminary),
    bun: Bun.version,
    node: process.versions.node,
    platform: process.platform,
    kernel: release(),
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    concurrency: 1,
    gc: "Bun.gc(true) before every measured sample",
  };
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactObjectKeys(value: unknown, expected: readonly string[], path: string): void {
  const record = objectRecord(value, path);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${path} must contain exactly ${wanted.join(", ")}`);
  }
}

function exactString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function validateStatShape(stat: Stat, path: string): void {
  exactObjectKeys(stat, ["median", "p95", "mean", "stddev", "min", "max", "iters"], path);
}

function validateArtifactBound(result: FormulaBenchmarkResult): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(result);
  } catch (error) {
    throw new Error(`formula artifact is not serializable: ${String(error)}`);
  }
  const bytes = Buffer.byteLength(serialized);
  if (bytes > FORMULA_ARTIFACT_MAX_BYTES) {
    throw new Error(
      `formula artifact exceeded the ${FORMULA_ARTIFACT_MAX_BYTES} byte safety ceiling: ${bytes}`,
    );
  }
}

function validateProvenance(result: CompleteFormulaBenchmarkResult, preliminary: boolean): void {
  exactObjectKeys(
    result.meta,
    ["bun", "platform", "arch", "commit", "dirty", "timestamp"],
    "formula metadata",
  );
  for (const field of ["bun", "platform", "arch"] as const) {
    exactString(result.meta[field], `formula metadata.${field}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(result.meta.commit)) {
    throw new Error("formula metadata.commit must be a 40-character lowercase Git SHA");
  }
  if (typeof result.meta.dirty !== "boolean") {
    throw new Error("formula metadata.dirty must be boolean");
  }
  if (
    typeof result.meta.timestamp !== "string" ||
    !Number.isFinite(Date.parse(result.meta.timestamp)) ||
    new Date(result.meta.timestamp).toISOString() !== result.meta.timestamp
  ) {
    throw new Error("formula metadata.timestamp must be a canonical ISO timestamp");
  }

  exactObjectKeys(
    result.runner,
    ["command", "bun", "node", "platform", "kernel", "arch", "cpu", "concurrency", "gc"],
    "formula runner provenance",
  );
  if (
    !Array.isArray(result.runner.command) ||
    result.runner.command.some((part) => typeof part !== "string") ||
    JSON.stringify(result.runner.command) !==
      JSON.stringify(runnerCommand(result.mode, preliminary))
  ) {
    throw new Error("formula runner provenance.command does not match the declared capture mode");
  }
  for (const field of ["bun", "node", "platform", "kernel", "arch", "cpu"] as const) {
    exactString(result.runner[field], `formula runner provenance.${field}`);
  }
  if (
    result.runner.concurrency !== 1 ||
    result.runner.gc !== "Bun.gc(true) before every measured sample"
  ) {
    throw new Error(
      "formula runner provenance does not declare the controlled single-runner GC policy",
    );
  }
  if (
    result.runner.bun !== result.meta.bun ||
    result.runner.platform !== result.meta.platform ||
    result.runner.arch !== result.meta.arch
  ) {
    throw new Error("formula runner provenance disagrees with formula metadata");
  }

  exactObjectKeys(
    result.source,
    ["protocol", "commit", "files", "digest"],
    "formula source provenance",
  );
  if (result.source.protocol !== FORMULA_PROTOCOL || result.source.commit !== result.meta.commit) {
    throw new Error("formula source provenance protocol/commit does not match metadata");
  }
  exactObjectKeys(result.source.files, FORMULA_SOURCE_FILES, "formula source provenance.files");
  for (const path of FORMULA_SOURCE_FILES) {
    if (!/^[0-9a-f]{64}$/u.test(result.source.files[path] ?? "")) {
      throw new Error(`formula source provenance.files.${path} must be a SHA-256 digest`);
    }
  }
  const digest = formulaSourceDigest(result.source.commit, result.source.files);
  if (result.source.digest !== digest) {
    throw new Error("formula source provenance.digest does not match its file hashes");
  }
}

function validateAllocation(
  workload: CompleteFormulaWorkloadResult,
  expectedSamples: number,
  key: string,
): void {
  if (
    !Array.isArray(workload.allocationSamples) ||
    workload.allocationSamples.length !== expectedSamples
  ) {
    throw new Error(`${key}.allocationSamples must contain ${expectedSamples} raw samples`);
  }
  for (const [index, sample] of workload.allocationSamples.entries()) {
    exactObjectKeys(
      sample,
      ["retainedBytes", "peakTransientBytes", "transientAllocations"],
      `${key}.allocationSamples[${index}]`,
    );
    exactInteger(sample.retainedBytes, `${key}.allocationSamples[${index}].retainedBytes`);
    exactInteger(
      sample.peakTransientBytes,
      `${key}.allocationSamples[${index}].peakTransientBytes`,
    );
    exactInteger(
      sample.transientAllocations,
      `${key}.allocationSamples[${index}].transientAllocations`,
    );
  }
  exactObjectKeys(
    workload.allocationStat,
    ["retainedBytes", "peakTransientBytes", "transientAllocations"],
    `${key}.allocationStat`,
  );
  for (const field of ["retainedBytes", "peakTransientBytes", "transientAllocations"] as const) {
    validateStatShape(workload.allocationStat[field], `${key}.allocationStat.${field}`);
    validateRawStat(
      workload.allocationSamples.map((sample) => sample[field]),
      workload.allocationStat[field],
      `${key}.allocation.${field}`,
    );
  }
  if (workload.allocationStat.retainedBytes.p95 >= 512 * 1024 * 1024) {
    throw new Error(`${key} exceeded the 512 MiB attributed retained-allocation ceiling`);
  }
  if (workload.allocationStat.peakTransientBytes.p95 >= 256 * 1024 * 1024) {
    throw new Error(`${key} exceeded the 256 MiB transient-allocation ceiling`);
  }
  if (workload.allocationStat.transientAllocations.p95 >= 1_000_000) {
    throw new Error(`${key} exceeded the transient-allocation-count ceiling`);
  }
}

function assertCompleteFormulaResult(
  result: FormulaBenchmarkResult,
): asserts result is CompleteFormulaBenchmarkResult {
  if (
    result.schemaVersion === undefined ||
    result.runner === undefined ||
    result.source === undefined ||
    result.methodology === undefined ||
    result.blockedWorkloads === undefined ||
    result.gates.regression === undefined ||
    result.workloads.some(
      (workload) =>
        workload.allocationSamples === undefined ||
        workload.allocationStat === undefined ||
        workload.output === undefined,
    )
  ) {
    throw new Error("formula artifact is missing schema-v2 evidence fields");
  }
}

function validateFormulaEvidence(
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode,
  requirePassedGate: boolean,
): asserts result is CompleteFormulaBenchmarkResult {
  validateArtifactBound(result);
  assertGateIdentity("formula", expectedMode, result);
  if (!Array.isArray(result.workloads)) throw new Error("formula workloads must be an array");
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
  validateExactMatrix(
    "formula workload",
    expectedFormulaWorkloadKeys(expectedMode),
    result.workloads.map(formulaWorkloadKey),
  );

  exactObjectKeys(
    result,
    [
      "protocolVersion",
      "mode",
      "matrixId",
      "schemaVersion",
      "meta",
      "runner",
      "source",
      "methodology",
      "workloads",
      "blockedWorkloads",
      "memory",
      "gates",
    ],
    "formula artifact",
  );
  for (const workload of result.workloads) {
    exactObjectKeys(
      workload,
      ["id", "size", "samplesMs", "stat", "allocationSamples", "allocationStat", "output"],
      "formula workload",
    );
  }
  assertCompleteFormulaResult(result);
  if (result.schemaVersion !== FORMULA_BENCHMARK_SCHEMA_VERSION) {
    throw new Error(
      `formula schema mismatch: expected ${FORMULA_BENCHMARK_SCHEMA_VERSION}, observed ${String(result.schemaVersion)}`,
    );
  }
  const regression = objectRecord(result.gates.regression, "formula gates.regression");
  const preliminary = regression.status === "blocked";
  validateProvenance(result, preliminary);

  const expectedSamples = expectedMode === "smoke" ? SMOKE_SAMPLES : DEFAULT_SAMPLES;
  exactObjectKeys(
    result.methodology,
    ["warmupSamples", "measuredSamples", "timing", "allocation", "correctness"],
    "formula methodology",
  );
  if (
    result.methodology.warmupSamples !== 1 ||
    result.methodology.measuredSamples !== expectedSamples ||
    result.methodology.timing !== TIMING_METHOD ||
    result.methodology.allocation !== ALLOCATION_METHOD ||
    result.methodology.correctness !== CORRECTNESS_METHOD
  ) {
    throw new Error("formula methodology does not match the declared warmup/sample protocol");
  }
  for (const workload of result.workloads) {
    const key = formulaWorkloadKey(workload);
    if (!Array.isArray(workload.samplesMs) || workload.samplesMs.length !== expectedSamples) {
      throw new Error(`${key}.samplesMs must contain ${expectedSamples} post-warmup raw samples`);
    }
    validateStatShape(workload.stat, `${key}.stat`);
    validateRawStat(workload.samplesMs, workload.stat, key);
    validateAllocation(workload, expectedSamples, key);
    const expected = expectedFormulaOutput(workload.id, workload.size);
    if (!outputsEqual(workload.output, expected)) {
      throw new Error(
        `${key}.output expected ${String(expected)}, observed ${String(workload.output)}`,
      );
    }
    if (workload.stat.p95 >= 30_000) {
      throw new Error(`${key} exceeded the 30 second absolute safety ceiling`);
    }
  }

  if (!Array.isArray(result.blockedWorkloads)) {
    throw new Error("formula blockedWorkloads must be an array");
  }
  for (const blocked of result.blockedWorkloads) {
    exactObjectKeys(
      blocked,
      ["id", "size", "status", "owner", "reason"],
      "formula blocked workload",
    );
    if (
      blocked.status !== "blocked" ||
      blocked.owner !== "FormulaArraysWT" ||
      blocked.reason !== SEQUENCE_BLOCKER
    ) {
      throw new Error(
        "formula blocked workload does not preserve the exact SEQUENCE capability blocker",
      );
    }
  }
  validateExactMatrix(
    "formula blocked workload",
    expectedFormulaBlockedWorkloadKeys(),
    result.blockedWorkloads.map(formulaWorkloadKey),
  );

  if (!Array.isArray(result.memory)) throw new Error("formula memory must be an array");
  for (const memory of result.memory) {
    exactObjectKeys(memory, ["formulas", "wasmDeltaBytes"], "formula memory");
    if (!Number.isInteger(memory.formulas) || memory.formulas <= 0) {
      throw new Error("formula memory contains a malformed identity");
    }
  }
  validateExactMatrix(
    "formula memory",
    expectedFormulaMemoryKeys(expectedMode),
    result.memory.map((memory) => `memory=formulas=${memory.formulas}`),
  );
  for (const memory of result.memory) {
    const key = `memory=formulas=${memory.formulas}`;
    assertFiniteNonNegative(memory.wasmDeltaBytes, `${key}.wasmDeltaBytes`);
    exactInteger(memory.wasmDeltaBytes, `${key}.wasmDeltaBytes`);
    if (memory.wasmDeltaBytes >= 512 * 1024 * 1024) {
      throw new Error(`${key} exceeded the 512 MiB absolute safety ceiling`);
    }
  }

  exactObjectKeys(result.gates, ["passed", "tolerance", "regression"], "formula gates");
  if (result.gates.tolerance !== FORMULA_GATE_TOLERANCE) {
    throw new Error("formula gates.tolerance does not match the enforced regression policy");
  }
  if (requirePassedGate) {
    if (result.gates.passed !== true || regression.status !== "passed") {
      throw new Error("formula result does not contain a successful regression gate record");
    }
    exactObjectKeys(
      regression,
      ["status", "baselineCommit", "baselineSourceDigest"],
      "formula gates.regression",
    );
    if (
      typeof regression.baselineCommit !== "string" ||
      !/^[0-9a-f]{40}$/u.test(regression.baselineCommit) ||
      typeof regression.baselineSourceDigest !== "string" ||
      !/^[0-9a-f]{64}$/u.test(regression.baselineSourceDigest)
    ) {
      throw new Error("formula regression gate has malformed baseline provenance");
    }
  } else {
    if (
      result.gates.passed !== false ||
      regression.status !== "blocked" ||
      regression.blocker !== PRELIMINARY_BLOCKER
    ) {
      throw new Error(
        "formula preliminary result must fail closed with its exact baseline blocker",
      );
    }
    exactObjectKeys(regression, ["status", "blocker"], "formula gates.regression");
  }

  if (expectedMode === "full") {
    for (const id of [
      "independent-parse-load",
      "independent-first-recompute",
      "criteria-range-edit",
      "lookup-range-edit",
      "sumproduct-vector-edit",
      "sumproduct-matrix-edit",
      "criteria-multi-range-edit",
      "percentile-covariance",
      "let-reuse-edit",
      "incremental-dependency-closure-edit",
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

export function validateFormulaBenchmark(
  result: FormulaBenchmarkResult,
  expectedMode: BenchmarkMode = result.mode,
): asserts result is CompleteFormulaBenchmarkResult {
  validateFormulaEvidence(result, expectedMode, true);
}

function timingRegressionLimit(baseline: number): number {
  return Math.max(baseline * TIMING_REGRESSION_RATIO, baseline + TIMING_REGRESSION_FLOOR_MS);
}

export function validateFormulaRegression(
  candidate: FormulaBenchmarkResult,
  baseline: FormulaBenchmarkResult,
): void {
  validateFormulaBenchmark(baseline, candidate.mode);
  validateFormulaBenchmark(candidate, candidate.mode);
  const regression = candidate.gates.regression as PassedRegressionGate;
  if (
    regression.baselineCommit !== baseline.meta.commit ||
    regression.baselineSourceDigest !== baseline.source.digest
  ) {
    throw new Error("formula regression gate is not bound to the supplied baseline provenance");
  }
  const baselineWorkloads = new Map(
    baseline.workloads.map((workload) => [formulaWorkloadKey(workload), workload]),
  );
  for (const workload of candidate.workloads) {
    const key = formulaWorkloadKey(workload);
    const previous = baselineWorkloads.get(key)!;
    for (const field of ["median", "p95"] as const) {
      const limit = timingRegressionLimit(previous.stat[field]);
      if (workload.stat[field] > limit) {
        throw new Error(
          `${key}.${field} regression: baseline ${previous.stat[field]}, candidate ${workload.stat[field]}, limit ${limit}`,
        );
      }
    }
    for (const allocation of [
      "retainedBytes",
      "peakTransientBytes",
      "transientAllocations",
    ] as const) {
      for (const field of ["median", "p95"] as const) {
        const before = previous.allocationStat[allocation][field];
        const after = workload.allocationStat[allocation][field];
        if (after > before) {
          throw new Error(
            `${key}.allocation.${allocation}.${field} regression: baseline ${before}, candidate ${after}`,
          );
        }
      }
    }
  }
  const baselineMemory = new Map(
    baseline.memory.map((entry) => [entry.formulas, entry.wasmDeltaBytes]),
  );
  for (const memory of candidate.memory) {
    const before = baselineMemory.get(memory.formulas)!;
    if (memory.wasmDeltaBytes > before) {
      throw new Error(
        `memory=formulas=${memory.formulas}.wasmDeltaBytes regression: baseline ${before}, candidate ${memory.wasmDeltaBytes}`,
      );
    }
  }
}

function validateCurrentCaptureProvenance(
  result: CompleteFormulaBenchmarkResult,
  preliminary: boolean,
): void {
  const currentSource = currentFormulaSourceProvenance(result.meta.commit);
  if (JSON.stringify(result.source) !== JSON.stringify(currentSource)) {
    throw new Error("formula capture source provenance does not match current source bytes");
  }
  const currentRunner = currentRunnerProvenance(result.mode, preliminary);
  if (JSON.stringify(result.runner) !== JSON.stringify(currentRunner)) {
    throw new Error("formula capture runner provenance does not match the current runner");
  }
}

function markdown(result: CompleteFormulaBenchmarkResult): string {
  const lines = [
    "# Formula engine benchmark",
    "",
    `Bun ${result.meta.bun} · ${result.meta.platform}/${result.meta.arch} · median (p95) ms · raw post-warmup timing/allocation samples in JSON.`,
    "",
    "| workload | size | median (p95) ms | retained p95 | transient peak p95 | samples |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const workload of result.workloads) {
    lines.push(
      `| ${workload.id} | ${workload.size.toLocaleString("en-US")} | ${ms(workload.stat.median)} (${ms(workload.stat.p95)}) | ${mib(workload.allocationStat.retainedBytes.p95)} | ${mib(workload.allocationStat.peakTransientBytes.p95)} | ${workload.samplesMs.length} |`,
    );
  }
  lines.push("", "## Blocked capability workloads", "");
  for (const blocked of result.blockedWorkloads) {
    lines.push(`- ${blocked.id} (${blocked.size.toLocaleString("en-US")}): ${blocked.reason}`);
  }
  lines.push("", "## Isolated formula memory", "", "| formulas | WASM delta |", "|---:|---:|");
  for (const memory of result.memory) {
    lines.push(`| ${memory.formulas.toLocaleString("en-US")} | ${mib(memory.wasmDeltaBytes)} |`);
  }
  lines.push(
    "",
    result.gates.passed
      ? `Regression gate passed against ${
          (result.gates.regression as PassedRegressionGate).baselineCommit
        }.`
      : `Preliminary evidence only; gate blocked: ${
          (result.gates.regression as BlockedRegressionGate).blocker
        }.`,
    "",
  );
  return lines.join("\n");
}

async function runBenchmark(smoke: boolean, preliminary: boolean): Promise<void> {
  const mode: BenchmarkMode = smoke ? "smoke" : "full";
  let baseline: FormulaBenchmarkResult | undefined;
  if (!preliminary) {
    const rawBaseline = readFileSync(
      new URL("../results/formula-results.json", import.meta.url),
      "utf8",
    );
    const baselineBytes = Buffer.byteLength(rawBaseline);
    if (baselineBytes > FORMULA_ARTIFACT_MAX_BYTES) {
      throw new Error(
        `formula baseline artifact exceeded the ${FORMULA_ARTIFACT_MAX_BYTES} byte safety ceiling: ${baselineBytes}`,
      );
    }
    baseline = JSON.parse(rawBaseline) as FormulaBenchmarkResult;
    validateFormulaBenchmark(baseline, mode);
  }

  initSync({ module: readFileSync(WASM_PATH) });
  const capture = protocolCaptureMeta();
  const workloads = runWorkloads(smoke);
  const memory = smoke ? [probeMemory(1_000)] : FORMULA_SIZES.map(probeMemory);
  const regression: PassedRegressionGate | BlockedRegressionGate = baseline
    ? {
        status: "passed",
        baselineCommit: baseline.meta.commit,
        baselineSourceDigest: baseline.source.digest,
      }
    : { status: "blocked", blocker: PRELIMINARY_BLOCKER };
  const result: CompleteFormulaBenchmarkResult = {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.formula[mode],
    schemaVersion: FORMULA_BENCHMARK_SCHEMA_VERSION,
    meta: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      ...capture,
    },
    runner: currentRunnerProvenance(mode, preliminary),
    source: currentFormulaSourceProvenance(capture.commit),
    methodology: {
      warmupSamples: 1,
      measuredSamples: smoke ? SMOKE_SAMPLES : DEFAULT_SAMPLES,
      timing: TIMING_METHOD,
      allocation: ALLOCATION_METHOD,
      correctness: CORRECTNESS_METHOD,
    },
    workloads,
    blockedWorkloads: blockedWorkloads(),
    memory,
    gates: {
      passed: Boolean(baseline),
      tolerance: FORMULA_GATE_TOLERANCE,
      regression,
    },
  };
  validateCurrentCaptureProvenance(result, preliminary);
  if (baseline) validateFormulaRegression(result, baseline);
  else validateFormulaEvidence(result, mode, false);
  if (!smoke) {
    await Bun.write(
      new URL("../results/formula-results.json", import.meta.url),
      `${JSON.stringify(result, null, 2)}\n`,
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
    const preliminary = process.argv.includes("--preliminary");
    await runBenchmark(process.argv.includes("--smoke"), preliminary);
  }
}
