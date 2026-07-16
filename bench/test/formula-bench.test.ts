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
  type FormulaCell,
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
    meta: { bun: "test", platform: "test", arch: "test", commit: "0".repeat(40),
    dirty: false,
    timestamp: "2026-07-13T00:00:00Z" },
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
        const branchDependencies = level
          .filter((cell) => cell.col !== 3)
          .flatMap((cell) => referencedCells(cell.src));
        expect(
          new Set(
            branchDependencies.map(({ row: dependencyRow, col }) => `${dependencyRow}:${col}`),
          ).size,
        ).toBe(1);
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

      for (const formulas of [independent, chain, fanOut, diamonds, shared, distinct]) {
        assertAcyclic(formulas);
      }
    }
  });
});

describe("formula benchmark result validation", () => {
  it("accepts finite matrices and keeps full evidence materially broader than smoke", () => {
    const smoke = formulaFixture("smoke");
    const full = formulaFixture("full");
    expect(() => validateFormulaBenchmark(smoke, "smoke")).not.toThrow();
    expect(() => validateFormulaBenchmark(full, "full")).not.toThrow();
    expect(Math.max(...full.workloads.map((entry) => entry.size))).toBeGreaterThan(
      Math.max(...smoke.workloads.map((entry) => entry.size)),
    );
    expect(Math.max(...full.memory.map((entry) => entry.formulas))).toBeGreaterThan(
      Math.max(...smoke.memory.map((entry) => entry.formulas)),
    );
    expect(new Set(full.workloads.map((entry) => entry.id))).toEqual(
      new Set(smoke.workloads.map((entry) => entry.id)),
    );
  });

  it("rejects missing, duplicate, unexpected, and malformed named workload cells", () => {
    const named = { id: "independent-parse-load", size: 1_000 } as const;
    const key = `workload=${named.id};size=${named.size}`;
    const matchesNamed = (entry: FormulaBenchmarkResult["workloads"][number]) =>
      entry.id === named.id && entry.size === named.size;

    const missing = formulaFixture();
    missing.workloads = missing.workloads.filter((entry) => !matchesNamed(entry));
    expect(() => validateFormulaBenchmark(missing, "smoke")).toThrow(`missing ${key}`);

    const duplicate = formulaFixture();
    duplicate.workloads.push(structuredClone(duplicate.workloads.find(matchesNamed)!));
    expect(() => validateFormulaBenchmark(duplicate, "smoke")).toThrow(`duplicate ${key}`);

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
    invalid.workloads.find(matchesNamed)!.samplesMs[0] = Number.NaN;
    expect(() => validateFormulaBenchmark(invalid, "smoke")).toThrow(/finite and non-negative/);

    const malformed = formulaFixture();
    Object.defineProperty(malformed.workloads.find(matchesNamed)!, "size", { value: "1000" });
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
