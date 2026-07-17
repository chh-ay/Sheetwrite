import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  expectedFormulaMemoryKeys,
  expectedFormulaWorkloadKeys,
  type FormulaBenchmarkResult,
} from "../src/formula-bench.js";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import { summarize } from "../src/stats.js";

function incompleteFormulaFixture(): FormulaBenchmarkResult {
  const workloads = expectedFormulaWorkloadKeys("smoke")
    .map((key) => {
      const match = /^workload=(.*);size=(\d+)$/u.exec(key)!;
      return {
        id: match[1]!,
        size: Number(match[2]),
        samplesMs: [1, 2],
        stat: summarize([1, 2]),
      };
    })
    .filter((entry) => !(entry.id === "independent-parse-load" && entry.size === 1_000));
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.formula.smoke,
    meta: {
      bun: "test",
      platform: "linux",
      arch: "x64",
      commit: "0".repeat(40),
      dirty: false,
      timestamp: new Date().toISOString(),
    },
    workloads,
    memory: expectedFormulaMemoryKeys("smoke").map((key) => ({
      formulas: Number(key.slice("memory=formulas=".length)),
      wasmDeltaBytes: 1024,
    })),
    gates: { passed: true, tolerance: "test" },
  };
}

describe("CI-facing deterministic verifier", () => {
  let directory = "";
  let fixturePath = "";
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const artifactRoot = resolve(repositoryRoot, "test-results/performance-gates");

  beforeAll(() => {
    directory = mkdtempSync(resolve(tmpdir(), "sheetwrite-verify-"));
    fixturePath = resolve(directory, "incomplete-formula.json");
    writeFileSync(fixturePath, `${JSON.stringify(incompleteFormulaFixture(), null, 2)}\n`);
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  test("fails a missing result and preserves raw plus structured error artifacts", () => {
    const result = Bun.spawnSync(
      [
        "bun",
        "run",
        resolve(repositoryRoot, "bench/src/verify.ts"),
        "--fixture",
        `formula:${fixturePath}`,
      ],
      { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
    );
    expect(result.exitCode).not.toBe(0);
    expect(existsSync(resolve(artifactRoot, "formula.json"))).toBe(true);
    const error = readFileSync(resolve(artifactRoot, "formula-error.json"), "utf8");
    expect(error).toContain("missing workload=independent-parse-load;size=1000");
  });

  test("rejects report-only instead of weakening a CI gate", () => {
    const result = Bun.spawnSync(
      ["bun", "run", resolve(repositoryRoot, "bench/src/verify.ts"), "--report-only"],
      { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
    );
    expect(result.exitCode).not.toBe(0);
    expect(readFileSync(resolve(artifactRoot, "data-error.json"), "utf8")).toContain(
      "rejects --report-only",
    );
  });
});
