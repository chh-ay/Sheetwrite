import { describe, expect, it } from "bun:test";
import {
  expectedFormulaMemoryKeys,
  expectedFormulaWorkloadKeys,
  type FormulaBenchmarkResult,
  validateFormulaBenchmark,
} from "../src/formula-bench.js";
import {
  diamondFormulas,
  distinctRangeFormulas,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "../src/formula-dataset.js";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import { summarize } from "../src/stats.js";

function formulaFixture(mode: "full" | "smoke" = "smoke"): FormulaBenchmarkResult {
  const samples = [1, 2, 3];
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode,
    matrixId: MATRIX_IDS.formula[mode],
    meta: { bun: "test", platform: "test", arch: "test", timestamp: "2026-07-13T00:00:00Z" },
    workloads: expectedFormulaWorkloadKeys(mode).map((key) => {
      const match = /^workload=(.*);size=(\d+)$/u.exec(key);
      if (!match) throw new Error(`invalid fixture key ${key}`);
      return {
        id: match[1]!,
        size: Number(match[2]),
        samplesMs: [...samples],
        stat: summarize(samples),
      };
    }),
    memory: expectedFormulaMemoryKeys(mode).map((key) => ({
      formulas: Number(key.slice("memory=formulas=".length)),
      wasmDeltaBytes: 1024,
    })),
    gates: { passed: true, tolerance: "test" },
  };
}

describe("formula benchmark datasets", () => {
  it("builds deterministic independent, chain, and fan-out formulas", () => {
    expect(independentFormulas(3)).toEqual([
      { row: 0, col: 1, src: "=A1+1" },
      { row: 1, col: 1, src: "=A2+1" },
      { row: 2, col: 1, src: "=A3+1" },
    ]);
    expect(linearChain(4)).toEqual([
      { row: 1, col: 0, src: "=A1+1" },
      { row: 2, col: 0, src: "=A2+1" },
      { row: 3, col: 0, src: "=A3+1" },
    ]);
    expect(fanOutFormulas(2).map((formula) => formula.src)).toEqual(["=$A$1+1", "=$A$1+2"]);
  });

  it("builds stable diamond and range topologies", () => {
    expect(diamondFormulas(2)).toEqual([
      { row: 0, col: 1, src: "=$A$1+1" },
      { row: 0, col: 2, src: "=$A$1+2" },
      { row: 0, col: 3, src: "=B1+C1" },
      { row: 1, col: 1, src: "=$D$1+1" },
      { row: 1, col: 2, src: "=$D$1+2" },
      { row: 1, col: 3, src: "=B2+C2" },
    ]);
    expect(sharedRangeFormulas(1, 5)[0]!.src).toBe("=SUM($A$1:$A$5)");
    expect(distinctRangeFormulas(2).map((formula) => formula.src)).toEqual([
      "=SUM(A1:A10)",
      "=SUM(A11:A20)",
    ]);
  });
});

describe("formula benchmark result validation", () => {
  it("accepts exact finite full and smoke matrices", () => {
    expect(() => validateFormulaBenchmark(formulaFixture("smoke"), "smoke")).not.toThrow();
    expect(() => validateFormulaBenchmark(formulaFixture("full"), "full")).not.toThrow();
  });

  it("rejects missing, duplicate, unexpected, and non-finite workload cells by exact key", () => {
    const missing = formulaFixture();
    const missingKey = expectedFormulaWorkloadKeys("smoke")[0]!;
    missing.workloads.shift();
    expect(() => validateFormulaBenchmark(missing, "smoke")).toThrow(`missing ${missingKey}`);

    const duplicate = formulaFixture();
    const duplicateKey = expectedFormulaWorkloadKeys("smoke")[0]!;
    duplicate.workloads.push(structuredClone(duplicate.workloads[0]!));
    expect(() => validateFormulaBenchmark(duplicate, "smoke")).toThrow(`duplicate ${duplicateKey}`);

    const unexpected = formulaFixture();
    unexpected.workloads.push({
      id: "not-declared",
      size: 7,
      samplesMs: [1],
      stat: summarize([1]),
    });
    expect(() => validateFormulaBenchmark(unexpected, "smoke")).toThrow(
      "unexpected workload=not-declared;size=7",
    );

    const invalid = formulaFixture();
    invalid.workloads[0]!.samplesMs[0] = Number.NaN;
    expect(() => validateFormulaBenchmark(invalid, "smoke")).toThrow(/finite and non-negative/);

    const malformed = formulaFixture();
    Object.defineProperty(malformed.workloads[0]!, "size", { value: "1000" });
    expect(() => validateFormulaBenchmark(malformed, "smoke")).toThrow(
      "formula workload contains a malformed identity",
    );
  });

  it("fails completeness before evaluating a missing 100K threshold cell or memory sample", () => {
    const missingWorkload = formulaFixture("full");
    missingWorkload.workloads = missingWorkload.workloads.filter(
      (entry) => !(entry.id === "independent-parse-load" && entry.size === 100_000),
    );
    expect(() => validateFormulaBenchmark(missingWorkload, "full")).toThrow(
      "missing workload=independent-parse-load;size=100000",
    );

    const missingMemory = formulaFixture("full");
    missingMemory.memory = missingMemory.memory.filter((entry) => entry.formulas !== 100_000);
    expect(() => validateFormulaBenchmark(missingMemory, "full")).toThrow(
      "missing memory=formulas=100000",
    );
  });

  it("does not allow smoke protocol evidence to satisfy the full validator", () => {
    expect(() => validateFormulaBenchmark(formulaFixture("smoke"), "full")).toThrow(
      "formula mode mismatch",
    );
  });
});
