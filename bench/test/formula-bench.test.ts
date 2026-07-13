import { describe, expect, it } from "bun:test";
import { type FormulaBenchmarkResult, validateFormulaBenchmark } from "../src/formula-bench.js";
import {
  diamondFormulas,
  distinctRangeFormulas,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "../src/formula-dataset.js";
import { summarize } from "../src/stats.js";

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
  const valid = (): FormulaBenchmarkResult => ({
    meta: { bun: "test", platform: "test", arch: "test", timestamp: "2026-07-13T00:00:00Z" },
    workloads: [
      {
        id: "fixture",
        size: 1,
        samplesMs: [1, 2, 3],
        stat: summarize([1, 2, 3]),
      },
    ],
    memory: [{ formulas: 1_000, wasmDeltaBytes: 1024 }],
    gates: { passed: true, tolerance: "test" },
  });

  it("accepts finite raw samples consistent with their summary", () => {
    expect(() => validateFormulaBenchmark(valid())).not.toThrow();
  });

  it("rejects missing and non-finite raw samples", () => {
    const result = valid();
    result.workloads[0]!.samplesMs[1] = Number.NaN;
    expect(() => validateFormulaBenchmark(result)).toThrow(/invalid timing/);
  });
});
