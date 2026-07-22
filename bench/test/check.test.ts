import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { CONTROLLED_SAMPLING_FINGERPRINT, compareControlledRender } from "../src/check.js";
import {
  buildControlledBaseline,
  CONTROLLED_COMPARISON_POLICY,
  type ControlledRenderBaseline,
  parseControlledBaseline,
  stableBaselineJson,
  validateControlledBaselineProvenance,
} from "../src/controlled-baseline.js";
import {
  computeHarnessFingerprint,
  fingerprintMismatches,
  MATRIX_IDS,
} from "../src/gate-protocol.js";
import {
  type FailedScenario,
  type RenderBenchmarkArtifact,
  summarizeCompleteness,
} from "../src/render-protocol.js";
import { makeRenderArtifact, TEST_HARNESS, TEST_RUNNER } from "./gate-fixtures.js";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");

function baselineFixture(): ControlledRenderBaseline {
  return buildControlledBaseline(
    makeRenderArtifact({ rounds: 10 }),
    TEST_HARNESS,
    TEST_RUNNER,
    "bench/results/render-results.json",
    "0".repeat(64),
  );
}

describe("controlled zero-regression comparison", () => {
  test("uses every repeated sample, so one lucky round cannot mask a material slowdown", () => {
    const rows = compareControlledRender({
      baseline: baselineFixture(),
      fresh: makeRenderArtifact({
        rounds: 10,
        samples: (round) => Array.from({ length: 3 }, () => (round === 1 ? 1 : 20)),
      }),
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(rows.every((row) => row.freshMedian === 20 && row.regression)).toBe(true);
  });

  test("uses a zero slowdown threshold while reproducible equality and improvement pass", () => {
    const baseline = baselineFixture();
    const unchanged = compareControlledRender({
      baseline,
      fresh: makeRenderArtifact({ rounds: 10, samples: () => [10, 10, 10] }),
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(unchanged.every((row) => !row.regression && row.lowerConfidenceBoundMs === 0)).toBe(
      true,
    );

    const improved = compareControlledRender({
      baseline,
      fresh: makeRenderArtifact({ rounds: 10, samples: () => [9, 9, 9] }),
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(improved.every((row) => !row.regression && row.lowerConfidenceBoundMs === -1)).toBe(
      true,
    );

    const slowed = compareControlledRender({
      baseline,
      fresh: makeRenderArtifact({ rounds: 10, samples: () => [10.01, 10.01, 10.01] }),
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(slowed.every((row) => row.regression && row.lowerConfidenceBoundMs > 0)).toBe(true);
  });

  test("fails closed on missing or mismatched runner metadata and incomplete fresh sampling", () => {
    const baseline = baselineFixture();
    expect(() =>
      compareControlledRender({
        baseline,
        fresh: makeRenderArtifact({ rounds: 10 }),
        harness: TEST_HARNESS,
        runner: { ...TEST_RUNNER, cpu: "different cpu" },
      }),
    ).toThrow("uncontrolled/unmatched runner");
    const missingRunner = structuredClone(baseline) as unknown as {
      runner: { cpu?: string };
    };
    delete missingRunner.runner.cpu;
    expect(() => parseControlledBaseline(missingRunner)).toThrow("missing cpu");
    expect(() =>
      compareControlledRender({
        baseline,
        fresh: makeRenderArtifact({ rounds: 9 }),
        harness: TEST_HARNESS,
        runner: TEST_RUNNER,
      }),
    ).toThrow("fresh rounds must match baseline");
  });

  test("rejects missing raw samples and any attempt to raise the fixed threshold", () => {
    const missingSamples = structuredClone(baselineFixture()) as unknown as {
      cells: Array<{ samplesMs?: number[] }>;
    };
    delete missingSamples.cells[0]!.samplesMs;
    expect(() => parseControlledBaseline(missingSamples)).toThrow("samplesMs");

    const raised = structuredClone(baselineFixture()) as unknown as {
      comparison: { maximumRegressionMs: number };
    };
    raised.comparison.maximumRegressionMs = 1;
    expect(() => parseControlledBaseline(raised)).toThrow(
      `maximumRegressionMs must be ${CONTROLLED_COMPARISON_POLICY.maximumRegressionMs}`,
    );

    const injectedLegacyFloor = structuredClone(baselineFixture()) as unknown as {
      cells: Array<Record<string, unknown>>;
    };
    injectedLegacyFloor.cells[0]!.absoluteFloorMs = 100;
    expect(() => parseControlledBaseline(injectedLegacyFloor)).toThrow(
      "unexpected absoluteFloorMs",
    );
  });

  test("reports generic structural changes with precise, deterministic paths", () => {
    const expected = { scalar: 1, nested: { changed: "before", removed: true } };
    const cases: ReadonlyArray<{
      readonly observed: Record<string, unknown>;
      readonly mismatch: string;
    }> = [
      {
        observed: { ...expected, scalar: 2 },
        mismatch: "fingerprint.scalar: expected 1, observed 2",
      },
      {
        observed: { ...expected, added: "new" },
        mismatch: 'fingerprint.added: expected undefined, observed "new"',
      },
      {
        observed: { scalar: 1, nested: { changed: "before" } },
        mismatch: "fingerprint.nested.removed: expected true, observed undefined",
      },
      {
        observed: { ...expected, nested: { ...expected.nested, changed: "after" } },
        mismatch: 'fingerprint.nested.changed: expected "before", observed "after"',
      },
    ];
    for (const { observed, mismatch } of cases) {
      expect(fingerprintMismatches(expected, observed, "fingerprint")).toEqual([mismatch]);
    }
  });
});

describe("strict benchmark check CLI", () => {
  let directory = "";
  let baselinePath = "";
  let rawPath = "";
  let head = "";

  beforeAll(() => {
    const candidateRoot = resolve(REPOSITORY_ROOT, "bench/results/candidates");
    mkdirSync(candidateRoot, { recursive: true });
    directory = mkdtempSync(resolve(candidateRoot, "check-"));
    const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
      cwd: REPOSITORY_ROOT,
      stdout: "pipe",
    });
    head = git.stdout.toString().trim();
    const rawBaseline = makeRenderArtifact({ rounds: 10, commit: head });
    rawPath = resolve(directory, "raw.json");
    const rawBytes = `${JSON.stringify(rawBaseline, null, 2)}\n`;
    writeFileSync(rawPath, rawBytes);
    const harness = computeHarnessFingerprint(
      MATRIX_IDS.render.full,
      CONTROLLED_SAMPLING_FINGERPRINT,
    );
    const baseline = buildControlledBaseline(
      rawBaseline,
      harness,
      TEST_RUNNER,
      relative(REPOSITORY_ROOT, rawPath),
      createHash("sha256").update(rawBytes).digest("hex"),
    );
    baselinePath = resolve(directory, "baseline.json");
    writeFileSync(baselinePath, stableBaselineJson(baseline));
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  function runCli(freshContent: string, extraArgs: readonly string[] = []) {
    const freshPath = resolve(directory, `fresh-${crypto.randomUUID()}.json`);
    writeFileSync(freshPath, freshContent);
    return Bun.spawnSync(
      [
        "bun",
        "run",
        resolve(import.meta.dir, "../src/check.ts"),
        "--baseline",
        baselinePath,
        "--fresh",
        freshPath,
        "--power-mode",
        TEST_RUNNER.powerMode,
        "--concurrency",
        String(TEST_RUNNER.concurrency),
        ...extraArgs,
      ],
      { cwd: REPOSITORY_ROOT, stdout: "pipe", stderr: "pipe" },
    );
  }

  function freshArtifact(samples = 10): RenderBenchmarkArtifact {
    return makeRenderArtifact({
      rounds: 10,
      commit: head,
      timestamp: new Date().toISOString(),
      samples: () => [samples, samples, samples],
    });
  }

  test("fails malformed, incomplete, stale, and materially slower artifacts", () => {
    expect(runCli("{broken").exitCode).not.toBe(0);

    const missingBase = freshArtifact();
    const missingResults = missingBase.results.slice(1);
    const missing = {
      ...missingBase,
      results: missingResults,
      completeness: summarizeCompleteness(
        missingBase.config,
        missingBase.metadata.rounds,
        missingResults,
      ),
    };
    expect(runCli(JSON.stringify(missing)).exitCode).not.toBe(0);

    const failedBase = freshArtifact();
    const source = failedBase.results[0]!;
    const failedCell: FailedScenario = {
      runId: source.runId,
      round: source.round,
      engine: source.engine,
      rows: source.rows,
      scenarioId: source.scenarioId,
      group: source.group,
      status: "failed",
      stage: "measure",
      errorClass: "Error",
      message: "crashed",
      timeout: false,
      crash: true,
      consoleErrors: [],
      pageErrors: [],
      partialSamples: [],
      validation: [],
      memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
    };
    const failedResults = [failedCell, ...failedBase.results.slice(1)];
    const failed = {
      ...failedBase,
      results: failedResults,
      completeness: summarizeCompleteness(
        failedBase.config,
        failedBase.metadata.rounds,
        failedResults,
      ),
    };
    expect(runCli(JSON.stringify(failed)).exitCode).not.toBe(0);

    const staleBase = freshArtifact();
    const stale = {
      ...staleBase,
      metadata: { ...staleBase.metadata, timestamp: "2020-01-01T00:00:00.000Z" },
    };
    expect(runCli(JSON.stringify(stale)).exitCode).not.toBe(0);
    expect(runCli(JSON.stringify(freshArtifact(10.01))).exitCode).not.toBe(0);
  });

  test("fails when checked-in raw provenance is missing or checksum-mismatched", () => {
    const original = readFileSync(rawPath, "utf8");
    rmSync(rawPath);
    expect(runCli(JSON.stringify(freshArtifact())).exitCode).not.toBe(0);
    writeFileSync(rawPath, `${original} `);
    const mismatch = runCli(JSON.stringify(freshArtifact()));

    expect(mismatch.exitCode).not.toBe(0);
    expect(mismatch.stderr.toString()).toContain("checksum mismatch");
    writeFileSync(rawPath, original);
  });
  test("rejects checksum-valid raw evidence whose samples do not derive the baseline", () => {
    const mismatchedRawPath = resolve(directory, "mismatched-raw.json");
    const mismatchedRaw = `${JSON.stringify(
      makeRenderArtifact({ rounds: 10, commit: head, samples: () => [11, 11, 11] }),
      null,
      2,
    )}\n`;
    writeFileSync(mismatchedRawPath, mismatchedRaw);
    const baseline = parseControlledBaseline(
      JSON.parse(readFileSync(baselinePath, "utf8")) as unknown,
    );
    const mismatchedProvenance = {
      ...baseline,
      source: {
        ...baseline.source,
        rawArtifact: relative(REPOSITORY_ROOT, mismatchedRawPath),
        rawSha256: createHash("sha256").update(mismatchedRaw).digest("hex"),
      },
    };
    expect(() =>
      validateControlledBaselineProvenance(mismatchedProvenance, REPOSITORY_ROOT),
    ).toThrow("samples do not match checked-in raw artifact");
  });

  test("passes a complete matched result and keeps report-only explicitly non-gating", () => {
    const passing = runCli(JSON.stringify(freshArtifact()));
    expect(passing.exitCode, passing.stderr.toString()).toBe(0);
    expect(passing.stderr.toString()).toContain("no statistically detected regression");

    const diagnostic = runCli("{broken", ["--report-only"]);
    expect(diagnostic.exitCode).toBe(0);
    expect(diagnostic.stderr.toString()).toContain("REPORT ONLY — NON-GATING");
  });
});
