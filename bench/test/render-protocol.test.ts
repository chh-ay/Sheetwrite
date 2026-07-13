import { describe, expect, test } from "bun:test";
import {
  type FailedScenario,
  parseRenderArtifact,
  parseRenderArtifactJson,
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  type RenderBenchmarkArtifact,
  type RenderRunConfig,
  renderBenchmarkMarkdown,
  type ScenarioResult,
  scenarioGroup,
  summarizeCompleteness,
} from "../src/render-protocol.js";

const RUN_ID = "00000000-0000-4000-8000-000000000051";
const TIMESTAMP = "2026-07-14T12:00:00.000Z";

function successResult(
  round: number,
  engine: "sheetwrite" | "handsontable",
  scenarioId: (typeof RENDER_SCENARIOS)[number]["id"],
): ScenarioResult {
  return {
    runId: RUN_ID,
    round,
    engine,
    rows: 200,
    scenarioId,
    group: scenarioGroup(scenarioId),
    status: "success",
    operationCount: 20,
    rawSamples: [
      { index: 0, durationMs: 100, operationCount: 10, perOperationMs: 10 },
      { index: 1, durationMs: 100, operationCount: 10, perOperationMs: 10 },
    ],
    medianMs: 10,
    p95Ms: 10,
    madMs: 0,
    validation: [
      { checkpoint: "canonical row count", expected: "200", observed: "200", passed: true },
    ],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
  };
}

function failedResult(source: ScenarioResult): FailedScenario {
  return {
    runId: source.runId,
    round: source.round,
    engine: source.engine,
    rows: source.rows,
    scenarioId: source.scenarioId,
    group: source.group,
    status: "failed",
    stage: "validate",
    errorClass: "ScenarioValidationError",
    message: "wrong row count",
    timeout: false,
    crash: false,
    consoleErrors: [],
    pageErrors: [],
    partialSamples: source.status === "success" ? source.rawSamples : source.partialSamples,
    validation: [
      { checkpoint: "canonical row count", expected: "200", observed: "199", passed: false },
    ],
    memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
  };
}

function artifactWithResults(results: readonly ScenarioResult[]): RenderBenchmarkArtifact {
  const config: RenderRunConfig = {
    engines: ["sheetwrite", "handsontable"],
    rows: [200],
    scenarios: RENDER_SCENARIOS.map((scenario) => scenario.id),
  };
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    runId: RUN_ID,
    metadata: {
      commit: "4ba3902",
      dirty: false,
      timestamp: TIMESTAMP,
      bunVersion: "1.3.14",
      nodeVersion: "24.3.0",
      browserVersion: "Chromium 140",
      os: "linux 6.0",
      arch: "x64",
      cpu: "test cpu",
      engineVersions: { sheetwrite: "0.1.0", handsontable: "18.0.0" },
      datasetSeed: 0x5eedc0de,
      datasetHashes: { "200": "fnv1a32:12345678" },
      viewport: { width: 640, height: 480 },
      measuredSamples: 2,
      warmupSamples: 1,
      minimumSampleDurationMs: 100,
      rounds: 2,
      orderSeed: 0x51c0ffee,
      engineOrder: [
        ["sheetwrite", "handsontable"],
        ["handsontable", "sheetwrite"],
      ],
      launchAttempts: [
        {
          round: 1,
          engine: "sheetwrite",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
        {
          round: 1,
          engine: "handsontable",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
        {
          round: 2,
          engine: "sheetwrite",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
        {
          round: 2,
          engine: "handsontable",
          rows: 200,
          attempt: 1,
          success: true,
          errorClass: null,
          message: null,
        },
      ],
    },
    config,
    results,
    completeness: summarizeCompleteness(config, 2, results),
    reproductionCommands: ["bun run --filter '@sheetwrite/bench' bench:render"],
  };
}

function completeArtifact(): RenderBenchmarkArtifact {
  const results: ScenarioResult[] = [];
  for (let round = 1; round <= 2; round++) {
    for (const engine of ["sheetwrite", "handsontable"] as const) {
      for (const scenario of RENDER_SCENARIOS) {
        results.push(successResult(round, engine, scenario.id));
      }
    }
  }
  return artifactWithResults(results);
}

describe("render artifact validation", () => {
  test("accepts a complete finite matrix", () => {
    const parsed = parseRenderArtifactJson(JSON.stringify(completeArtifact()), {
      expectedRunId: RUN_ID,
    });
    expect(parsed.completeness.complete).toBe(true);
    expect(parsed.completeness.successful).toBe(true);
    expect(parsed.results).toHaveLength(44);
  });

  test("records bounded launch retries instead of hiding infrastructure failures", () => {
    const complete = completeArtifact();
    const first = complete.metadata.launchAttempts[0]!;
    const withRetry: RenderBenchmarkArtifact = {
      ...complete,
      metadata: {
        ...complete.metadata,
        launchAttempts: [
          {
            ...first,
            success: false,
            errorClass: "Error",
            message: "transient browser launch failure",
          },
          { ...first, attempt: 2 },
          ...complete.metadata.launchAttempts.slice(1),
        ],
      },
    };
    const parsed = parseRenderArtifact(withRetry);
    expect(parsed.metadata.launchAttempts).toHaveLength(5);
    expect(parsed.metadata.launchAttempts[0]).toMatchObject({
      success: false,
      message: "transient browser launch failure",
    });
    expect(parsed.completeness.successful).toBe(true);
  });

  test("rejects missing and duplicate matrix cells", () => {
    const complete = completeArtifact();
    expect(() => parseRenderArtifact(artifactWithResults(complete.results.slice(1)))).toThrow(
      "matrix is incomplete",
    );
    expect(() =>
      parseRenderArtifact(artifactWithResults([...complete.results, complete.results[0]!])),
    ).toThrow("matrix is incomplete");
  });

  test("preserves structured failures without omitting their cell", () => {
    const complete = completeArtifact();
    const failed = failedResult(complete.results[0]!);
    const parsed = parseRenderArtifact(artifactWithResults([failed, ...complete.results.slice(1)]));
    expect(parsed.completeness.complete).toBe(true);
    expect(parsed.completeness.successful).toBe(false);
    expect(parsed.completeness.failedKeys).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({ status: "failed", stage: "validate" });
  });

  test("rejects stale run IDs and timestamps", () => {
    const complete = completeArtifact();
    expect(() => parseRenderArtifact(complete, { expectedRunId: "new-run" })).toThrow(
      "stale render result",
    );
    expect(() =>
      parseRenderArtifact(complete, {
        nowMs: Date.parse(TIMESTAMP) + 2_000,
        maxAgeMs: 1_000,
      }),
    ).toThrow("stale render result timestamp");
  });

  test("rejects non-finite summaries and JSON null coercion", () => {
    const complete = completeArtifact();
    const source = complete.results[0]!;
    if (source.status !== "success") throw new Error("fixture must be successful");
    const invalidResult: ScenarioResult = { ...source, medianMs: Number.POSITIVE_INFINITY };
    const invalid = artifactWithResults([invalidResult, ...complete.results.slice(1)]);
    expect(() => parseRenderArtifact(invalid)).toThrow("finite number");
    expect(() => parseRenderArtifactJson(JSON.stringify(invalid))).toThrow("finite number");
  });
});

describe("derived Markdown evidence", () => {
  test("is byte-stable and visibly marks failures", () => {
    const complete = completeArtifact();
    const failed = failedResult(complete.results[0]!);
    const artifact = artifactWithResults([failed, ...complete.results.slice(1)]);
    const fromFixedJson = parseRenderArtifactJson(JSON.stringify(artifact));
    const first = renderBenchmarkMarkdown(fromFixedJson);
    const second = renderBenchmarkMarkdown(fromFixedJson);
    expect(second).toBe(first);
    expect(first).toContain("complete with structured failures");
    expect(first).toContain("**FAILED (validate)**");
    expect(first).toContain("(./render-results.json)");
    expect(first).toContain("Comparative headline ratios are intentionally omitted");
  });
});
