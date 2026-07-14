import { describe, expect, test } from "bun:test";
import { validateRenderGateArtifact } from "../src/render-gate.js";
import {
  type FailedScenario,
  parseRenderArtifact,
  summarizeCompleteness,
} from "../src/render-protocol.js";
import { makeRenderArtifact } from "./gate-fixtures.js";

describe("render deterministic gate", () => {
  test("accepts exact full and smoke matrices while keeping them distinct", () => {
    const full = makeRenderArtifact();
    const smoke = makeRenderArtifact({
      rounds: 1,
      engines: ["sheetwrite"],
      rows: [200],
      measuredSamples: 1,
    });
    expect(() => validateRenderGateArtifact(full, "full")).not.toThrow();
    expect(() => validateRenderGateArtifact(smoke, "smoke")).not.toThrow();
    expect(() => validateRenderGateArtifact(smoke, "full")).toThrow("render-full-v1 configuration");
  });

  test("requires both engines before allowing a comparative full result", () => {
    const sheetwriteOnly = makeRenderArtifact({ engines: ["sheetwrite"] });
    expect(() => validateRenderGateArtifact(sheetwriteOnly, "full")).toThrow(
      "render-full-v1 configuration",
    );
  });

  test("rejects corrupted controlled dataset, order, and launch metadata", () => {
    const source = makeRenderArtifact({
      rounds: 1,
      engines: ["sheetwrite"],
      rows: [200],
      measuredSamples: 1,
    });
    const wrongDataset = {
      ...source,
      metadata: {
        ...source.metadata,
        datasetHashes: { "200": "fnv1a32:corrupt" },
      },
    };
    expect(() => validateRenderGateArtifact(wrongDataset, "smoke")).toThrow(
      "metadata does not match the controlled dataset/run policy",
    );

    const wrongOrder = {
      ...source,
      metadata: { ...source.metadata, orderSeed: 1 },
    };
    expect(() => validateRenderGateArtifact(wrongOrder, "smoke")).toThrow(
      "metadata does not match the controlled dataset/run policy",
    );

    const unexpectedLaunch = {
      ...source,
      metadata: {
        ...source.metadata,
        launchAttempts: [
          ...source.metadata.launchAttempts,
          { ...source.metadata.launchAttempts[0]!, rows: 201 },
        ],
      },
    };
    expect(() => validateRenderGateArtifact(unexpectedLaunch, "smoke")).toThrow(
      "unexpected browser launch attempt",
    );
  });

  test("preserves typed crash evidence but fails the gate closed", () => {
    const artifact = makeRenderArtifact({
      rounds: 1,
      engines: ["sheetwrite"],
      rows: [200],
      measuredSamples: 1,
    });
    const source = artifact.results[0]!;
    const failure: FailedScenario = {
      runId: source.runId,
      round: source.round,
      engine: source.engine,
      rows: source.rows,
      scenarioId: source.scenarioId,
      group: source.group,
      status: "failed",
      stage: "launch",
      errorClass: "BrowserCrash",
      message: "browser crashed",
      timeout: false,
      crash: true,
      consoleErrors: [],
      pageErrors: [],
      partialSamples: [],
      validation: [],
      memory: { beforeBytes: null, afterBytes: null, deltaBytes: null },
    };
    const failed = {
      ...artifact,
      results: [failure, ...artifact.results.slice(1)],
    };
    failed.completeness = summarizeCompleteness(
      failed.config,
      failed.metadata.rounds,
      failed.results,
    );
    expect(parseRenderArtifact(failed).completeness.failedKeys).toHaveLength(1);
    expect(() => validateRenderGateArtifact(failed, "smoke")).toThrow("contains failed cells");
  });

  test("requires finite bounded renderer memory evidence for every successful cell", () => {
    const source = makeRenderArtifact({
      rounds: 1,
      engines: ["sheetwrite"],
      rows: [200],
      measuredSamples: 1,
    });
    const first = source.results[0]!;
    if (first.status !== "success") throw new Error("fixture must be successful");

    const missing = {
      ...source,
      results: [
        { ...first, memory: { beforeBytes: null, afterBytes: null, deltaBytes: null } },
        ...source.results.slice(1),
      ],
    };
    expect(() => validateRenderGateArtifact(missing, "smoke")).toThrow(".memory is missing");

    const malformed = {
      ...source,
      results: [
        { ...first, memory: { beforeBytes: -1, afterBytes: 0, deltaBytes: 1 } },
        ...source.results.slice(1),
      ],
    };
    expect(() => validateRenderGateArtifact(malformed, "smoke")).toThrow(
      "finite non-negative integer heap samples",
    );

    const overCeiling = {
      ...source,
      results: [
        {
          ...first,
          memory: {
            beforeBytes: 0,
            afterBytes: 4 * 1024 * 1024 * 1024,
            deltaBytes: 4 * 1024 * 1024 * 1024,
          },
        },
        ...source.results.slice(1),
      ],
    };
    expect(() => validateRenderGateArtifact(overCeiling, "smoke")).toThrow(
      "broad renderer heap safety ceiling",
    );
  });

  test("rejects stale and non-finite records", () => {
    const stale = makeRenderArtifact({
      rounds: 1,
      engines: ["sheetwrite"],
      rows: [200],
      measuredSamples: 1,
      timestamp: "2020-01-01T00:00:00.000Z",
    });
    expect(() =>
      validateRenderGateArtifact(stale, "smoke", {
        nowMs: Date.parse("2020-01-02T00:00:00.000Z"),
        maxAgeMs: 1,
      }),
    ).toThrow("stale render result timestamp");

    const current = makeRenderArtifact({
      rounds: 1,
      engines: ["sheetwrite"],
      rows: [200],
      measuredSamples: 1,
    });
    const first = current.results[0]!;
    if (first.status !== "success") throw new Error("fixture must be successful");
    const invalid = {
      ...current,
      results: [{ ...first, medianMs: Number.NaN }, ...current.results.slice(1)],
    };
    expect(() => validateRenderGateArtifact(invalid, "smoke")).toThrow("finite number");
  });
});
