import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";
import type { ControlledRunnerFingerprint, HarnessFingerprint } from "./gate-protocol.js";
import { fingerprintMismatches, MATRIX_IDS, validateExactMatrix } from "./gate-protocol.js";
import { validateRenderGateArtifact } from "./render-gate.js";
import {
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  type RenderBenchmarkArtifact,
  type SuccessfulScenario,
} from "./render-protocol.js";
import { summarizeFinite } from "./stats.js";

export const CONTROLLED_BASELINE_SCHEMA_VERSION = 2 as const;
export const CONTROLLED_BASELINE_MINIMUM_ROUNDS = 10;
export const CONTROLLED_COMPARISON_POLICY = {
  method: "independent-bootstrap-median-delta",
  familywiseConfidenceLevel: 0.99,
  resamples: 20_000,
  maximumRegressionMs: 0,
} as const;

export interface ControlledBaselineCell {
  readonly key: string;
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly observedMadMs: number;
}

export interface ControlledRenderBaseline {
  readonly schemaVersion: typeof CONTROLLED_BASELINE_SCHEMA_VERSION;
  readonly renderProtocolVersion: typeof RENDER_PROTOCOL_VERSION;
  readonly matrixId: typeof MATRIX_IDS.render.full;
  readonly comparison: typeof CONTROLLED_COMPARISON_POLICY;
  readonly source: {
    readonly commit: string;
    readonly rawArtifact: string;
    readonly rawSha256: string;
    readonly rounds: number;
  };
  readonly harness: HarnessFingerprint;
  readonly runner: ControlledRunnerFingerprint;
  readonly cells: readonly ControlledBaselineCell[];
}

export function controlledCellKey(
  value: Pick<SuccessfulScenario, "engine" | "rows" | "scenarioId">,
): string {
  return `engine=${value.engine};rows=${value.rows};scenario=${value.scenarioId}`;
}

export function expectedControlledCellKeys(): string[] {
  const keys: string[] = [];
  for (const engine of ["sheetwrite", "handsontable"] as const) {
    for (const scenario of RENDER_SCENARIOS) {
      keys.push(controlledCellKey({ engine, rows: 100_000, scenarioId: scenario.id }));
    }
  }
  return keys;
}

export function samplesByControlledCell(
  artifact: RenderBenchmarkArtifact,
): ReadonlyMap<string, readonly number[]> {
  const samples = new Map<string, number[]>();
  for (const result of artifact.results) {
    if (result.status !== "success") {
      throw new Error(`controlled comparison contains failed cell ${controlledCellKey(result)}`);
    }
    const key = controlledCellKey(result);
    const values = samples.get(key) ?? [];
    values.push(...result.rawSamples.map((sample) => sample.perOperationMs));
    samples.set(key, values);
  }
  validateExactMatrix("controlled render", expectedControlledCellKeys(), [...samples.keys()]);
  const expectedSamples = artifact.metadata.rounds * artifact.metadata.measuredSamples;
  for (const [key, values] of samples) {
    if (values.length !== expectedSamples) {
      throw new Error(`${key} must contain ${expectedSamples} post-warmup raw samples`);
    }
    summarizeFinite(values);
  }
  return samples;
}

export function buildControlledBaseline(
  value: unknown,
  harness: HarnessFingerprint,
  runner: ControlledRunnerFingerprint,
  rawArtifact: string,
  rawSha256: string,
): ControlledRenderBaseline {
  const parsed = value as Partial<RenderBenchmarkArtifact>;
  const rounds = parsed.metadata?.rounds;
  if (!Number.isInteger(rounds) || (rounds ?? 0) < CONTROLLED_BASELINE_MINIMUM_ROUNDS) {
    throw new Error(
      `controlled baseline requires at least ${CONTROLLED_BASELINE_MINIMUM_ROUNDS} complete rounds`,
    );
  }
  const artifact = validateRenderGateArtifact(value, "full", { rounds });
  const samples = samplesByControlledCell(artifact);
  const cells = [...samples]
    .map(([key, values]): ControlledBaselineCell => {
      const summary = summarizeFinite(values);
      return {
        key,
        samplesMs: values,
        medianMs: summary.median,
        p95Ms: summary.p95,
        observedMadMs: summary.mad,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    schemaVersion: CONTROLLED_BASELINE_SCHEMA_VERSION,
    renderProtocolVersion: RENDER_PROTOCOL_VERSION,
    matrixId: MATRIX_IDS.render.full,
    comparison: CONTROLLED_COMPARISON_POLICY,
    source: {
      commit: artifact.metadata.commit,
      rawArtifact,
      rawSha256,
      rounds: artifact.metadata.rounds,
    },
    harness,
    runner,
    cells,
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const expectedSet = new Set(expected);
  const unexpected = Object.keys(value)
    .filter((key) => !expectedSet.has(key))
    .sort();
  const missing = expected.filter((key) => !(key in value));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError(
      `${path} fields are not exact: ${[
        ...missing.map((key) => `missing ${key}`),
        ...unexpected.map((key) => `unexpected ${key}`),
      ].join("; ")}`,
    );
  }
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function finite(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${path} must be a finite number >= ${minimum}`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = finite(value, path, 1);
  if (!Number.isInteger(parsed)) throw new TypeError(`${path} must be an integer`);
  return parsed;
}

function parseHarness(value: unknown): HarnessFingerprint {
  const input = record(value, "baseline.harness");
  exactKeys(
    input,
    ["digest", "protocol", "matrix", "dataset", "sampling", "schema", "sources"],
    "baseline.harness",
  );
  const sourceInput = record(input.sources, "baseline.harness.sources");
  const sources = Object.fromEntries(
    Object.entries(sourceInput).map(([path, digest]) => [
      path,
      text(digest, `baseline.harness.sources.${path}`),
    ]),
  );
  if (Object.keys(sources).length === 0) {
    throw new TypeError("baseline.harness.sources must not be empty");
  }
  return {
    digest: text(input.digest, "baseline.harness.digest"),
    protocol: text(input.protocol, "baseline.harness.protocol"),
    matrix: text(input.matrix, "baseline.harness.matrix"),
    dataset: text(input.dataset, "baseline.harness.dataset"),
    sampling: text(input.sampling, "baseline.harness.sampling"),
    schema: text(input.schema, "baseline.harness.schema"),
    sources,
  };
}

function parseRunner(value: unknown): ControlledRunnerFingerprint {
  const input = record(value, "baseline.runner");
  exactKeys(
    input,
    ["os", "arch", "cpu", "bun", "node", "browser", "powerMode", "concurrency"],
    "baseline.runner",
  );
  return {
    os: text(input.os, "baseline.runner.os"),
    arch: text(input.arch, "baseline.runner.arch"),
    cpu: text(input.cpu, "baseline.runner.cpu"),
    bun: text(input.bun, "baseline.runner.bun"),
    node: text(input.node, "baseline.runner.node"),
    browser: text(input.browser, "baseline.runner.browser"),
    powerMode: text(input.powerMode, "baseline.runner.powerMode"),
    concurrency: positiveInteger(input.concurrency, "baseline.runner.concurrency"),
  };
}

function parseComparison(value: unknown): typeof CONTROLLED_COMPARISON_POLICY {
  const input = record(value, "baseline.comparison");
  exactKeys(
    input,
    ["method", "familywiseConfidenceLevel", "resamples", "maximumRegressionMs"],
    "baseline.comparison",
  );
  for (const [key, expected] of Object.entries(CONTROLLED_COMPARISON_POLICY)) {
    if (input[key] !== expected) {
      throw new TypeError(
        `baseline.comparison.${key} must be ${JSON.stringify(expected)}, observed ${JSON.stringify(input[key])}`,
      );
    }
  }
  return CONTROLLED_COMPARISON_POLICY;
}

function repositoryArtifactPath(value: unknown): string {
  const path = text(value, "baseline.source.rawArtifact");
  const normalized = normalize(path);
  if (
    isAbsolute(path) ||
    normalized !== path ||
    path.includes("\\") ||
    path === ".." ||
    path.startsWith("../")
  ) {
    throw new TypeError(
      "baseline.source.rawArtifact must be a normalized repository-relative path",
    );
  }
  return path;
}

export function parseControlledBaseline(value: unknown): ControlledRenderBaseline {
  const input = record(value, "baseline");
  exactKeys(
    input,
    [
      "schemaVersion",
      "renderProtocolVersion",
      "matrixId",
      "comparison",
      "source",
      "harness",
      "runner",
      "cells",
    ],
    "baseline",
  );
  if (input.schemaVersion !== CONTROLLED_BASELINE_SCHEMA_VERSION) {
    throw new TypeError(`stale controlled baseline schema: ${String(input.schemaVersion)}`);
  }
  if (input.renderProtocolVersion !== RENDER_PROTOCOL_VERSION) {
    throw new TypeError(`stale render protocol: ${String(input.renderProtocolVersion)}`);
  }
  if (input.matrixId !== MATRIX_IDS.render.full) {
    throw new TypeError(`stale controlled matrix: ${String(input.matrixId)}`);
  }
  const sourceInput = record(input.source, "baseline.source");
  exactKeys(sourceInput, ["commit", "rawArtifact", "rawSha256", "rounds"], "baseline.source");
  const rawSha256 = text(sourceInput.rawSha256, "baseline.source.rawSha256");
  if (!/^[a-f0-9]{64}$/u.test(rawSha256)) {
    throw new TypeError("baseline.source.rawSha256 must be a lowercase SHA-256 digest");
  }
  const source = {
    commit: text(sourceInput.commit, "baseline.source.commit"),
    rawArtifact: repositoryArtifactPath(sourceInput.rawArtifact),
    rawSha256,
    rounds: positiveInteger(sourceInput.rounds, "baseline.source.rounds"),
  };
  if (source.rounds < CONTROLLED_BASELINE_MINIMUM_ROUNDS) {
    throw new TypeError(
      `baseline.source.rounds must be at least ${CONTROLLED_BASELINE_MINIMUM_ROUNDS}`,
    );
  }
  if (!Array.isArray(input.cells)) throw new TypeError("baseline.cells must be an array");
  const expectedSamples = source.rounds * 3;
  const cells = input.cells.map((value, index): ControlledBaselineCell => {
    const path = `baseline.cells[${index}]`;
    const cell = record(value, path);
    exactKeys(cell, ["key", "samplesMs", "medianMs", "p95Ms", "observedMadMs"], path);
    if (!Array.isArray(cell.samplesMs)) throw new TypeError(`${path}.samplesMs must be an array`);
    const samplesMs = cell.samplesMs.map((sample, sampleIndex) =>
      finite(sample, `${path}.samplesMs[${sampleIndex}]`),
    );
    if (samplesMs.length !== expectedSamples) {
      throw new TypeError(`${path}.samplesMs must contain ${expectedSamples} raw samples`);
    }
    const summary = summarizeFinite(samplesMs);
    const medianMs = finite(cell.medianMs, `${path}.medianMs`);
    const p95Ms = finite(cell.p95Ms, `${path}.p95Ms`);
    const observedMadMs = finite(cell.observedMadMs, `${path}.observedMadMs`);
    if (medianMs !== summary.median || p95Ms !== summary.p95 || observedMadMs !== summary.mad) {
      throw new TypeError(`${path} statistics do not match raw samples`);
    }
    return {
      key: text(cell.key, `${path}.key`),
      samplesMs,
      medianMs,
      p95Ms,
      observedMadMs,
    };
  });
  validateExactMatrix(
    "controlled baseline",
    expectedControlledCellKeys(),
    cells.map((cell) => cell.key),
  );
  return {
    schemaVersion: CONTROLLED_BASELINE_SCHEMA_VERSION,
    renderProtocolVersion: RENDER_PROTOCOL_VERSION,
    matrixId: MATRIX_IDS.render.full,
    comparison: parseComparison(input.comparison),
    source,
    harness: parseHarness(input.harness),
    runner: parseRunner(input.runner),
    cells,
  };
}

export function validateControlledBaselineProvenance(
  value: ControlledRenderBaseline,
  repositoryRoot: string,
): RenderBenchmarkArtifact {
  const baseline = parseControlledBaseline(value);
  const rawPath = resolve(repositoryRoot, baseline.source.rawArtifact);
  const rawBytes = readFileSync(rawPath);
  const digest = createHash("sha256").update(rawBytes).digest("hex");
  if (digest !== baseline.source.rawSha256) {
    throw new Error(
      `baseline raw artifact checksum mismatch: expected ${baseline.source.rawSha256}, observed ${digest}`,
    );
  }
  const artifact = validateRenderGateArtifact(
    JSON.parse(rawBytes.toString("utf8")) as unknown,
    "full",
    {
      rounds: baseline.source.rounds,
    },
  );
  if (artifact.metadata.commit !== baseline.source.commit) {
    throw new Error(
      `baseline raw artifact commit mismatch: expected ${baseline.source.commit}, observed ${artifact.metadata.commit}`,
    );
  }
  const artifactRunner = {
    os: artifact.metadata.os,
    arch: artifact.metadata.arch,
    cpu: artifact.metadata.cpu,
    bun: artifact.metadata.bunVersion,
    node: artifact.metadata.nodeVersion,
    browser: artifact.metadata.browserVersion,
  };
  const baselineRunner = {
    os: baseline.runner.os,
    arch: baseline.runner.arch,
    cpu: baseline.runner.cpu,
    bun: baseline.runner.bun,
    node: baseline.runner.node,
    browser: baseline.runner.browser,
  };
  const runnerMismatches = fingerprintMismatches(
    baselineRunner,
    artifactRunner,
    "baseline raw runner",
  );
  if (runnerMismatches.length > 0) {
    throw new Error(`baseline raw artifact runner mismatch:\n${runnerMismatches.join("\n")}`);
  }
  const rawSamples = samplesByControlledCell(artifact);
  for (const cell of baseline.cells) {
    const samples = rawSamples.get(cell.key);
    if (!samples || JSON.stringify(samples) !== JSON.stringify(cell.samplesMs)) {
      throw new Error(`baseline ${cell.key} samples do not match checked-in raw artifact`);
    }
  }
  return artifact;
}

export function stableBaselineJson(value: ControlledRenderBaseline): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
