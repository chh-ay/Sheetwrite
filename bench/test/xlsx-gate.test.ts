import { describe, expect, it } from "bun:test";
import { summarizeFinite } from "../src/stats.js";
import {
  validateXlsxBenchmarkArtifact,
  type XlsxBenchmarkArtifact,
  type XlsxRawSample,
  type XlsxScenarioSummary,
} from "../src/xlsx-bench.js";

const SCENARIOS = [
  ["import", "combined"],
  ["export", "scalar"],
  ["export", "rich"],
  ["export", "shared-style"],
  ["export", "sparse"],
  ["reject", "compression-ratio"],
  ["reject", "deep-xml"],
] as const;

function sample(
  round: number,
  operation: XlsxRawSample["operation"],
  scenario: string,
): XlsxRawSample {
  return {
    round,
    engine: "current",
    operation,
    scenario,
    durationMs: 1,
    processWallMs: 2,
    maxRssBytes: 100,
    rssBeforeBytes: 50,
    rssAfterBytes: 90,
    heapBeforeBytes: 10,
    heapAfterBytes: 20,
    arrayBuffersBeforeBytes: 5,
    arrayBuffersAfterBytes: 8,
    inputBytes: 10,
    outputBytes: 20,
    checksum: "a".repeat(64),
    ...(operation === "reject"
      ? {
          rejection: `XlsxResourceError:Sheetwrite: XLSX import ${scenario === "compression-ratio" ? "maxCompressionRatio" : "maxXmlDepth"} limit exceeded`,
        }
      : {}),
  };
}

function summary(values: readonly XlsxRawSample[]): XlsxScenarioSummary {
  const value = values[0]!;
  const allocations = values.map(
    (entry) =>
      Math.max(0, entry.heapAfterBytes - entry.heapBeforeBytes) +
      Math.max(0, entry.arrayBuffersAfterBytes - entry.arrayBuffersBeforeBytes),
  );
  const rss = values.map((entry) => entry.maxRssBytes);
  return {
    engine: value.engine,
    operation: value.operation,
    scenario: value.scenario,
    durationMs: summarizeFinite(values.map((entry) => entry.durationMs)),
    processWallMs: summarizeFinite(values.map((entry) => entry.processWallMs)),
    maxRssBytes: { ...summarizeFinite(rss), max: Math.max(...rss) },
    retainedAllocationDeltaBytes: {
      ...summarizeFinite(allocations),
      max: Math.max(...allocations),
    },
  };
}

function summaries(samples: readonly XlsxRawSample[]): XlsxScenarioSummary[] {
  const grouped = new Map<string, XlsxRawSample[]>();
  for (const value of samples) {
    const key = `${value.engine}:${value.operation}:${value.scenario}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(value);
    else grouped.set(key, [value]);
  }
  return [...grouped.values()]
    .map(summary)
    .sort((left, right) =>
      `${left.engine}:${left.operation}:${left.scenario}`.localeCompare(
        `${right.engine}:${right.operation}:${right.scenario}`,
      ),
    );
}

function artifact(): XlsxBenchmarkArtifact {
  const samples = SCENARIOS.map(([operation, scenario]) => sample(0, operation, scenario));
  return {
    protocol: "sheetwrite-xlsx-codec-v1",
    mode: "smoke",
    metadata: { commit: "test", dirty: true, timestamp: "2026-07-18T00:00:00.000Z" },
    rounds: 1,
    maxBaselineRatio: 1.25,
    fixture: {
      path: "bench/fixtures/xlsx-codec-corpus.xlsx",
      bytes: 1_038_346,
      sha256: "2633e51a4a3caa8d34b2e2147b997c6ebdd0cf514be6e6c60663a0f7659e6e00",
      generatorPath: "bench/fixtures/generate-xlsx-corpus.py",
      generatorSha256: "a00a25851cbb8479a13472ef07ad3a133f8901505ea89da8f967041d4b9f4fb2",
      producer: "LibreOffice 26.2.4.2 Calc MS Excel 2007 XML",
    },
    toolchain: {
      bun: "1.3.14",
      node: "v24.3.0",
      platform: "linux",
      arch: "x64",
      cpu: "test",
    },
    methodology: { timing: "isolated", memory: "VmHWM", allocation: "retained" },
    scenarios: SCENARIOS.map(([operation, scenario]) => `${operation}:${scenario}`),
    samples,
    summaries: summaries(samples),
    comparisons: [],
  };
}

function comparedArtifact(): XlsxBenchmarkArtifact {
  const currentOnly = artifact();
  const current = currentOnly.samples.map((value) =>
    value.operation === "import" ? { ...value, durationMs: 2 } : value,
  );
  const baseline = current
    .filter((value) => value.operation !== "reject")
    .map((value) => ({ ...value, engine: "baseline" as const, durationMs: 1 }));
  const samples = [...current, ...baseline];
  return {
    ...currentOnly,
    mode: "full",
    toolchain: {
      ...currentOnly.toolchain,
      baselineCommit: "87fadb72397947ea8c6ba576682925c7879579b8",
    },
    samples,
    summaries: summaries(samples),
    comparisons: SCENARIOS.filter(([operation]) => operation !== "reject").map(
      ([operation, scenario]) => ({
        operation: operation as "import" | "export",
        scenario,
        medianWallRatio: operation === "import" ? 2 : 1,
        peakRssRatio: 1,
      }),
    ),
  };
}

describe("XLSX benchmark gate", () => {
  it("accepts an exact deterministic current-codec matrix", () => {
    expect(validateXlsxBenchmarkArtifact(artifact()).samples).toHaveLength(7);
  });

  it("fails closed when a required scenario is absent", () => {
    const value = artifact();
    expect(() =>
      validateXlsxBenchmarkArtifact({ ...value, samples: value.samples.slice(1) }),
    ).toThrow("matrix mismatch");
  });

  it("rejects stale fixture provenance", () => {
    const value = artifact();
    expect(() =>
      validateXlsxBenchmarkArtifact({
        ...value,
        fixture: { ...value.fixture, sha256: "0".repeat(64) },
      }),
    ).toThrow("fixture or generator checksum is stale");
  });

  it("recomputes summaries from raw samples", () => {
    const value = artifact();
    expect(() =>
      validateXlsxBenchmarkArtifact({
        ...value,
        summaries: value.summaries.map((entry, index) =>
          index === 0 ? { ...entry, durationMs: { ...entry.durationMs, median: 0.5 } } : entry,
        ),
      }),
    ).toThrow("summaries do not match raw samples");
  });

  it("rejects wall-time regressions above the old-backend ratio", () => {
    expect(() => validateXlsxBenchmarkArtifact(comparedArtifact())).toThrow(
      "import:combined regressed",
    );
  });

  it("rejects output checksum drift across isolated rounds", () => {
    const value = artifact();
    const secondRound = value.samples.map((entry) => ({
      ...entry,
      round: 1,
      checksum: entry.scenario === "scalar" ? "b".repeat(64) : entry.checksum,
    }));
    const samples = [...value.samples, ...secondRound];
    expect(() =>
      validateXlsxBenchmarkArtifact({
        ...value,
        rounds: 2,
        samples,
        summaries: summaries(samples),
      }),
    ).toThrow("export:scalar is not deterministic");
  });
});
