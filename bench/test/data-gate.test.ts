import { describe, expect, test } from "bun:test";
import {
  type DataBenchmarkResult,
  type EngineResult,
  expectedDataMatrixKeys,
  SHEETWRITE_ROWS,
  validateDataBenchmark,
  WORKLOADS,
} from "../src/data-bench.js";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import { type Stat, summarize } from "../src/stats.js";

interface FixtureOptions {
  readonly omitWorkload?: string;
  readonly duplicateRow?: boolean;
  readonly unexpectedWorkload?: boolean;
  readonly invalidP95?: boolean;
  readonly impossibleSummary?: boolean;
  readonly omitMemory?: boolean;
  readonly invalidQueryResources?: boolean;
}

function engineResult(rows: number, options: FixtureOptions = {}): EngineResult {
  const base = summarize([1, 2, 3]);
  const statsByKey: Record<string, Stat> = {};
  for (const workload of WORKLOADS) {
    if (workload === options.omitWorkload) continue;
    statsByKey[workload] = {
      ...base,
      p95: options.invalidP95 && workload === "ingest" ? Number.POSITIVE_INFINITY : base.p95,
      median: options.impossibleSummary && workload === "ingest" ? 4 : base.median,
    };
  }
  if (options.unexpectedWorkload) statsByKey.notDeclared = summarize([1]);
  const stats = statsByKey as EngineResult["stats"];
  const rowWithoutMemory = {
    rows,
    stats,
    notes: {},
    queryResources: {
      composedFilterMatches: 500,
      containsCacheConstructions: options.invalidQueryResources ? rows : 2,
      lowDistinctCount: 7,
      highDistinctCount: rows,
      ownedDistinctStrings: rows + 7,
    },
  };
  if (options.omitMemory) {
    const incompleteRow = rowWithoutMemory as EngineResult;
    return incompleteRow;
  }
  return {
    ...rowWithoutMemory,
    memory: { heapDeltaBytes: 1024, wasmDeltaBytes: 2048 },
  };
}

function smokeFixture(options: FixtureOptions = {}): DataBenchmarkResult {
  const row = engineResult(1_000, options);
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "smoke",
    matrixId: MATRIX_IDS.data.smoke,
    meta: {
      bun: "test",
      platform: "linux",
      arch: "x64",
      commit: "0".repeat(40),
    dirty: false,
    timestamp: new Date(0).toISOString(),
    sheetwriteRows: [1_000],
      handsontableRows: [],
    },
    sheetwrite: options.duplicateRow ? { "1000": row, "01000": row } : { "1000": row },
    handsontable: {},
  };
}

describe("data benchmark exact matrix", () => {
  test("accepts only the complete smoke matrix", () => {
    expect(() => validateDataBenchmark(smokeFixture(), "smoke")).not.toThrow();
  });

  test("rejects missing, duplicate, unexpected, and non-finite cells with canonical keys", () => {
    expect(() => validateDataBenchmark(smokeFixture({ omitWorkload: "ingest" }), "smoke")).toThrow(
      "missing engine=sheetwrite;rows=1000;metric=ingest",
    );
    expect(() => validateDataBenchmark(smokeFixture({ omitMemory: true }), "smoke")).toThrow(
      "missing engine=sheetwrite;rows=1000;metric=memory",
    );
    expect(() => validateDataBenchmark(smokeFixture({ duplicateRow: true }), "smoke")).toThrow(
      "duplicate engine=sheetwrite;rows=1000;metric=ingest",
    );
    expect(() =>
      validateDataBenchmark(smokeFixture({ unexpectedWorkload: true }), "smoke"),
    ).toThrow("unexpected engine=sheetwrite;rows=1000;metric=notDeclared");
    expect(() => validateDataBenchmark(smokeFixture({ invalidP95: true }), "smoke")).toThrow(
      "engine=sheetwrite;rows=1000;metric=ingest.stat.p95 must be finite",
    );
    expect(() => validateDataBenchmark(smokeFixture({ impossibleSummary: true }), "smoke")).toThrow(
      "engine=sheetwrite;rows=1000;metric=ingest.stat contains an impossible finite summary",
    );
  });

  test("requires bounded query resources and exact distinct sentinels", () => {
    expect(() =>
      validateDataBenchmark(smokeFixture({ invalidQueryResources: true }), "smoke"),
    ).toThrow("query resource counters violate structural bounds");
  });

  test("rejects a corrupted independent query-resource sentinel", () => {
    const candidate = structuredClone(smokeFixture()) as unknown as {
      sheetwrite: Record<string, { queryResources: Record<string, unknown> }>;
    };
    candidate.sheetwrite["1000"]!.queryResources.composedFilterMatches = 0;
    expect(() =>
      validateDataBenchmark(candidate as unknown as DataBenchmarkResult, "smoke"),
    ).toThrow("query resource counters violate structural bounds");
  });

  test("keeps full and smoke matrices distinct", () => {
    expect(expectedDataMatrixKeys("full").length).toBeGreaterThan(
      SHEETWRITE_ROWS.length * WORKLOADS.length,
    );
    expect(() => validateDataBenchmark(smokeFixture(), "full")).toThrow("data mode mismatch");
  });
});
