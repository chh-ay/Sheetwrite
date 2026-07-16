import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { CONTROLLED_SAMPLING_FINGERPRINT, compareControlledRender } from "../src/check.js";
import {
  buildControlledBaseline,
  type ControlledRenderBaseline,
  stableBaselineJson,
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

function baselineFixture(): ControlledRenderBaseline {
  return buildControlledBaseline(
    makeRenderArtifact({ rounds: 10 }),
    TEST_HARNESS,
    TEST_RUNNER,
    "raw-fixture.json",
  );
}

describe("controlled robust comparison", () => {
  test("uses every sample, so one lucky round cannot mask two slow rounds", () => {
    const baseline = baselineFixture();
    const fresh = makeRenderArtifact({
      rounds: 3,
      samples: (round) => Array.from({ length: 3 }, () => (round === 1 ? 1 : 20)),
    });
    const rows = compareControlledRender({
      baseline,
      fresh,
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(rows.every((row) => row.freshMedian === 20 && row.regression)).toBe(true);
  });

  test("a lone outlier does not fail a stable median", () => {
    const baseline = baselineFixture();
    const fresh = makeRenderArtifact({ samples: () => [10, 10, 100] });
    const rows = compareControlledRender({
      baseline,
      fresh,
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(rows.every((row) => row.freshMedian === 10 && !row.regression)).toBe(true);
  });

  test("requires both ratio and absolute-noise conditions", () => {
    const baseline = baselineFixture();
    const ratioOnlyBaseline: ControlledRenderBaseline = {
      ...baseline,
      cells: baseline.cells.map((cell) => ({ ...cell, absoluteFloorMs: 5 })),
    };
    const ratioOnly = compareControlledRender({
      baseline: ratioOnlyBaseline,
      fresh: makeRenderArtifact({ samples: () => [13, 13, 13] }),
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(ratioOnly.every((row) => row.ratio > 1.2 && !row.regression)).toBe(true);

    const absoluteOnly = compareControlledRender({
      baseline,
      fresh: makeRenderArtifact({ samples: () => [11, 11, 11] }),
      harness: TEST_HARNESS,
      runner: TEST_RUNNER,
    });
    expect(absoluteOnly.every((row) => row.absoluteDelta > 0.05 && !row.regression)).toBe(true);
  });

  test("reports generic structural changes with precise, deterministic paths", () => {
    const expected = {
      scalar: 1,
      nested: {
        changed: "before",
        removed: true,
      },
    };
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

    const reordered = fingerprintMismatches<Record<string, unknown>>(
      expected,
      { scalar: 2, added: "new", nested: { changed: "after" } },
      "fingerprint",
    );
    expect(reordered.map((entry) => entry.slice(0, entry.indexOf(":")))).toEqual([
      "fingerprint.added",
      "fingerprint.nested.changed",
      "fingerprint.nested.removed",
      "fingerprint.scalar",
    ]);
  });
});

describe("strict benchmark check CLI", () => {
  let directory = "";
  let baselinePath = "";
  let head = "";

  beforeAll(() => {
    directory = mkdtempSync(resolve(tmpdir(), "sheetwrite-check-"));
    const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
      cwd: resolve(import.meta.dir, "../.."),
      stdout: "pipe",
    });
    head = git.stdout.toString().trim();
    const rawBaseline = makeRenderArtifact({ rounds: 10, commit: head });
    const harness = computeHarnessFingerprint(
      MATRIX_IDS.render.full,
      CONTROLLED_SAMPLING_FINGERPRINT,
    );
    const baseline = buildControlledBaseline(rawBaseline, harness, TEST_RUNNER, "raw-fixture.json");
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
      { cwd: resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" },
    );
  }

  function freshArtifact(samples = 10): RenderBenchmarkArtifact {
    return makeRenderArtifact({
      commit: head,
      timestamp: new Date().toISOString(),
      samples: () => [samples, samples, samples],
    });
  }

  test("fails malformed JSON, missing cells, failed cells, stale records, and regressions", () => {
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

    expect(runCli(JSON.stringify(freshArtifact(13))).exitCode).not.toBe(0);
  });

  test("passes a complete matching result and keeps report-only explicitly non-gating", () => {
    const passing = runCli(JSON.stringify(freshArtifact()));
    expect(passing.exitCode).toBe(0);
    expect(passing.stderr.toString()).toContain("complete controlled performance result passed");

    const diagnostic = runCli("{broken", ["--report-only"]);
    expect(diagnostic.exitCode).toBe(0);
    expect(diagnostic.stderr.toString()).toContain("REPORT ONLY — NON-GATING");
  });
});
