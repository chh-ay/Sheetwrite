import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SEED } from "./dataset.js";
import { RENDER_PROTOCOL_VERSION } from "./render-protocol.js";
import type { Stat } from "./stats.js";
import { summarize } from "./stats.js";

export const PERFORMANCE_GATE_PROTOCOL_VERSION = 1 as const;
export type BenchmarkMode = "full" | "smoke";

export const MATRIX_IDS = {
  data: {
    full: "data-full-v1",
    smoke: "data-smoke-v1",
  },
  paged: {
    full: "paged-full-v1",
    smoke: "paged-smoke-v1",
  },
  formula: {
    full: "formula-full-v1",
    smoke: "formula-smoke-v1",
  },
  render: {
    full: "render-full-v1",
    smoke: "render-smoke-v1",
  },
} as const;

export interface GateIdentity {
  readonly protocolVersion: typeof PERFORMANCE_GATE_PROTOCOL_VERSION;
  readonly mode: BenchmarkMode;
  readonly matrixId: string;
}

export interface MatrixValidation {
  readonly expectedKeys: readonly string[];
  readonly observedKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly duplicateKeys: readonly string[];
  readonly unexpectedKeys: readonly string[];
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

/** Validate an exact result matrix. Every diagnostic contains the canonical key. */
export function validateExactMatrix(
  family: string,
  expected: readonly string[],
  observed: readonly string[],
): MatrixValidation {
  const expectedKeys = sorted(expected);
  const observedKeys = sorted(observed);
  const expectedSet = new Set(expectedKeys);
  if (expectedSet.size !== expectedKeys.length) {
    throw new Error(`${family} expected matrix contains duplicate keys`);
  }

  const counts = new Map<string, number>();
  for (const key of observedKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const missingKeys = expectedKeys.filter((key) => !counts.has(key));
  const duplicateKeys = sorted([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  const unexpectedKeys = sorted([...counts.keys()].filter((key) => !expectedSet.has(key)));
  const diagnostics = [
    ...missingKeys.map((key) => `missing ${key}`),
    ...duplicateKeys.map((key) => `duplicate ${key}`),
    ...unexpectedKeys.map((key) => `unexpected ${key}`),
  ];
  if (diagnostics.length > 0) {
    throw new Error(`${family} matrix is not exact: ${diagnostics.join("; ")}`);
  }
  return { expectedKeys, observedKeys, missingKeys, duplicateKeys, unexpectedKeys };
}

export function assertGateIdentity(
  family: keyof typeof MATRIX_IDS,
  mode: BenchmarkMode,
  value: GateIdentity,
): void {
  if (value.protocolVersion !== PERFORMANCE_GATE_PROTOCOL_VERSION) {
    throw new Error(
      `${family} stale protocol: expected ${PERFORMANCE_GATE_PROTOCOL_VERSION}, observed ${String(value.protocolVersion)}`,
    );
  }
  if (value.mode !== mode) {
    throw new Error(`${family} mode mismatch: expected ${mode}, observed ${String(value.mode)}`);
  }
  const matrixId = MATRIX_IDS[family][mode];
  if (value.matrixId !== matrixId) {
    throw new Error(
      `${family} stale matrix: expected ${matrixId}, observed ${String(value.matrixId)}`,
    );
  }
}

export function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be finite and non-negative`);
  }
}

export function validateStat(stat: Stat, path: string): void {
  for (const field of ["median", "p95", "mean", "stddev", "min", "max"] as const) {
    assertFiniteNonNegative(stat[field], `${path}.${field}`);
  }
  if (!Number.isInteger(stat.iters) || stat.iters <= 0) {
    throw new Error(`${path}.iters must prove a non-empty sample`);
  }
  if (
    stat.min > stat.median ||
    stat.median > stat.p95 ||
    stat.p95 > stat.max ||
    stat.mean < stat.min ||
    stat.mean > stat.max
  ) {
    throw new Error(`${path} contains an impossible finite summary`);
  }
}

/** Require raw evidence and prove its persisted summary is derived, not trusted. */
export function validateRawStat(samples: readonly number[], stat: Stat, path: string): void {
  if (samples.length === 0) throw new Error(`${path} has an empty sample`);
  for (const [index, sample] of samples.entries()) {
    assertFiniteNonNegative(sample, `${path}.samples[${index}]`);
  }
  validateStat(stat, `${path}.stat`);
  const actual = summarize(samples);
  for (const field of ["median", "p95", "mean", "stddev", "min", "max", "iters"] as const) {
    const observed = stat[field];
    if (observed !== actual[field]) {
      throw new Error(
        `${path}.stat.${field} does not match raw samples: expected ${actual[field]}, observed ${observed}`,
      );
    }
  }
}

export interface HarnessFingerprint {
  readonly digest: string;
  readonly protocol: string;
  readonly matrix: string;
  readonly dataset: string;
  readonly sampling: string;
  readonly schema: string;
  readonly sources: Readonly<Record<string, string>>;
}

export interface ControlledRunnerFingerprint {
  readonly os: string;
  readonly arch: string;
  readonly cpu: string;
  readonly bun: string;
  readonly node: string;
  readonly browser: string;
  readonly powerMode: string;
  readonly concurrency: number;
}

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const HARNESS_SOURCE_FILES = [
  "bench/package.json",
  "bench/src/check.ts",
  "bench/src/controlled-baseline.ts",
  "bench/src/data-bench.ts",
  "bench/src/dataset.ts",
  "bench/src/dom-setup.ts",
  "bench/src/formula-bench.ts",
  "bench/src/formula-dataset.ts",
  "bench/src/gate-protocol.ts",
  "bench/src/generate-baseline.ts",
  "bench/src/handsontable-runtime.ts",
  "bench/src/paged-bench.ts",
  "bench/src/range-bench.ts",
  "bench/src/render-bench.html",
  "bench/src/render-bench.ts",
  "bench/src/render-driver.ts",
  "bench/src/render-gate.ts",
  "bench/src/render-protocol.ts",
  "bench/src/render-scenarios.ts",
  "bench/src/stats.ts",
  "bench/src/verify.ts",
  "bun.lock",
] as const;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function computeHarnessFingerprint(
  matrix: string,
  sampling: string,
  root = REPOSITORY_ROOT,
): HarnessFingerprint {
  const sources: Record<string, string> = {};
  for (const relativePath of HARNESS_SOURCE_FILES) {
    sources[relativePath] = sha256(readFileSync(resolve(root, relativePath)));
  }
  const protocol = `performance=${PERFORMANCE_GATE_PROTOCOL_VERSION};render=${RENDER_PROTOCOL_VERSION}`;
  const dataset = `seed=0x${DEFAULT_SEED.toString(16)};schema=id,date,customer,city,amount`;
  const schema = "typed-render-artifact-v1;controlled-baseline-v1";
  const payload = JSON.stringify({ protocol, matrix, dataset, sampling, schema, sources });
  return { digest: sha256(payload), protocol, matrix, dataset, sampling, schema, sources };
}

export function currentRunnerFingerprint(
  browser: string,
  powerMode: string,
  concurrency: number,
): ControlledRunnerFingerprint {
  if (powerMode.trim().length === 0) throw new Error("controlled runner power mode is required");
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("controlled runner concurrency must be a positive integer");
  }
  return {
    os: `${process.platform} ${release()}`,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    bun: Bun.version,
    node: process.versions.node,
    browser,
    powerMode,
    concurrency,
  };
}

function flattenFingerprint(value: unknown, path: string, output: Record<string, unknown>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      flattenFingerprint(nested, `${path}.${key}`, output);
    }
    return;
  }
  output[path] = value;
}

export function fingerprintMismatches<T extends object>(
  expected: T,
  observed: T,
  prefix: string,
): string[] {
  const left: Record<string, unknown> = {};
  const right: Record<string, unknown> = {};
  flattenFingerprint(expected, prefix, left);
  flattenFingerprint(observed, prefix, right);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return sorted(
    [...keys]
      .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
      .map(
        (key) =>
          `${key}: expected ${JSON.stringify(left[key])}, observed ${JSON.stringify(right[key])}`,
      ),
  );
}
