import {
  assertFiniteNonNegative,
  assertGateIdentity,
  type BenchmarkMode,
  type GateIdentity,
  validateExactMatrix,
  validateRawStat,
} from "./gate-protocol.js";
import type { Stat } from "./stats.js";
/** Protocol mirror; every real auto-fit result must report and match Grid's runtime limit. */
export const RANGE_AUTO_FIT_CHUNK_CELLS = 16_384;

export const RANGE_WORKLOADS = [
  "style merge and clear",
  "range clear",
  "sparse setRange",
  "dense setBlock",
  "datasource revision retention",
  "large exact auto-fit",
] as const;

export interface RangeStructuralResult {
  readonly rows: number;
  readonly workload: (typeof RANGE_WORKLOADS)[number];
  readonly addressedCells: number;
  readonly timingSamplesMs: readonly number[];
  readonly timing: Stat;
  readonly heapDeltaBytes: number;
  readonly wasmDeltaBytes: number;
  readonly documentOperationCount: number;
  readonly jsPatchObjectCount: number;
  readonly ffiCalls: number;
  readonly maxTransferredArrayLength: number;
  readonly retainedRevisionPointsBefore: number;
  readonly retainedRevisionRectanglesBefore: number;
  readonly retainedRevisionPointsAfter: number;
  readonly retainedRevisionRectanglesAfter: number;
  readonly maxVisibleWindowCells: number;
  readonly autoFitChunkCellLimit: number;
  readonly visibleWindowRequests: number;
  readonly scheduledChunks: number;
  readonly historyBytes: number;
}

export interface RangeGateArtifact extends GateIdentity {
  readonly results: readonly RangeStructuralResult[];
}

const STRUCTURAL_METRICS = [
  "addressedCells",
  "heapDeltaBytes",
  "wasmDeltaBytes",
  "documentOperationCount",
  "jsPatchObjectCount",
  "ffiCalls",
  "maxTransferredArrayLength",
  "retainedRevisionPointsBefore",
  "retainedRevisionRectanglesBefore",
  "retainedRevisionPointsAfter",
  "retainedRevisionRectanglesAfter",
  "maxVisibleWindowCells",
  "autoFitChunkCellLimit",
  "visibleWindowRequests",
  "scheduledChunks",
  "historyBytes",
] as const;

export function rangeResultKey(result: Pick<RangeStructuralResult, "rows" | "workload">): string {
  return `${result.rows}:${result.workload}`;
}

export function validateRangeArtifact(
  artifact: RangeGateArtifact,
  mode: BenchmarkMode,
): RangeGateArtifact {
  assertGateIdentity("range", mode, artifact);
  const rowCounts = mode === "smoke" ? [10_000] : [10_000, 100_000, 1_000_000];
  const expected = rowCounts.flatMap((rows) =>
    RANGE_WORKLOADS.map((workload) => `${rows}:${workload}`),
  );
  validateExactMatrix(
    "range",
    expected,
    artifact.results.map((result) => rangeResultKey(result)),
  );

  for (const result of artifact.results) {
    const path = `range.${rangeResultKey(result)}`;
    if (!Number.isInteger(result.rows) || result.rows <= 0) {
      throw new Error(`${path}.rows must be a positive integer`);
    }
    for (const metric of STRUCTURAL_METRICS) {
      const value = result[metric];
      assertFiniteNonNegative(value, `${path}.${metric}`);
      if (!Number.isInteger(value)) throw new Error(`${path}.${metric} must be an integer`);
    }
    validateRawStat(result.timingSamplesMs, result.timing, `${path}.timing`);
    if (result.retainedRevisionPointsAfter !== 0) {
      throw new Error(`${path} retained revision points after completion`);
    }
    if (result.retainedRevisionRectanglesAfter !== 0) {
      throw new Error(`${path} retained revision rectangles after completion`);
    }

    switch (result.workload) {
      case "style merge and clear":
        if (result.documentOperationCount !== 2 || result.jsPatchObjectCount !== 2) {
          throw new Error(`${path} must use exactly two compact range-style operations`);
        }
        if (result.maxTransferredArrayLength > 4) {
          throw new Error(`${path} transferred style arrays larger than the distinct-style bound`);
        }
        break;
      case "range clear":
        if (result.documentOperationCount !== 1 || result.jsPatchObjectCount !== 1) {
          throw new Error(`${path} must keep a dense clear to one operation object`);
        }
        if (result.maxTransferredArrayLength !== 0) {
          throw new Error(`${path} dense clear must not transfer a per-cell array`);
        }
        break;
      case "sparse setRange":
        if (result.documentOperationCount !== 1 || result.jsPatchObjectCount !== 4) {
          throw new Error(
            `${path} must allocate only one range patch plus three sparse cell patches`,
          );
        }
        break;
      case "dense setBlock":
        if (result.documentOperationCount !== 1 || result.jsPatchObjectCount !== 1) {
          throw new Error(`${path} must use one dense block operation`);
        }
        if (result.maxTransferredArrayLength !== result.addressedCells) {
          throw new Error(`${path} dense transfer length must equal its necessary block payload`);
        }
        break;
      case "datasource revision retention":
        if (
          result.retainedRevisionPointsBefore !== 2 ||
          result.retainedRevisionRectanglesBefore !== 2
        ) {
          throw new Error(
            `${path} must retain two sparse points and two dense rectangles in flight`,
          );
        }
        break;
      case "large exact auto-fit":
        if (result.autoFitChunkCellLimit !== RANGE_AUTO_FIT_CHUNK_CELLS) {
          throw new Error(`${path} reported a stale auto-fit chunk-cell limit`);
        }
        if (result.maxVisibleWindowCells > result.autoFitChunkCellLimit) {
          throw new Error(`${path} exceeded the auto-fit chunk-cell limit`);
        }
        if (result.visibleWindowRequests < 2 || result.scheduledChunks < 2) {
          throw new Error(`${path} did not prove yielded chunked auto-fit work`);
        }
        break;
    }
  }
  return artifact;
}
