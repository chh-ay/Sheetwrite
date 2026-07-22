import { describe, expect, it } from "bun:test";
import {
  ALLOCATION_METHOD,
  type CompleteFormulaBenchmarkResult,
  CORRECTNESS_METHOD,
  expectedFormulaBlockedWorkloadKeys,
  expectedFormulaMemoryKeys,
  expectedFormulaOutput,
  expectedFormulaWorkloadKeys,
  FORMULA_ARTIFACT_MAX_BYTES,
  FORMULA_BENCHMARK_SCHEMA_VERSION,
  FORMULA_GATE_TOLERANCE,
  FORMULA_PROTOCOL,
  FORMULA_SOURCE_FILES,
  formulaSourceDigest,
  PRELIMINARY_BLOCKER,
  SEQUENCE_BLOCKER,
  TIMING_METHOD,
  validateFormulaBenchmark,
  validateFormulaRegression,
} from "../src/formula-bench.js";
import {
  dependencyClosureFormulas,
  diamondFormulas,
  distinctRangeFormulas,
  type FormulaCell,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "../src/formula-dataset.js";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import { summarize } from "../src/stats.js";

const COMMIT = "0".repeat(40);
const SOURCE_HASH = "a".repeat(64);

function formulaFixture(mode: "full" | "smoke" = "smoke"): CompleteFormulaBenchmarkResult {
  const sampleCount = mode === "smoke" ? 2 : 5;
  const samples = Array.from({ length: sampleCount }, () => 1);
  const allocationSamples = Array.from({ length: sampleCount }, () => ({
    retainedBytes: 1024,
    peakTransientBytes: 0,
    transientAllocations: 0,
  }));
  const files = Object.fromEntries(FORMULA_SOURCE_FILES.map((path) => [path, SOURCE_HASH]));
  const sourceDigest = formulaSourceDigest(COMMIT, files);
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.formula[mode],
    schemaVersion: FORMULA_BENCHMARK_SCHEMA_VERSION,
    meta: {
      bun: "1.3.14",
      platform: "linux",
      arch: "x64",
      commit: COMMIT,
      dirty: false,
      timestamp: "2026-07-13T00:00:00.000Z",
    },
    runner: {
      command: ["bun", "run", "src/formula-bench.ts", ...(mode === "smoke" ? ["--smoke"] : [])],
      bun: "1.3.14",
      node: "24.3.0",
      platform: "linux",
      kernel: "test-kernel",
      arch: "x64",
      cpu: "test-cpu",
      concurrency: 1,
      gc: "Bun.gc(true) before every measured sample",
    },
    source: {
      protocol: FORMULA_PROTOCOL,
      commit: COMMIT,
      files,
      digest: sourceDigest,
    },
    methodology: {
      warmupSamples: 1,
      measuredSamples: sampleCount,
      timing: TIMING_METHOD,
      allocation: ALLOCATION_METHOD,
      correctness: CORRECTNESS_METHOD,
    },
    workloads: expectedFormulaWorkloadKeys(mode).map((key) => {
      const match = /^workload=(.*);size=(\d+)$/u.exec(key);
      if (!match) throw new Error(`invalid fixture key ${key}`);
      const id = match[1]!;
      const size = Number(match[2]);
      return {
        id,
        size,
        samplesMs: [...samples],
        stat: summarize(samples),
        allocationSamples: structuredClone(allocationSamples),
        allocationStat: {
          retainedBytes: summarize(allocationSamples.map((sample) => sample.retainedBytes)),
          peakTransientBytes: summarize(
            allocationSamples.map((sample) => sample.peakTransientBytes),
          ),
          transientAllocations: summarize(
            allocationSamples.map((sample) => sample.transientAllocations),
          ),
        },
        output: expectedFormulaOutput(id, size),
      };
    }),
    blockedWorkloads: [
      {
        id: "spill-sequence-admission",
        size: 100_000,
        status: "blocked",
        owner: "FormulaArraysWT",
        reason: SEQUENCE_BLOCKER,
      },
    ],
    memory: expectedFormulaMemoryKeys(mode).map((key) => ({
      formulas: Number(key.slice("memory=formulas=".length)),
      wasmDeltaBytes: 1024,
    })),
    gates: {
      passed: true,
      tolerance: FORMULA_GATE_TOLERANCE,
      regression: {
        status: "passed",
        baselineCommit: COMMIT,
        baselineSourceDigest: sourceDigest,
      },
    },
  };
}

function referencedCells(source: string): Array<{ row: number; col: number }> {
  return [...source.matchAll(/\$?([A-Z]+)\$?(\d+)/gu)].map((match) => {
    const letters = match[1]!;
    let col = 0;
    for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64;
    return { row: Number(match[2]) - 1, col: col - 1 };
  });
}

function assertAcyclic(cells: readonly FormulaCell[]): void {
  const key = ({ row, col }: Pick<FormulaCell, "row" | "col">) => `${row}:${col}`;
  const formulas = new Map(cells.map((cell) => [key(cell), cell]));
  const state = new Map<string, "visiting" | "visited">();
  const visit = (cell: FormulaCell): void => {
    const cellKey = key(cell);
    expect(referencedCells(cell.src).some((dependency) => key(dependency) === cellKey)).toBeFalse();
    if (state.get(cellKey) === "visiting") throw new Error(`formula cycle at ${cellKey}`);
    if (state.get(cellKey) === "visited") return;
    state.set(cellKey, "visiting");
    for (const dependency of referencedCells(cell.src)) {
      const formula = formulas.get(key(dependency));
      if (formula) visit(formula);
    }
    state.set(cellKey, "visited");
  };
  for (const cell of cells) visit(cell);
}

describe("formula benchmark datasets", () => {
  it("preserves dependency topology as dataset sizes grow", () => {
    for (const size of [2, 7]) {
      const independent = independentFormulas(size);
      expect(independent).toHaveLength(size);
      expect(
        independent.every((cell) => {
          const [dependency] = referencedCells(cell.src);
          return cell.col === 1 && dependency?.row === cell.row && dependency.col === 0;
        }),
      ).toBeTrue();

      const chain = linearChain(size);
      expect(chain).toHaveLength(size - 1);
      expect(
        chain.every((cell) => {
          const [dependency] = referencedCells(cell.src);
          return cell.col === 0 && dependency?.row === cell.row - 1 && dependency.col === 0;
        }),
      ).toBeTrue();

      const fanOut = fanOutFormulas(size);
      expect(fanOut).toHaveLength(size);
      expect(new Set(fanOut.flatMap((cell) => cell.src.match(/\$[A-Z]+\$\d+/gu) ?? [])).size).toBe(
        1,
      );

      const diamonds = diamondFormulas(size);
      expect(diamonds).toHaveLength(size * 3);
      for (let row = 0; row < size; row++) {
        const level = diamonds.filter((cell) => cell.row === row);
        expect(level.map((cell) => cell.col).sort()).toEqual([1, 2, 3]);
        const join = level.find((cell) => cell.col === 3)!;
        expect(referencedCells(join.src)).toEqual([
          { row, col: 1 },
          { row, col: 2 },
        ]);
      }

      const shared = sharedRangeFormulas(size, size * 10);
      expect(shared).toHaveLength(size);
      expect(
        new Set(shared.map((cell) => cell.src.match(/\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/u)?.[0])).size,
      ).toBe(1);

      const distinct = distinctRangeFormulas(size);
      expect(distinct).toHaveLength(size);
      const ranges = distinct.map((cell) => {
        const match = /SUM\(A(\d+):A(\d+)\)/u.exec(cell.src);
        expect(match).not.toBeNull();
        return { start: Number(match![1]), end: Number(match![2]) };
      });
      expect(ranges.every(({ start, end }) => end - start + 1 === 10)).toBeTrue();
      expect(ranges.slice(1).every((range, index) => range.start === ranges[index]!.end + 1)).toBe(
        true,
      );

      const closures = dependencyClosureFormulas(size);
      expect(closures).toHaveLength(size * 2);
      for (let row = 0; row < size; row++) {
        expect(closures.filter((cell) => cell.row === row).map((cell) => cell.col)).toEqual([1, 2]);
        expect(referencedCells(closures[row * 2]!.src)).toEqual([{ row, col: 0 }]);
        expect(referencedCells(closures[row * 2 + 1]!.src)).toEqual([{ row, col: 1 }]);
      }

      for (const formulas of [independent, chain, fanOut, diamonds, shared, distinct, closures]) {
        assertAcyclic(formulas);
      }
    }
  });
});

describe("formula benchmark schema", () => {
  it("accepts exact finite matrices and keeps full evidence materially broader than smoke", () => {
    const smoke = formulaFixture("smoke");
    const full = formulaFixture("full");
    expect(() => validateFormulaBenchmark(smoke, "smoke")).not.toThrow();
    expect(() => validateFormulaBenchmark(full, "full")).not.toThrow();
    expect(Math.max(...full.workloads.map((entry) => entry.size))).toBeGreaterThan(
      Math.max(...smoke.workloads.map((entry) => entry.size)),
    );
    expect(new Set(full.workloads.map((entry) => entry.id))).toEqual(
      new Set(smoke.workloads.map((entry) => entry.id)),
    );
    expect(full.workloads.every((entry) => entry.samplesMs.length === 5)).toBeTrue();
    expect(smoke.workloads.every((entry) => entry.samplesMs.length === 2)).toBeTrue();
  });

  it("rejects missing, duplicate, unexpected, and malformed workload identities", () => {
    const named = { id: "independent-parse-load", size: 1_000 } as const;
    const key = `workload=${named.id};size=${named.size}`;
    const matchesNamed = (entry: CompleteFormulaBenchmarkResult["workloads"][number]) =>
      entry.id === named.id && entry.size === named.size;

    const missing = formulaFixture();
    missing.workloads = missing.workloads.filter((entry) => !matchesNamed(entry));
    expect(() => validateFormulaBenchmark(missing, "smoke")).toThrow(`missing ${key}`);

    const duplicate = formulaFixture();
    duplicate.workloads.push(structuredClone(duplicate.workloads.find(matchesNamed)!));
    expect(() => validateFormulaBenchmark(duplicate, "smoke")).toThrow(`duplicate ${key}`);

    const unexpected = formulaFixture();
    const extra = structuredClone(unexpected.workloads[0]!);
    extra.id = "not-declared";
    extra.size = 7;
    unexpected.workloads.push(extra);
    expect(() => validateFormulaBenchmark(unexpected, "smoke")).toThrow(
      "unexpected workload=not-declared;size=7",
    );

    const malformed = formulaFixture();
    Object.defineProperty(malformed.workloads.find(matchesNamed)!, "size", { value: "1000" });
    expect(() => validateFormulaBenchmark(malformed, "smoke")).toThrow(
      "formula workload contains a malformed identity",
    );
  });

  it("fails closed for missing raw samples and forged summaries", () => {
    const missingTiming = formulaFixture();
    missingTiming.workloads[0]!.samplesMs = [];
    expect(() => validateFormulaBenchmark(missingTiming)).toThrow(
      "must contain 2 post-warmup raw samples",
    );

    const missingAllocation = formulaFixture();
    missingAllocation.workloads[0]!.allocationSamples = [];
    expect(() => validateFormulaBenchmark(missingAllocation)).toThrow(
      "allocationSamples must contain 2 raw samples",
    );

    const forgedTiming = formulaFixture();
    forgedTiming.workloads[0]!.stat = { ...forgedTiming.workloads[0]!.stat, stddev: 0.1 };
    expect(() => validateFormulaBenchmark(forgedTiming)).toThrow("does not match raw samples");

    const forgedAllocation = formulaFixture();
    forgedAllocation.workloads[0]!.allocationStat.retainedBytes = {
      ...forgedAllocation.workloads[0]!.allocationStat.retainedBytes,
      stddev: 0.1,
    };
    expect(() => validateFormulaBenchmark(forgedAllocation)).toThrow("does not match raw samples");
  });

  it("rejects malformed or internally inconsistent runner/source provenance", () => {
    const commit = formulaFixture();
    commit.meta.commit = "A".repeat(40);
    expect(() => validateFormulaBenchmark(commit)).toThrow("lowercase Git SHA");

    const command = formulaFixture();
    command.runner.command.push("--invented");
    expect(() => validateFormulaBenchmark(command)).toThrow("command does not match");

    const fileHash = formulaFixture();
    fileHash.source.files[FORMULA_SOURCE_FILES[0]!] = "short";
    expect(() => validateFormulaBenchmark(fileHash)).toThrow("must be a SHA-256 digest");

    const digest = formulaFixture();
    digest.source.digest = "b".repeat(64);
    expect(() => validateFormulaBenchmark(digest)).toThrow("digest does not match");

    const extraFile = formulaFixture();
    extraFile.source.files["unbounded"] = SOURCE_HASH;
    expect(() => validateFormulaBenchmark(extraFile)).toThrow("must contain exactly");
  });

  it("rejects wrong persisted outputs and unbounded artifacts", () => {
    const wrong = formulaFixture();
    wrong.workloads[0]!.output = -1;
    expect(() => validateFormulaBenchmark(wrong)).toThrow(".output expected");

    const unbounded = formulaFixture();
    unbounded.runner.cpu = "x".repeat(FORMULA_ARTIFACT_MAX_BYTES);
    expect(() => validateFormulaBenchmark(unbounded)).toThrow("artifact exceeded");
  });

  it("keeps SEQUENCE admission explicitly blocked without passable sample fields", () => {
    expect(expectedFormulaBlockedWorkloadKeys()).toEqual([
      "workload=spill-sequence-admission;size=100000",
    ]);
    const missing = formulaFixture();
    missing.blockedWorkloads = [];
    expect(() => validateFormulaBenchmark(missing)).toThrow(
      "missing workload=spill-sequence-admission;size=100000",
    );

    const disguised = formulaFixture();
    Object.assign(disguised.blockedWorkloads[0]!, { samplesMs: [1, 2] });
    expect(() => validateFormulaBenchmark(disguised)).toThrow("must contain exactly");
  });

  it("rejects preliminary evidence when used as a passing gate", () => {
    const preliminary = formulaFixture();
    preliminary.runner.command.push("--preliminary");
    preliminary.gates = {
      passed: false,
      tolerance: FORMULA_GATE_TOLERANCE,
      regression: { status: "blocked", blocker: PRELIMINARY_BLOCKER },
    };
    expect(() => validateFormulaBenchmark(preliminary)).toThrow("successful regression gate");
  });
});

describe("formula regression gate", () => {
  it("gates every workload's median and p95 from raw samples", () => {
    const baseline = formulaFixture("full");

    const median = formulaFixture("full");
    median.workloads[0]!.samplesMs = [1.3, 1.3, 1.3, 1.3, 1.3];
    median.workloads[0]!.stat = summarize(median.workloads[0]!.samplesMs);
    expect(() => validateFormulaRegression(median, baseline)).toThrow(".median regression");

    const p95 = formulaFixture("full");
    p95.workloads[0]!.samplesMs = [1, 1, 1, 1, 1.4];
    p95.workloads[0]!.stat = summarize(p95.workloads[0]!.samplesMs);
    expect(() => validateFormulaRegression(p95, baseline)).toThrow(".p95 regression");
  });

  it("gates attributed per-workload allocation and aggregate WASM allocation", () => {
    const baseline = formulaFixture();

    const attributed = formulaFixture();
    for (const sample of attributed.workloads[0]!.allocationSamples) sample.retainedBytes++;
    attributed.workloads[0]!.allocationStat.retainedBytes = summarize(
      attributed.workloads[0]!.allocationSamples.map((sample) => sample.retainedBytes),
    );
    expect(() => validateFormulaRegression(attributed, baseline)).toThrow(
      ".allocation.retainedBytes.median regression",
    );

    const aggregate = formulaFixture();
    aggregate.memory[0]!.wasmDeltaBytes++;
    expect(() => validateFormulaRegression(aggregate, baseline)).toThrow(
      "wasmDeltaBytes regression",
    );
  });

  it("binds a candidate to the exact baseline source provenance", () => {
    const baseline = formulaFixture();
    const candidate = formulaFixture();
    (candidate.gates.regression as { baselineSourceDigest: string }).baselineSourceDigest =
      "b".repeat(64);
    expect(() => validateFormulaRegression(candidate, baseline)).toThrow(
      "not bound to the supplied baseline provenance",
    );
  });
});
