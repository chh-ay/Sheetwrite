import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type MatchedFormulaEvidence,
  validateMatchedEvidence,
} from "../src/matched-formula-evidence.js";

function sha256(path: URL): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const rawPath = new URL("../results/formula-regression-raw.json", import.meta.url);
const harnessPath = new URL("../src/matched-formula-harness.ts", import.meta.url);
const artifactPath = new URL("../results/formula-regression-results.json", import.meta.url);
const expectedRawArtifactSha256 = sha256(rawPath);
const expectedHarnessSha256 = sha256(harnessPath);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as MatchedFormulaEvidence;

function copy(): MatchedFormulaEvidence {
  return structuredClone(artifact);
}

function validate(value: MatchedFormulaEvidence): void {
  validateMatchedEvidence(value, {
    rawArtifactSha256: expectedRawArtifactSha256,
    harnessSha256: expectedHarnessSha256,
  });
}

describe("matched formula evidence contract", () => {
  test("accepts the freshly generated canonical artifact", () => {
    expect(() => validate(copy())).not.toThrow();
  });

  for (const [label, mutate] of [
    [
      "raw artifact hash",
      (value: MatchedFormulaEvidence) => (value.rawArtifactSha256 = "0".repeat(64)),
    ],
    ["harness hash", (value: MatchedFormulaEvidence) => (value.harnessSha256 = "0".repeat(64))],
    ["CPU affinity", (value: MatchedFormulaEvidence) => (value.controls.cpuAffinity = [0])],
    ["pair count", (value: MatchedFormulaEvidence) => (value.controls.alternatingPairs = 19)],
    ["governor", (value: MatchedFormulaEvidence) => (value.controls.governor = "performance")],
    [
      "workload boundaries",
      (value: MatchedFormulaEvidence) => delete value.workloadBoundaries["wide-fan-out-edit/1000"],
    ],
    [
      "median samples",
      (value: MatchedFormulaEvidence) =>
        (value.workloads["independent-parse-load/1000"]!.raw.baselineMs[0]! += 1),
    ],
    ["bootstrap seed", (value: MatchedFormulaEvidence) => (value.bootstrap.seed += 1)],
  ] as const) {
    test(`rejects tampered ${label}`, () => {
      const value = copy();
      mutate(value);
      expect(() => validate(value)).toThrow();
    });
  }
});
