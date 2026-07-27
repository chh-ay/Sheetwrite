import { describe, expect, test } from "bun:test";
import { createCombinationFailures } from "../src/render-driver.js";
import { DIAGNOSTIC_RENDER_SCENARIOS, RENDER_SCENARIOS } from "../src/render-protocol.js";

const configuration = {
  runId: "launch-fixture",
  round: 1,
  engine: "sheetwrite" as const,
  rows: 200,
  measuredSamples: 1,
  warmupSamples: 1,
  minimumSampleDurationMs: 100,
  timeoutMs: 1_000,
  datasetHash: "fnv1a32:fixture",
};

describe("isolated browser failure envelopes", () => {
  test("invalid launch fills every expected scenario without success statistics", () => {
    const results = createCombinationFailures(
      configuration,
      "launch",
      new Error("browser executable does not exist"),
    );
    expect(results).toHaveLength(RENDER_SCENARIOS.length);
    expect(results.every((result) => result.status === "failed")).toBe(true);
    expect(results.every((result) => result.stage === "launch")).toBe(true);
    expect(results.every((result) => !("medianMs" in result))).toBe(true);
    expect(new Set(results.map((result) => result.scenarioId)).size).toBe(RENDER_SCENARIOS.length);
  });

  test("failure output keeps the requested diagnostic scenario list", () => {
    const scenarios = DIAGNOSTIC_RENDER_SCENARIOS.map((scenario) => scenario.id);
    const results = createCombinationFailures(
      { ...configuration, scenarios },
      "launch",
      new Error("browser executable does not exist"),
    );
    expect(results.map((result) => result.scenarioId)).toEqual(scenarios);
  });

  test("timeouts retain timeout/crash diagnostics in every cell", () => {
    const results = createCombinationFailures(
      configuration,
      "measure",
      new Error("page timed out"),
      { consoleErrors: ["console failure"], pageErrors: ["page failure"] },
      true,
      true,
    );
    expect(
      results.every(
        (result) =>
          result.timeout &&
          result.crash &&
          result.consoleErrors[0] === "console failure" &&
          result.pageErrors[0] === "page failure",
      ),
    ).toBe(true);
  });
});
