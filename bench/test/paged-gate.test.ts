import { describe, expect, test } from "bun:test";
import { MATRIX_IDS, PERFORMANCE_GATE_PROTOCOL_VERSION } from "../src/gate-protocol.js";
import {
  PAGED_FULL_ROWS,
  PAGED_SMOKE_ROWS,
  type PagedBenchmarkResult,
  type PagedScenario,
  type PagedTimingResult,
  validatePagedBenchmark,
} from "../src/paged-bench.js";
import { summarize } from "../src/stats.js";

interface FixtureOptions {
  readonly omitTiming?: string;
  readonly duplicateProbe?: boolean;
  readonly unexpectedProbe?: boolean;
  readonly invalidWasm?: boolean;
  readonly protocolVersion?: number;
}

function smokeFixture(options: FixtureOptions = {}): PagedBenchmarkResult {
  const timing = (): PagedTimingResult => ({ samplesMs: [1, 2], stat: summarize([1, 2]) });
  const timingsByKey: Record<string, PagedTimingResult> = {
    startup: timing(),
    "first-page": timing(),
    "distant-page": timing(),
  };
  if (options.omitTiming) delete timingsByKey[options.omitTiming];
  const timings = timingsByKey as PagedBenchmarkResult["timings"];
  const probes: Array<{
    scenario: string;
    wasmDeltaBytes: number;
    chunks: number;
    loadedCells: number;
    dirtyCells: number;
    allocatedBytes: number;
    fullyLoaded: boolean;
  }> = [
    {
      scenario: "empty",
      wasmDeltaBytes: options.invalidWasm ? Number.NaN : 1024,
      chunks: 0,
      loadedCells: 0,
      dirtyCells: 0,
      allocatedBytes: 0,
      fullyLoaded: false,
    },
    {
      scenario: "viewport",
      wasmDeltaBytes: 1024,
      chunks: 5,
      loadedCells: 150,
      dirtyCells: 0,
      allocatedBytes: 271_360,
      fullyLoaded: false,
    },
    {
      scenario: "dirty",
      wasmDeltaBytes: 1024,
      chunks: 15,
      loadedCells: 100,
      dirtyCells: 100,
      allocatedBytes: 814_080,
      fullyLoaded: false,
    },
  ];
  if (options.duplicateProbe) probes.push({ ...probes[0]! });
  if (options.unexpectedProbe) probes.push({ ...probes[0]!, scenario: "not-declared" });
  const typedProbes = probes as Array<(typeof probes)[number] & { scenario: PagedScenario }>;
  return {
    protocolVersion: (options.protocolVersion ?? PERFORMANCE_GATE_PROTOCOL_VERSION) as 1,
    mode: "smoke",
    matrixId: MATRIX_IDS.paged.smoke,
    rows: PAGED_SMOKE_ROWS,
    columns: 5,
    runs: 2,
    pageRows: 120,
    cacheBudgetBytes: 32 * 1024 * 1024,
    denseLogicalBytes: PAGED_SMOKE_ROWS * 5 * (1 + 8 + 4),
    timings,
    peakAllocatedBytes: 542_720,
    peakChunks: 10,
    probes: typedProbes,
  };
}

function fullFixture(): PagedBenchmarkResult {
  const samplesMs = Array.from({ length: 12 }, () => 1);
  const timing = (): PagedTimingResult => ({
    samplesMs: [...samplesMs],
    stat: summarize(samplesMs),
  });
  const probe = (scenario: PagedScenario, chunks: number, loadedCells: number, dirtyCells = 0) => ({
    scenario,
    wasmDeltaBytes: 65_536,
    chunks,
    loadedCells,
    dirtyCells,
    allocatedBytes: chunks * 54_272,
    fullyLoaded: false,
  });
  return {
    protocolVersion: PERFORMANCE_GATE_PROTOCOL_VERSION,
    mode: "full",
    matrixId: MATRIX_IDS.paged.full,
    rows: PAGED_FULL_ROWS,
    columns: 5,
    runs: 12,
    pageRows: 120,
    cacheBudgetBytes: 32 * 1024 * 1024,
    denseLogicalBytes: PAGED_FULL_ROWS * 5 * (1 + 8 + 4),
    timings: {
      startup: timing(),
      "first-page": timing(),
      "distant-page": timing(),
    },
    peakAllocatedBytes: 542_720,
    peakChunks: 10,
    probes: [
      probe("empty", 0, 0),
      probe("padding", 0, 0),
      probe("viewport", 5, 150),
      probe("scroll-1", 15, 50_000),
      probe("scroll-10", 125, 500_000),
      probe("scroll-100", 618, 2_513_728),
      probe("dirty", 100, 100, 100),
    ],
  };
}

describe("paged benchmark exact matrix", () => {
  test("accepts the complete declared smoke matrix", () => {
    expect(() => validatePagedBenchmark(smokeFixture(), "smoke")).not.toThrow();
  });

  test("requires the exact cache-bounded full traversal evidence", () => {
    const source = fullFixture();
    expect(() => validatePagedBenchmark(source, "full")).not.toThrow();
    const corrupted = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.scenario === "scroll-100" ? { ...probe, loadedCells: 2_513_727 } : probe,
      ),
    };
    expect(() => validatePagedBenchmark(corrupted, "full")).toThrow(
      "rows=1000000;probe=scroll-100 does not match the cache-bounded full traversal",
    );
  });

  test("rejects missing, duplicate, unexpected, and non-finite cells by key", () => {
    expect(() => validatePagedBenchmark(smokeFixture({ omitTiming: "startup" }), "smoke")).toThrow(
      "missing rows=10000;workload=startup",
    );
    expect(() => validatePagedBenchmark(smokeFixture({ duplicateProbe: true }), "smoke")).toThrow(
      "duplicate rows=10000;probe=empty",
    );
    expect(() => validatePagedBenchmark(smokeFixture({ unexpectedProbe: true }), "smoke")).toThrow(
      "unexpected rows=10000;probe=not-declared",
    );
    expect(() => validatePagedBenchmark(smokeFixture({ invalidWasm: true }), "smoke")).toThrow(
      "rows=10000;probe=empty.wasmDeltaBytes must be finite",
    );
  });

  test("rejects resource counters outside cache and logical bounds", () => {
    const source = smokeFixture();
    const overBudget = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.scenario === "viewport"
          ? { ...probe, allocatedBytes: source.cacheBudgetBytes + 1 }
          : probe,
      ),
    };
    expect(() => validatePagedBenchmark(overBudget, "smoke")).toThrow(
      "rows=10000;probe=viewport resource counters violate",
    );

    const staleLoadFlag = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.scenario === "viewport" ? { ...probe, fullyLoaded: true } : probe,
      ),
    };
    expect(() => validatePagedBenchmark(staleLoadFlag, "smoke")).toThrow(
      "rows=10000;probe=viewport.fullyLoaded",
    );
  });

  test("rejects stale protocol and smoke evidence offered as full", () => {
    expect(() => validatePagedBenchmark(smokeFixture({ protocolVersion: 99 }), "smoke")).toThrow(
      "paged stale protocol",
    );
    expect(() => validatePagedBenchmark(smokeFixture(), "full")).toThrow("paged mode mismatch");
  });
});
