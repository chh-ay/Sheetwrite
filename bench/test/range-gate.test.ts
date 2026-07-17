import { describe, expect, it } from "bun:test";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import {
  RANGE_AUTO_FIT_CHUNK_CELLS,
  RANGE_WORKLOADS,
  type RangeGateArtifact,
  type RangeStructuralResult,
  STRUCTURAL_METRICS,
  validateRangeArtifact,
} from "../src/range-gate.js";
import { summarize } from "../src/stats.js";

function result(workload: RangeStructuralResult["workload"]): RangeStructuralResult {
  const base: RangeStructuralResult = {
    rows: 10_000,
    workload,
    addressedCells: 10_000,
    timingSamplesMs: [1],
    timing: summarize([1]),
    heapDeltaBytes: 0,
    wasmDeltaBytes: 0,
    documentOperationCount: 1,
    jsPatchObjectCount: 1,
    ffiCalls: 2,
    maxTransferredArrayLength: 0,
    retainedRevisionPointsBefore: 0,
    retainedRevisionRectanglesBefore: 0,
    retainedRevisionPointsAfter: 0,
    retainedRevisionRectanglesAfter: 0,
    maxVisibleWindowCells: 0,
    autoFitChunkCellLimit: 0,
    visibleWindowRequests: 0,
    scheduledChunks: 0,
    historyBytes: 0,
    outputSentinel: "",
  };
  if (workload === "style merge and clear") {
    return {
      ...base,
      documentOperationCount: 2,
      jsPatchObjectCount: 2,
      maxTransferredArrayLength: 2,
    };
  }
  if (workload === "sparse setRange") return { ...base, addressedCells: 3, jsPatchObjectCount: 4 };
  if (workload === "dense setBlock") {
    return { ...base, addressedCells: 100, maxTransferredArrayLength: 100 };
  }
  if (workload === "clipboard bulk read") {
    return {
      ...base,
      documentOperationCount: 0,
      jsPatchObjectCount: 10_000,
      maxTransferredArrayLength: 30_001,
      outputSentinel: '["first",null]',
    };
  }
  if (workload === "datasource revision retention") {
    return {
      ...base,
      documentOperationCount: 3,
      jsPatchObjectCount: 5,
      retainedRevisionPointsBefore: 2,
      retainedRevisionRectanglesBefore: 2,
    };
  }
  if (workload === "large exact auto-fit") {
    return {
      ...base,
      maxTransferredArrayLength: RANGE_AUTO_FIT_CHUNK_CELLS,
      maxVisibleWindowCells: RANGE_AUTO_FIT_CHUNK_CELLS,
      autoFitChunkCellLimit: RANGE_AUTO_FIT_CHUNK_CELLS,
      visibleWindowRequests: 2,
      scheduledChunks: 2,
    };
  }
  return base;
}

function artifact(): RangeGateArtifact {
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.range.smoke,
    results: RANGE_WORKLOADS.map(result),
  };
}

describe("range structural gate", () => {
  it("accepts one complete finite smoke matrix", () => {
    expect(validateRangeArtifact(artifact(), "smoke").results).toHaveLength(RANGE_WORKLOADS.length);
  });

  it("requires finite non-negative integer values for every structural metric", () => {
    for (const metric of STRUCTURAL_METRICS) {
      const candidate = structuredClone(artifact()) as unknown as {
        results: Array<Record<string, unknown>>;
      };
      Reflect.deleteProperty(candidate.results[0]!, metric);
      expect(() =>
        validateRangeArtifact(candidate as unknown as RangeGateArtifact, "smoke"),
      ).toThrow(metric);
    }

    for (const [metric, value, message] of [
      ["heapDeltaBytes", Number.NaN, "finite and non-negative"],
      ["ffiCalls", 1.5, "must be an integer"],
      ["historyBytes", -1, "finite and non-negative"],
    ] as const) {
      const candidate = structuredClone(artifact()) as unknown as {
        results: Array<Record<string, unknown>>;
      };
      candidate.results[0]![metric] = value;
      expect(() =>
        validateRangeArtifact(candidate as unknown as RangeGateArtifact, "smoke"),
      ).toThrow(message);
    }
  });

  it("fails closed on incomplete matrices, retained revisions, and oversized auto-fit windows", () => {
    const incomplete = artifact();
    expect(() =>
      validateRangeArtifact({ ...incomplete, results: incomplete.results.slice(1) }, "smoke"),
    ).toThrow(/missing 10000:style merge and clear/);

    const retained = artifact();
    const retainedResults = retained.results.map((entry) =>
      entry.workload === "datasource revision retention"
        ? { ...entry, retainedRevisionRectanglesAfter: 1 }
        : entry,
    );
    expect(() => validateRangeArtifact({ ...retained, results: retainedResults }, "smoke")).toThrow(
      /retained revision rectangles/,
    );

    const staleLimit = artifact();
    const staleLimitResults = staleLimit.results.map((entry) =>
      entry.workload === "large exact auto-fit"
        ? { ...entry, autoFitChunkCellLimit: RANGE_AUTO_FIT_CHUNK_CELLS + 1 }
        : entry,
    );
    expect(() =>
      validateRangeArtifact({ ...staleLimit, results: staleLimitResults }, "smoke"),
    ).toThrow(/reported a stale auto-fit chunk-cell limit/);

    const oversized = artifact();
    const oversizedResults = oversized.results.map((entry) =>
      entry.workload === "large exact auto-fit"
        ? { ...entry, maxVisibleWindowCells: RANGE_AUTO_FIT_CHUNK_CELLS + 1 }
        : entry,
    );
    expect(() =>
      validateRangeArtifact({ ...oversized, results: oversizedResults }, "smoke"),
    ).toThrow(/exceeded the auto-fit chunk-cell limit/);
  });
});
