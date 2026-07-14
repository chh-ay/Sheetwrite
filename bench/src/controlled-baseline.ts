import type { ControlledRunnerFingerprint, HarnessFingerprint } from "./gate-protocol.js";
import { MATRIX_IDS, validateExactMatrix } from "./gate-protocol.js";
import { validateRenderGateArtifact } from "./render-gate.js";
import {
  RENDER_PROTOCOL_VERSION,
  RENDER_SCENARIOS,
  type RenderBenchmarkArtifact,
  type SuccessfulScenario,
} from "./render-protocol.js";
import { summarizeFinite } from "./stats.js";

export const CONTROLLED_BASELINE_SCHEMA_VERSION = 1 as const;
export const CONTROLLED_BASELINE_MINIMUM_ROUNDS = 10;
export const DEFAULT_REGRESSION_RATIO_LIMIT = 1.2;
export const DEFAULT_TIMER_FLOOR_MS = 0.05;

export interface ControlledBaselineCell {
  readonly key: string;
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly observedMadMs: number;
  readonly ratioLimit: number;
  readonly absoluteFloorMs: number;
}

export interface ControlledRenderBaseline {
  readonly schemaVersion: typeof CONTROLLED_BASELINE_SCHEMA_VERSION;
  readonly renderProtocolVersion: typeof RENDER_PROTOCOL_VERSION;
  readonly matrixId: typeof MATRIX_IDS.render.full;
  readonly source: {
    readonly commit: string;
    readonly rawArtifact: string;
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
        ratioLimit: DEFAULT_REGRESSION_RATIO_LIMIT,
        absoluteFloorMs: Math.max(DEFAULT_TIMER_FLOOR_MS, summary.mad * 3),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    schemaVersion: CONTROLLED_BASELINE_SCHEMA_VERSION,
    renderProtocolVersion: RENDER_PROTOCOL_VERSION,
    matrixId: MATRIX_IDS.render.full,
    source: {
      commit: artifact.metadata.commit,
      rawArtifact,
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

export function parseControlledBaseline(value: unknown): ControlledRenderBaseline {
  const input = record(value, "baseline");
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
  const source = {
    commit: text(sourceInput.commit, "baseline.source.commit"),
    rawArtifact: text(sourceInput.rawArtifact, "baseline.source.rawArtifact"),
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
    const ratioLimit = finite(cell.ratioLimit, `${path}.ratioLimit`, 1);
    const absoluteFloorMs = finite(cell.absoluteFloorMs, `${path}.absoluteFloorMs`);
    if (ratioLimit <= 1) throw new TypeError(`${path}.ratioLimit must be greater than one`);
    if (medianMs !== summary.median || p95Ms !== summary.p95 || observedMadMs !== summary.mad) {
      throw new TypeError(`${path} statistics do not match raw samples`);
    }
    if (absoluteFloorMs < Math.max(DEFAULT_TIMER_FLOOR_MS, observedMadMs * 3)) {
      throw new TypeError(`${path}.absoluteFloorMs does not cover observed noise`);
    }
    return {
      key: text(cell.key, `${path}.key`),
      samplesMs,
      medianMs,
      p95Ms,
      observedMadMs,
      ratioLimit,
      absoluteFloorMs,
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
    source,
    harness: parseHarness(input.harness),
    runner: parseRunner(input.runner),
    cells,
  };
}

export function stableBaselineJson(value: ControlledRenderBaseline): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
